// Gabarito do leitor de XML de notas (scripts/contabil-core/gabarito_notas.py): cada chamada de
// `parse_nota_xml` da suíte do original e dos XML inventados (assinados por certificados de teste) dá
// aqui a mesma nota — inclusive o motivo da assinatura que não confere — ou a mesma recusa.

import { describe, expect, it } from "vitest";
import { conferirAssinatura } from "./assinatura";
import { arquivo, GERADO_EM, nomeDoArquivo, notaEsperada, notaObtida, registros, type Json } from "./gabarito/ler";
import { ehEventoNfe, lerDataHora, lerNotaXml, normalizarCnpj, NotaInvalida } from "./xml";
import { lerXml } from "./xmlArvore";

function rodar(conteudo: Uint8Array) {
  try {
    return { result: notaObtida(lerNotaXml(conteudo, { agora: GERADO_EM })) };
  } catch (e) {
    if (e instanceof NotaInvalida) return { error: { tipo: e.tipoPython, mensagem: e.message } };
    throw e;
  }
}

describe("lerNotaXml (gabarito de parse_nota_xml)", () => {
  const casos = registros("xml.parse_nota_xml");

  it("o gabarito cobre a suíte e os XML inventados", () => {
    expect(casos.length).toBeGreaterThan(150);
    const resultados = casos.map((r) => (r.error ? r.error.mensagem : String((r.result as Record<string, Json>).assinatura_nao_verificada)));
    // Os desfechos da assinatura que importam estão todos lá.
    for (const motivo of ["null", "documento sem assinatura XML", "assinatura sem certificado X.509", "InvalidDigest", "InvalidSignature", "InvalidCertificate", "InvalidInput", "DocumentInvalid", "C14NError", "XMLSyntaxError"]) {
      expect(resultados.some((r) => r.includes(motivo)), motivo).toBe(true);
    }
  });

  it.each(casos.map((r) => [nomeDoArquivo(r.args[0]), r] as const))("%s", (_nome, r) => {
    const obtido = rodar(arquivo(r.args[0]));
    if (r.error) expect(obtido).toEqual({ error: r.error });
    else expect(obtido).toEqual({ result: notaEsperada(r.result!) });
  });
});

describe("funções internas do leitor de XML", () => {
  it.each(registros("xml._parse_datetime").map((r) => [JSON.stringify(r.args[0]), r] as const))("_parse_datetime(%s)", (_n, r) => {
    const esperado = r.result === null ? null : (r.result as { $dt: string }).$dt;
    expect(lerDataHora(r.args[0] as string | null)).toBe(esperado);
  });

  it.each(registros("xml._normalizar_cnpj").map((r) => [JSON.stringify(r.args[0]), r] as const))("_normalizar_cnpj(%s)", (_n, r) => {
    expect(normalizarCnpj(r.args[0] as string | null)).toBe(r.result);
  });

  it.each(registros("xml._is_evento_nfe").map((r) => [String(r.args[0]).slice(0, 40), r] as const))("_is_evento_nfe(%s)", (_n, r) => {
    expect(ehEventoNfe(lerXml(new TextEncoder().encode(r.args[0] as string)))).toBe(r.result);
  });

  it.each(registros("xml._validar_assinatura").map((r) => [nomeDoArquivo(r.args[0]), r] as const))("_validar_assinatura(%s)", (_n, r) => {
    const conteudo = arquivo(r.args[0]);
    expect(conferirAssinatura(conteudo, lerXml(conteudo), r.args[1] as string, GERADO_EM)).toBe(r.result);
  });
});

describe("recusas que o porte trata diferente do original", () => {
  it("codificação desconhecida: o original deixa escapar LookupError; aqui é NotaInvalida com a mesma frase", () => {
    const r = registros("xml.parse_nota_xml").find((x) => x.error?.tipo === "LookupError");
    expect(r).toBeDefined();
    expect(() => lerNotaXml(arquivo(r!.args[0]))).toThrow(new NotaInvalida(r!.error!.mensagem));
  });

  it("DTD em UTF-16 (que escapa da busca nos bytes) é recusado com a frase do DTD", () => {
    const xml = new Uint8Array(Buffer.from("\ufeff<!DOCTYPE a><NFe/>", "utf16le"));
    expect(() => lerNotaXml(xml)).toThrow("XML com DTD ou declaração de entidade não é permitido.");
  });
});
