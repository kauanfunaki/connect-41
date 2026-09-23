import { describe, expect, it } from "vitest";

import { instanteDoOmie, mapearNotaOmie, mensagemDaImportacao, paginaDoListarNF } from "./notas";

const CNPJ = "12345678000190";
// UF 41 · AAMM 2609 · CNPJ · modelo 55 · série 001 · número 000006014 · ...
const CHAVE = `412609${CNPJ}55001000006014112345678 0`.replace(/\D/g, "").padEnd(44, "0");

function nota(ide: Record<string, unknown> = {}, extra: Record<string, unknown> = {}) {
  return {
    compl: { cChaveNFe: CHAVE, nIdNF: 987654 },
    ide: { nNF: "000006014", serie: "1", dEmi: "30/09/2026", hEmi: "22:15:00", tpNF: "1", mod: "55", tpAmb: "1", dCan: "", cDeneg: "N", ...ide },
    nfDestInt: { cRazao: "CLIENTE X LTDA", cnpj_cpf: "98.765.432/0001-10" },
    total: { ICMSTot: { vNF: 1530.45 } },
    ...extra,
  };
}

describe("instanteDoOmie", () => {
  it("lê data e hora de Brasília", () => {
    expect(instanteDoOmie("30/09/2026", "22:15:00")?.toISOString()).toBe("2026-10-01T01:15:00.000Z");
    expect(instanteDoOmie("01/09/2026", "")?.toISOString()).toBe("2026-09-01T15:00:00.000Z");
  });
  it("recusa o que não é data", () => {
    expect(instanteDoOmie("", "")).toBeNull();
    expect(instanteDoOmie("00/00/0000", "")).toBeNull();
    expect(instanteDoOmie("2026-09-01", "")).toBeNull();
  });
});

describe("mapearNotaOmie", () => {
  it("traduz a nota de saída da empresa", () => {
    const r = mapearNotaOmie(nota(), CNPJ);
    expect(r).toEqual({
      dedupKey: CHAVE,
      tipo: "NFE",
      chaveAcesso: CHAVE,
      numero: "6014",
      serie: "1",
      emitidoEm: new Date("2026-10-01T01:15:00.000Z"),
      // 22h do último dia do mês em Brasília ainda é setembro, mesmo já sendo outubro em UTC.
      competencia: "2026-09",
      emitenteDocumento: CNPJ,
      destinatarioNome: "CLIENTE X LTDA",
      destinatarioDocumento: "98765432000110",
      valor: 1530.45,
      situacao: "AUTORIZADA",
      omieIdNF: "987654",
    });
  });

  it("deixa de fora entrada, homologação, denegada e outro modelo", () => {
    expect(mapearNotaOmie(nota({ tpNF: "0" }), CNPJ)).toEqual({ fora: "entrada" });
    expect(mapearNotaOmie(nota({ tpAmb: "2" }), CNPJ)).toEqual({ fora: "homologacao" });
    expect(mapearNotaOmie(nota({ cDeneg: "S" }), CNPJ)).toEqual({ fora: "denegada" });
    expect(mapearNotaOmie(nota({ mod: "57" }), CNPJ)).toEqual({ fora: "outro_modelo" });
  });

  it("confere o emitente pela chave", () => {
    expect(mapearNotaOmie(nota(), "11111111000111")).toEqual({ fora: "outro_emitente" });
    expect(mapearNotaOmie(nota({}, { compl: { cChaveNFe: "123" } }), CNPJ)).toEqual({ fora: "sem_chave" });
  });

  it("marca cancelada pela data de cancelamento", () => {
    const r = mapearNotaOmie(nota({ dCan: "02/10/2026" }), CNPJ);
    expect("fora" in r ? null : r.situacao).toBe("CANCELADA");
  });

  it("aceita NFC-e e valor em texto", () => {
    const r = mapearNotaOmie(nota({ mod: "65" }, { total: { ICMSTot: { vNF: "1.234,56" } } }), CNPJ);
    expect("fora" in r ? null : [r.tipo, r.valor]).toEqual(["NFCE", 1234.56]);
  });
});

describe("paginaDoListarNF", () => {
  it("lê a lista e o total de páginas", () => {
    expect(paginaDoListarNF({ pagina: 1, total_de_paginas: 8, nfCadastro: [1, 2] })).toEqual({ notas: [1, 2], totalDePaginas: 8 });
    expect(paginaDoListarNF({})).toEqual({ notas: [], totalDePaginas: 1 });
  });
});

describe("mensagemDaImportacao", () => {
  it("diz o motivo de quem ficou de fora", () => {
    expect(mensagemDaImportacao({ lidas: 709, paginas: 8, novas: 0, reconhecidas: 0, atualizadas: 0, fora_entrada: 709 })).toBe(
      "709 notas lidas em 8 página(s): 0 novas no acervo, 709 entradas (chegam pelo SPED). Nenhuma nota de saída emitida pela empresa nesta conta."
    );
  });
  it("mostra só o que aconteceu", () => {
    expect(mensagemDaImportacao({ lidas: 12, paginas: 1, novas: 5, reconhecidas: 3, atualizadas: 0, fora_entrada: 3, fora_outro_emitente: 1 })).toBe(
      "12 notas lidas em 1 página(s): 5 novas no acervo, 3 já estavam (SPED), 3 entradas (chegam pelo SPED), 1 de outro CNPJ emitente."
    );
  });
});
