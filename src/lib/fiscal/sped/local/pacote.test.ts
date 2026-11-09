import { describe, expect, it } from "vitest";
import { FOLGA_DO_PACOTE, cabeNoBanco, ehPacoteGrandeDemais, mensagemDoPacoteGrande, serializarPacote } from "./pacote";

describe("serializarPacote", () => {
  it("chaves em ordem: o mesmo pacote dá os mesmos bytes e o mesmo hash", () => {
    const a = serializarPacote({ b: 1, a: { d: [2, { y: 1, x: 2 }], c: "é" } });
    const b = serializarPacote({ a: { c: "é", d: [2, { x: 2, y: 1 }] }, b: 1 });
    expect(Buffer.from(a.bytes).toString("utf8")).toBe('{"a":{"c":"é","d":[2,{"x":2,"y":1}]},"b":1}');
    expect(a.sha256).toBe(b.sha256);
  });
});

describe("pacote grande demais (06/11/2026)", () => {
  it("reconhece o MySQL acima do max_allowed_packet e a string do Node, também dentro do erro do Prisma", () => {
    expect(ehPacoteGrandeDemais(Object.assign(new Error("Got a packet bigger than 'max_allowed_packet' bytes"), { code: "ER_NET_PACKET_TOO_LARGE" }))).toBe(true);
    expect(ehPacoteGrandeDemais(new Error("query size (70000000) is >= to max_allowed_packet (67108864)"))).toBe(true);
    expect(ehPacoteGrandeDemais(new Error("Falha na consulta", { cause: Object.assign(new Error("(conn:12) erro"), { code: "ER_NET_PACKET_TOO_LARGE" }) }))).toBe(true);
    expect(ehPacoteGrandeDemais(new RangeError("Invalid string length"))).toBe(true);
  });

  it("confere o limite do banco antes de gravar, com folga para o resto da linha", () => {
    const limite = 64 * 1048576;
    expect(cabeNoBanco(10 * 1048576, limite)).toBe(true);
    expect(cabeNoBanco(limite - FOLGA_DO_PACOTE, limite)).toBe(false);
    expect(cabeNoBanco(70 * 1048576, limite)).toBe(false);
    expect(cabeNoBanco(70 * 1048576, null)).toBe(true); // sem o limite, não barra
  });

  it("não confunde com outro erro — nem com o ECONNRESET, que é o que o MySQL devolve acima do limite", () => {
    expect(ehPacoteGrandeDemais(Object.assign(new Error("read ECONNRESET"), { code: "ECONNRESET" }))).toBe(false);
    expect(ehPacoteGrandeDemais(new Error("Unique constraint failed"))).toBe(false);
    expect(ehPacoteGrandeDemais(new RangeError("Invalid array length"))).toBe(false);
    expect(ehPacoteGrandeDemais(null)).toBe(false);
  });

  it("diz quantos documentos e o tamanho, quando se sabe", () => {
    expect(mensagemDoPacoteGrande(60000, 69_600_000)).toBe("O pacote desta competência tem 60.000 documentos (66 MiB) e passa do que o Connect consegue congelar de uma vez. Competência com tanto CT-e ainda não gera pelo Connect: falta dividir o pacote em partes.");
    expect(mensagemDoPacoteGrande(500000, null)).toMatch(/^O pacote desta competência tem 500\.000 documentos e passa/);
  });
});
