import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import resposta2027 from "./gabarito/resposta-2027.json";
import aliquotaUniao2026 from "./gabarito/aliquota-uniao-2026.json";
import aliquotaUniao2027 from "./gabarito/aliquota-uniao-2027-404.json";

vi.mock("server-only", () => ({}));

const { aliquotasDeReferencia, calcularNaReceita, calculadoraConfigurada, descreverCodigo, enderecoAceitoPeloServico, ufsDaCalculadora } = await import("./calculadoraServidor");

const pedido = {
  id: "p",
  versao: "1.0.0" as const,
  dhFatoGerador: "2027-03-10T12:00:00-03:00",
  municipio: 4314902,
  uf: "RS",
  itens: [{ numero: 1, cst: "000", cClassTrib: "000001", baseCalculo: 100 }],
};

const json = (corpo: unknown, status = 200, cabecalhos: Record<string, string> = {}) =>
  new Response(JSON.stringify(corpo), { status, headers: { "content-type": "application/json", ...cabecalhos } });

describe("cliente da calculadora", () => {
  const fetchOriginal = globalThis.fetch;
  beforeEach(() => {
    vi.stubEnv("CALCULADORA_RTC_URL", "http://calculadora-rtc:8080");
  });
  afterEach(() => {
    globalThis.fetch = fetchOriginal;
    vi.unstubAllEnvs();
  });

  it("sem a variável, não chama a rede e diz que não está configurada", async () => {
    vi.stubEnv("CALCULADORA_RTC_URL", "");
    const espiao = vi.fn();
    globalThis.fetch = espiao;
    expect(calculadoraConfigurada()).toBe(false);
    expect(await calcularNaReceita(pedido)).toEqual({ ok: false, falha: "nao-configurada" });
    expect(espiao).not.toHaveBeenCalled();
  });

  it("calcula no endereço do serviço e marca o simulado", async () => {
    const espiao = vi.fn(async (url: string) => (url ? json(resposta2027, 200, { "x-warning-dados-simulados": "6" }) : json({})));
    globalThis.fetch = espiao as unknown as typeof fetch;
    const r = await calcularNaReceita(pedido);
    expect(espiao.mock.calls[0][0]).toBe("http://calculadora-rtc:8080/api/calculadora/observabilidade/regime-geral");
    expect(r.ok && r.dados.simulado).toBe(true);
    expect(r.ok && r.dados.totais.cbs).toBe(56.76);
  });

  it("422 é resposta: o erro da operação volta traduzido", async () => {
    globalThis.fetch = vi.fn(async () => json({ status: 422, errors: [{ code: "REG-018", pointer: "#/itens/-1" }] }, 422)) as unknown as typeof fetch;
    const r = await calcularNaReceita(pedido);
    expect(r.ok && r.dados.errosDaOperacao[0].titulo).toBe("Município de outra UF");
  });

  it("serviço fora do ar, 5xx e tempo esgotado viram falhas com nome", async () => {
    globalThis.fetch = vi.fn(async () => {
      throw new TypeError("fetch failed");
    }) as unknown as typeof fetch;
    vi.spyOn(console, "error").mockImplementation(() => {});
    expect(await calcularNaReceita(pedido)).toEqual({ ok: false, falha: "fora-do-ar" });
    globalThis.fetch = vi.fn(async () => json({}, 503)) as unknown as typeof fetch;
    expect(await calcularNaReceita(pedido)).toMatchObject({ ok: false, falha: "fora-do-ar", status: 503 });
    globalThis.fetch = vi.fn(async () => {
      throw new DOMException("tempo", "TimeoutError");
    }) as unknown as typeof fetch;
    expect(await calcularNaReceita(pedido)).toEqual({ ok: false, falha: "tempo-esgotado" });
  });

  it("alíquota de referência de 2027 (404) fica nula, sem erro", async () => {
    globalThis.fetch = vi.fn(async (url: string) =>
      String(url).includes("2026") ? json(aliquotaUniao2026) : json(aliquotaUniao2027, 404)
    ) as unknown as typeof fetch;
    expect(await aliquotasDeReferencia("2027-05-01", 43, 4314902)).toEqual({ ok: true, dados: { cbs: null, ibsUf: null, ibsMun: null } });
    const r2026 = await aliquotasDeReferencia("2026-05-01", null, null);
    expect(r2026).toEqual({ ok: true, dados: { cbs: 0.9, ibsUf: null, ibsMun: null } });
  });

  it("código que a Receita não conhece volta nulo", async () => {
    globalThis.fetch = vi.fn(async () => json({ title: "NCM não encontrada" }, 404)) as unknown as typeof fetch;
    expect(await descreverCodigo("ncm", "9999.99.99", "2026-11-19")).toEqual({ ok: true, dados: null });
  });

  it("as tabelas ficam na memória: a segunda consulta não vai à rede", async () => {
    const espiao = vi.fn(async () => json([{ sigla: "RS", nome: "RIO GRANDE DO SUL", codigo: 43 }]));
    globalThis.fetch = espiao as unknown as typeof fetch;
    const a = await ufsDaCalculadora();
    const b = await ufsDaCalculadora();
    expect(a).toEqual(b);
    expect(espiao).toHaveBeenCalledTimes(1);
  });
});

describe("endereço que o servidor da calculadora aceita (bug-799)", () => {
  // O Tomcat recusa com 400 o Host com sublinhado, e o nome interno do EasyPanel é "projeto_serviço".
  const resolver = vi.fn(async () => ({ address: "10.0.1.23", family: 4 }));

  it("nome com sublinhado vira o IP, com a mesma porta", async () => {
    expect(await enderecoAceitoPeloServico("http://app_calculadora-rtc:8080", resolver)).toBe("http://10.0.1.23:8080");
    expect(resolver).toHaveBeenCalledWith("app_calculadora-rtc");
  });

  it("IPv6 vai entre colchetes", async () => {
    const v6 = vi.fn(async () => ({ address: "fd00::5", family: 6 }));
    expect(await enderecoAceitoPeloServico("http://app_calculadora-rtc:8080", v6)).toBe("http://[fd00::5]:8080");
  });

  it("nome sem sublinhado e https ficam como estão, sem resolver", async () => {
    const espiao = vi.fn(resolver);
    expect(await enderecoAceitoPeloServico("http://calculadora-rtc:8080", espiao)).toBe("http://calculadora-rtc:8080");
    expect(await enderecoAceitoPeloServico("https://calc_rtc.exemplo.com", espiao)).toBe("https://calc_rtc.exemplo.com");
    expect(espiao).not.toHaveBeenCalled();
  });

  it("nome que não resolve é serviço fora do ar", async () => {
    vi.stubEnv("CALCULADORA_RTC_URL", "http://nao_existe.invalid:8080");
    vi.spyOn(console, "error").mockImplementation(() => {});
    expect(await calcularNaReceita(pedido)).toMatchObject({ ok: false, falha: "fora-do-ar" });
    vi.unstubAllEnvs();
  });
});
