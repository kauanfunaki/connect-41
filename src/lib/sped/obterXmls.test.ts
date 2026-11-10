import { afterEach, describe, expect, it, vi } from "vitest";
import { ErroDoSped, obterXmls } from "./client";

// O motor falso da rota de XML em lote (contrato de 10/11/2026), sem rede.
const CREDS = { baseUrl: "https://motor.exemplo", token: "t-leitura" };
const DOCS = [
  { tipo: "nfe" as const, identificador: "35261011222333000181550010000000011234567890" },
  { tipo: "nfse" as const, identificador: "nfse-77" },
];

function motor(resposta: Response | Error) {
  const chamadas: { url: string; init: RequestInit }[] = [];
  vi.stubGlobal("fetch", vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
    chamadas.push({ url: String(url), init: init ?? {} });
    if (resposta instanceof Error) throw resposta;
    return resposta;
  }));
  return chamadas;
}

afterEach(() => { vi.unstubAllGlobals(); });

describe("obterXmls", () => {
  it("faz POST com o token de leitura, a raiz e os pares, e lê os contadores dos cabeçalhos", async () => {
    const chamadas = motor(new Response(new Uint8Array([80, 75, 5, 6]), {
      status: 200,
      headers: { "Content-Type": "application/zip", "X-Documentos-Pedidos": "2", "X-Documentos-No-Zip": "1", "X-Sem-Xml": "1", "X-Nao-Encontrados": "0" },
    }));
    const r = await obterXmls(CREDS, "11222333", DOCS);
    expect(chamadas).toHaveLength(1);
    expect(chamadas[0].url).toBe("https://motor.exemplo/api/integracao/documentos/xml");
    expect(chamadas[0].init.method).toBe("POST");
    expect((chamadas[0].init.headers as Record<string, string>).Authorization).toBe("Bearer t-leitura");
    expect(JSON.parse(String(chamadas[0].init.body))).toEqual({ cnpj_raiz: "11222333", documentos: DOCS });
    expect(r).toMatchObject({ pedidos: 2, noZip: 1, semXml: 1, naoEncontrados: 0 });
    expect(Array.from(r.bytes)).toEqual([80, 75, 5, 6]);
  });

  it("sem os cabeçalhos, conta pelo que pediu", async () => {
    motor(new Response(new Uint8Array([1]), { status: 200 }));
    const r = await obterXmls(CREDS, "11222333", DOCS);
    expect(r).toMatchObject({ pedidos: 2, noZip: 2, semXml: 0, naoEncontrados: 0 });
  });

  it("cabeçalho que não é número não vira NaN", async () => {
    motor(new Response(new Uint8Array([1]), { status: 200, headers: { "X-Sem-Xml": "talvez", "X-Nao-Encontrados": "1" } }));
    const r = await obterXmls(CREDS, "11222333", DOCS);
    expect(r).toMatchObject({ semXml: 0, naoEncontrados: 1, noZip: 1 });
  });

  it("404 é o motor sem a rota", async () => {
    motor(new Response(JSON.stringify({ detail: "Not Found" }), { status: 404, headers: { "Content-Type": "application/json" } }));
    const erro = await obterXmls(CREDS, "11222333", DOCS).catch((e) => e);
    expect(erro).toBeInstanceOf(ErroDoSped);
    expect(erro).toMatchObject({ status: 404, codigo: "rota_de_xml_ausente" });
  });

  it("401 e 400 preservam o status e o código", async () => {
    motor(new Response(JSON.stringify({ detail: { erro: "token_invalido" } }), { status: 401 }));
    expect(await obterXmls(CREDS, "11222333", DOCS).catch((e) => e)).toMatchObject({ status: 401, codigo: "token_invalido" });
    motor(new Response("corpo ruim", { status: 400 }));
    expect(await obterXmls(CREDS, "11222333", DOCS).catch((e) => e)).toMatchObject({ status: 400, codigo: null });
    // O formato do motor (sped_generator#64): `detail.erro` com o código, e a mensagem ao lado.
    motor(new Response(JSON.stringify({ detail: { erro: "quantidade_invalida", mensagem: "de 1 a 500 documentos" } }), { status: 400 }));
    expect(await obterXmls(CREDS, "11222333", DOCS).catch((e) => e)).toMatchObject({ status: 400, codigo: "quantidade_invalida" });
  });

  it("falha de rede vira status 0, sem código", async () => {
    motor(new TypeError("fetch failed"));
    expect(await obterXmls(CREDS, "11222333", DOCS).catch((e) => e)).toMatchObject({ status: 0, codigo: null });
  });

  it("recusa antes de chamar: raiz inválida, nenhum documento ou mais de 500", async () => {
    const chamadas = motor(new Response(new Uint8Array([1])));
    await expect(obterXmls(CREDS, "112223", DOCS)).rejects.toBeInstanceOf(ErroDoSped);
    await expect(obterXmls(CREDS, "11222333", [])).rejects.toBeInstanceOf(ErroDoSped);
    await expect(obterXmls(CREDS, "11222333", Array.from({ length: 501 }, (_, i) => ({ tipo: "nfe" as const, identificador: String(i) })))).rejects.toBeInstanceOf(ErroDoSped);
    expect(chamadas).toHaveLength(0);
  });
});
