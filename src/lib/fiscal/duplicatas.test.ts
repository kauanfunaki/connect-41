import { describe, expect, it } from "vitest";
import { centavosDaDuplicata, duplicatasParaGravar, lerDuplicatas } from "./duplicatas";
import { lerXmlFiscal } from "./xml";
import { mapearDocumento } from "@/lib/sped/mapeamento";
import type { DocumentoDoSped } from "@/lib/sped/client";

// As duplicatas da NF-e (23/10, "parado #22"): as duas origens — o XML do
// upload e o campo `duplicatas` do índice do SPED — chegam no mesmo formato, e
// a leitura é tudo ou nada.

const CHAVE_NFE = "41260917122471000175550010000001231123456781";

function nfe(extra: string, dhEmi = "2026-09-01T23:30:00-03:00") {
  return `<?xml version="1.0"?><nfeProc><NFe><infNFe Id="NFe${CHAVE_NFE}" versao="4.00">
    <ide><nNF>123</nNF><serie>1</serie><dhEmi>${dhEmi}</dhEmi></ide>
    <emit><CNPJ>39952818000140</CNPJ><xNome>ZAHRA PERFUMES LTDA</xNome></emit>
    <dest><CNPJ>17122471000175</CNPJ><xNome>BLD LOGISTICA LTDA</xNome></dest>
    <total><ICMSTot><vNF>1000.00</vNF></ICMSTot></total>
    ${extra}
  </infNFe></NFe></nfeProc>`;
}

const dup = (n: string, venc: string, valor: string) => `<dup><nDup>${n}</nDup><dVenc>${venc}</dVenc><vDup>${valor}</vDup></dup>`;

function duplicatasDoXml(xml: string) {
  const r = lerXmlFiscal(xml);
  if (!r.ok) throw new Error(`esperava sucesso, veio ${r.motivo}`);
  return r.documento.duplicatas;
}

describe("centavosDaDuplicata", () => {
  it("lê o decimal do leiaute e recusa o resto", () => {
    expect(centavosDaDuplicata("1234.5")).toBe(123450);
    expect(centavosDaDuplicata("10")).toBe(1000);
    expect(centavosDaDuplicata("1.234,50")).toBeNull();
    expect(centavosDaDuplicata("-1.00")).toBeNull();
    expect(centavosDaDuplicata("1.001")).toBeNull();
    expect(centavosDaDuplicata(10)).toBeNull();
  });
});

describe("lerDuplicatas", () => {
  it("confere cada uma e devolve centavos", () => {
    expect(
      lerDuplicatas([
        { numero: "001", vencimento: "2026-10-01", valor: "500.00" },
        { numero: null, vencimento: "2026-11-01", valor: "500" },
      ])
    ).toEqual([
      { numero: "001", vencimentoKey: "2026-10-01", centavos: 50000 },
      { numero: null, vencimentoKey: "2026-11-01", centavos: 50000 },
    ]);
  });

  it("é tudo ou nada: uma ilegível derruba a lista", () => {
    const boa = { numero: "1", vencimento: "2026-10-01", valor: "1.00" };
    expect(lerDuplicatas([boa, { numero: "2", vencimento: "2026-02-30", valor: "1.00" }])).toBeNull();
    expect(lerDuplicatas([boa, { numero: "2", vencimento: "2026-10-01", valor: "0.00" }])).toBeNull();
    expect(lerDuplicatas([boa, null])).toBeNull();
    expect(lerDuplicatas({ numero: "1" })).toBeNull();
    expect(lerDuplicatas([])).toEqual([]);
  });
});

describe("duplicatasParaGravar", () => {
  it("ausente fica ausente; null e ilegível não se gravam; lista sai normalizada", () => {
    expect(duplicatasParaGravar(undefined)).toBeUndefined();
    expect(duplicatasParaGravar(null)).toBeNull();
    expect(duplicatasParaGravar([{ vencimento: "x", valor: "1.00" }])).toBeNull();
    expect(duplicatasParaGravar([{ numero: " 001 ", vencimento: "2026-10-01", valor: "333.3" }])).toEqual([
      { numero: "001", vencimento: "2026-10-01", valor: "333.30" },
    ]);
  });
});

describe("XML da NF-e — <cobr><dup>", () => {
  it("nota sem <cobr> nem <pag>: lista vazia", () => {
    expect(duplicatasDoXml(nfe(""))).toEqual([]);
  });

  it("uma duplicata", () => {
    expect(duplicatasDoXml(nfe(`<cobr><fat><nFat>1</nFat></fat>${dup("001", "2026-10-01", "1000.00")}</cobr>`))).toEqual([
      { numero: "001", vencimento: "2026-10-01", valor: "1000.00" },
    ]);
  });

  it("várias, na ordem do XML, com o número preservado (zeros à esquerda)", () => {
    const r = duplicatasDoXml(
      nfe(`<cobr>${dup("001", "2026-10-01", "333.34")}${dup("002", "2026-11-01", "333.33")}${dup("003", "2026-12-01", "333.33")}</cobr>`)
    );
    expect(r?.map((d) => d.numero)).toEqual(["001", "002", "003"]);
    expect(r?.map((d) => d.valor)).toEqual(["333.34", "333.33", "333.33"]);
  });

  it("valor malformado: null — e o resto da nota continua lido", () => {
    const r = lerXmlFiscal(nfe(`<cobr>${dup("001", "2026-10-01", "500,00")}${dup("002", "2026-11-01", "500.00")}</cobr>`));
    expect(r.ok && r.documento.duplicatas).toBeNull();
    expect(r.ok && r.documento.valorTotal).toBe("1000.00");
  });

  it("à vista no <pag>: uma, vencendo no dia da emissão como escrito no XML (não em UTC)", () => {
    const pag = `<pag><detPag><indPag>0</indPag><tPag>17</tPag><vPag>1000.00</vPag></detPag></pag>`;
    expect(duplicatasDoXml(nfe(pag))).toEqual([{ numero: null, vencimento: "2026-09-01", valor: "1000.00" }]);
  });

  it("a prazo no <pag> sem <dup>: nada", () => {
    const pag = `<pag><detPag><indPag>1</indPag><tPag>15</tPag><vPag>1000.00</vPag></detPag></pag>`;
    expect(duplicatasDoXml(nfe(pag))).toEqual([]);
  });
});

describe("índice do SPED — campo `duplicatas`", () => {
  const base: DocumentoDoSped = {
    tipo: "nfe",
    identificador: "abc",
    chave: CHAVE_NFE,
    cnpj_raiz: "17122471",
    sentido: "entrada",
    competencia: "2026-09",
    numero: "123",
    serie: "1",
    data_emissao: "2026-09-01T10:30:00-03:00",
    cnpj_emitente: "39952818000140",
    nome_emitente: "ZAHRA",
    cnpj_destinatario: "17122471000175",
    nome_destinatario: "BLD",
    valor: "1000.00",
    detalhe: "completo",
    renderizavel: true,
    removido: false,
    atualizado_em: "2026-09-02T08:00:00",
  };
  const mapear = (over: Partial<DocumentoDoSped>) => {
    const r = mapearDocumento({ ...base, ...over });
    if ("motivo" in r) throw new Error(r.motivo);
    return r;
  };

  it("motor anterior ao campo: undefined, e a sincronização não mexe na coluna", () => {
    expect(mapear({}).duplicatas).toBeUndefined();
  });

  it("lista conferida passa; null e ilegível ficam null", () => {
    expect(mapear({ duplicatas: [{ numero: "1", vencimento: "2026-10-01", valor: "1000.00" }] }).duplicatas).toEqual([
      { numero: "1", vencimento: "2026-10-01", valor: "1000.00" },
    ]);
    expect(mapear({ duplicatas: null }).duplicatas).toBeNull();
    expect(mapear({ duplicatas: [{ numero: "1", vencimento: "01/10/2026", valor: "1000.00" }] }).duplicatas).toBeNull();
    expect(mapear({ duplicatas: [] }).duplicatas).toEqual([]);
  });
});
