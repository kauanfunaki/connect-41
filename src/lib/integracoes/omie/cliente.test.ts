import { describe, expect, it } from "vitest";

import { chamarOmie, conferirEmpresa, empresasDaResposta, ErroDoOmie, falhaDoOmie } from "./cliente";

const CRED = { appKey: "k", appSecret: "s" };

function fetchFalso(status: number, corpo: unknown) {
  const chamadas: { url: string; body: unknown }[] = [];
  const f = (async (url: string, init: RequestInit) => {
    chamadas.push({ url, body: JSON.parse(String(init.body)) });
    return new Response(JSON.stringify(corpo), { status });
  }) as unknown as typeof fetch;
  return { f, chamadas };
}

describe("chamarOmie", () => {
  it("monta a chamada no formato do Omie", async () => {
    const { f, chamadas } = fetchFalso(200, { ok: 1 });
    await chamarOmie(CRED, "geral/empresas", "ListarEmpresas", { pagina: 1 }, { fetch: f });
    expect(chamadas[0].url).toBe("https://app.omie.com.br/api/v1/geral/empresas/");
    expect(chamadas[0].body).toEqual({ call: "ListarEmpresas", app_key: "k", app_secret: "s", param: [{ pagina: 1 }] });
  });

  it("transforma o faultstring do Omie em erro legível", async () => {
    const { f } = fetchFalso(500, { faultstring: "ERROR: Chave de acesso inválida!", faultcode: "SOAP-ENV:Client-5" });
    await expect(chamarOmie(CRED, "geral/empresas", "ListarEmpresas", {}, { fetch: f })).rejects.toMatchObject({
      name: "ErroDoOmie",
      message: "ERROR: Chave de acesso inválida!",
      codigo: "SOAP-ENV:Client-5",
      http: 500,
    });
  });

  it("recusa módulo com caractere estranho — a URL não é montada com lixo", async () => {
    const { f } = fetchFalso(200, {});
    await expect(chamarOmie(CRED, "../geral", "X", {}, { fetch: f })).rejects.toThrow("Módulo do Omie inválido");
  });

  it("HTTP de erro sem faultstring também é erro", async () => {
    const { f } = fetchFalso(503, { algo: 1 });
    await expect(chamarOmie(CRED, "geral/empresas", "ListarEmpresas", {}, { fetch: f })).rejects.toBeInstanceOf(ErroDoOmie);
  });
});

describe("falhaDoOmie", () => {
  it("só reconhece corpo com faultstring", () => {
    expect(falhaDoOmie({ faultstring: " x " })).toEqual({ mensagem: "x", codigo: null });
    expect(falhaDoOmie({ empresas_cadastro: [] })).toBeNull();
    expect(falhaDoOmie(null)).toBeNull();
  });
});

describe("conferir a empresa da conta", () => {
  const corpo = {
    empresas_cadastro: [{ cnpj: "31.052.957/0001-05", razao_social: "041 CONTABILIDADE LTDA", nome_fantasia: "" }],
  };

  it("lê a lista e confere o CNPJ só por dígitos", () => {
    const empresas = empresasDaResposta(corpo);
    expect(empresas).toEqual([{ cnpj: "31052957000105", razaoSocial: "041 CONTABILIDADE LTDA", nomeFantasia: null }]);
    expect(conferirEmpresa(empresas, "31052957000105")).toMatchObject({ confere: true });
  });

  it("avisa quando a chave é de outra empresa, ou quando não há o que conferir", () => {
    const empresas = empresasDaResposta(corpo);
    const outra = conferirEmpresa(empresas, "11222333000181");
    expect(outra.confere).toBe(false);
    if (!outra.confere) expect(outra.aviso).toContain("outro CNPJ");
    expect(conferirEmpresa([], "11222333000181")).toMatchObject({ confere: false, empresa: null });
    expect(conferirEmpresa(empresas, null)).toMatchObject({ confere: false });
  });

  it("resposta com formato inesperado vira lista vazia, sem quebrar", () => {
    expect(empresasDaResposta({ outra_coisa: 1 })).toEqual([]);
    expect(empresasDaResposta("texto")).toEqual([]);
  });
});
