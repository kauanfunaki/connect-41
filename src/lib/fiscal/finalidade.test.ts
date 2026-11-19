import { describe, expect, it } from "vitest";
import { lerXmlFiscal } from "./xml";
import {
  MOTIVO_FORA_DO_FINANCEIRO,
  SEM_AJUSTE_IBS_CBS,
  ajustaSoIbsCbs,
  chaveFormatada,
  chavesReferenciadasDaColuna,
  colunasDaFinalidade,
  finalidadeEmDestaque,
  motivoDoAjuste,
  whereDaFinalidade,
} from "./finalidade";

// Chaves com dígito verificador correto, calculado fora deste código, com o
// CNPJ de exemplo 11.222.333/0001-81 (não é de cliente).
const DEBITO = "35261111222333000181550010000005011000000011";
const CREDITO = "35261111222333000181550010000005021000000027";
const ORIGINAL = "35261011222333000181550010000001001000000035";
const OUTRA = "35261011222333000181550010000001011000000040";

function nota(opcoes: { chave: string; ide: string; total?: string }) {
  return `<?xml version="1.0" encoding="UTF-8"?><nfeProc versao="4.00"><NFe><infNFe Id="NFe${opcoes.chave}" versao="4.00">
    <ide><nNF>501</nNF><serie>1</serie><mod>55</mod><dhEmi>2026-11-10T09:00:00-03:00</dhEmi>${opcoes.ide}</ide>
    <emit><CNPJ>11222333000181</CNPJ><xNome>EMITENTE DE TESTE</xNome></emit>
    <dest><CNPJ>00000000000000</CNPJ><xNome>DESTINATARIO DE TESTE</xNome></dest>
    <total><ICMSTot><vNF>12.30</vNF></ICMSTot>${opcoes.total ?? ""}</total>
  </infNFe></NFe></nfeProc>`;
}

const IBSCBS = `<IBSCBSTot><vBCIBSCBS>100.00</vBCIBSCBS>
  <gIBS><gIBSUF><vDif>0.00</vDif><vDevTrib>0.00</vDevTrib><vIBSUF>0.10</vIBSUF></gIBSUF><gIBSMun><vDif>0.00</vDif><vDevTrib>0.00</vDevTrib><vIBSMun>0.00</vIBSMun></gIBSMun><vIBS>0.10</vIBS><vCredPres>0.00</vCredPres><vCredPresCondSus>0.00</vCredPresCondSus></gIBS>
  <gCBS><vDif>0.00</vDif><vDevTrib>0.00</vDevTrib><vCBS>12.20</vCBS><vCredPres>0.00</vCredPres><vCredPresCondSus>0.00</vCredPresCondSus></gCBS>
</IBSCBSTot>`;

function lida(xml: string) {
  const r = lerXmlFiscal(xml);
  if (!r.ok) throw new Error(`esperava sucesso, veio ${r.motivo}: ${r.detalhe}`);
  return r.documento;
}

describe("leitura da finalidade da NF-e", () => {
  it("nota de débito: finalidade 6, motivo do tpNFDebito, referenciada e IBS/CBS", () => {
    const d = lida(
      nota({
        chave: DEBITO,
        ide: `<finNFe>6</finNFe><tpNFDebito>04</tpNFDebito><NFref><refNFe>${ORIGINAL}</refNFe></NFref>`,
        total: IBSCBS,
      })
    );
    expect(d.chaveAcesso).toBe(DEBITO);
    expect(d.finalidade).toBe("6");
    expect(d.tipoAjuste).toBe("04");
    expect(d.chavesReferenciadas).toEqual([ORIGINAL]);
    expect(d.valorIbs).toBe("0.10");
    expect(d.valorCbs).toBe("12.20");
  });

  it("nota de crédito: motivo do tpNFCredito (e não do tpNFDebito), várias referenciadas sem repetir", () => {
    const d = lida(
      nota({
        chave: CREDITO,
        ide:
          `<finNFe>5</finNFe><tpNFDebito>01</tpNFDebito><tpNFCredito>04</tpNFCredito>` +
          `<NFref><refNFe>${ORIGINAL}</refNFe></NFref><NFref><refNFe>${OUTRA}</refNFe></NFref><NFref><refNFe>${ORIGINAL}</refNFe></NFref>`,
        total: IBSCBS,
      })
    );
    expect(d.finalidade).toBe("5");
    expect(d.tipoAjuste).toBe("04");
    expect(d.chavesReferenciadas).toEqual([ORIGINAL, OUTRA]);
  });

  it("a chave desta nota nunca vira referenciada, e chave com dígito errado fica fora", () => {
    const errada = ORIGINAL.slice(0, 43) + (ORIGINAL[43] === "0" ? "1" : "0");
    const d = lida(
      nota({
        chave: DEBITO,
        ide: `<finNFe>6</finNFe><tpNFDebito>04</tpNFDebito><NFref><refNFe>${DEBITO}</refNFe></NFref><NFref><refNFe>${errada}</refNFe></NFref>`,
      })
    );
    expect(d.chaveAcesso).toBe(DEBITO);
    expect(d.chavesReferenciadas).toEqual([]);
  });

  it("débito de pagamento antecipado: a nota da antecipação vem em gPagAntecipado", () => {
    const d = lida(
      nota({ chave: DEBITO, ide: `<finNFe>6</finNFe><tpNFDebito>06</tpNFDebito><gPagAntecipado><refNFe>${OUTRA}</refNFe></gPagAntecipado>` })
    );
    expect(d.chavesReferenciadas).toEqual([OUTRA]);
    expect(d.valorIbs).toBeNull();
    expect(d.valorCbs).toBeNull();
  });

  it("sem finNFe é normal; devolução lê a referenciada mas não tem motivo de ajuste", () => {
    expect(lida(nota({ chave: DEBITO, ide: "" })).finalidade).toBe("1");
    const devolucao = lida(nota({ chave: DEBITO, ide: `<finNFe>4</finNFe><tpNFDebito>04</tpNFDebito><NFref><refNFe>${ORIGINAL}</refNFe></NFref>` }));
    expect(devolucao.finalidade).toBe("4");
    expect(devolucao.tipoAjuste).toBeNull();
    expect(devolucao.chavesReferenciadas).toEqual([ORIGINAL]);
  });

  it("valor de IBS/CBS fora do formato não entra", () => {
    const d = lida(nota({ chave: DEBITO, ide: "<finNFe>6</finNFe>", total: "<IBSCBSTot><gIBS><vIBS>abc</vIBS></gIBS><gCBS><vCBS>12345678901.00</vCBS></gCBS></IBSCBSTot>" }));
    expect(d.valorIbs).toBeNull();
    expect(d.valorCbs).toBeNull();
  });
});

describe("regras da finalidade", () => {
  it("só 5 e 6 ajustam só IBS/CBS", () => {
    expect(["1", "2", "3", "4", null, undefined].map(ajustaSoIbsCbs)).toEqual([false, false, false, false, false, false]);
    expect(ajustaSoIbsCbs("5")).toBe(true);
    expect(ajustaSoIbsCbs("6")).toBe(true);
  });

  it("motivo por extenso, pela tabela certa, e código desconhecido como veio", () => {
    expect(motivoDoAjuste("6", "04")).toBe("Multa e juros");
    expect(motivoDoAjuste("6", "07")).toBe("Perda em estoque");
    expect(motivoDoAjuste("5", "04")).toBe("Redução de valores");
    expect(motivoDoAjuste("5", "02")).toMatch(/Zona Franca/);
    expect(motivoDoAjuste("5", "99")).toBe("Código 99");
    expect(motivoDoAjuste("4", "04")).toBeNull();
    expect(motivoDoAjuste("6", null)).toBeNull();
  });

  it("nota 5/6 nasce ignorada, com o motivo; as outras não mexem no destino", () => {
    expect(colunasDaFinalidade({ finalidade: "6", tipoAjuste: "04", chavesReferenciadas: [ORIGINAL, OUTRA], valorIbs: "0.10", valorCbs: "12.20" })).toEqual({
      finalidade: "6",
      tipoAjuste: "04",
      chavesReferenciadas: `${ORIGINAL},${OUTRA}`,
      valorIbs: "0.10",
      valorCbs: "12.20",
      destination: "IGNORADO",
      ignoredReason: MOTIVO_FORA_DO_FINANCEIRO,
    });
    const devolucao = colunasDaFinalidade({ finalidade: "4", tipoAjuste: "04", chavesReferenciadas: [ORIGINAL] });
    expect(devolucao).toEqual({ finalidade: "4", tipoAjuste: null, chavesReferenciadas: ORIGINAL, valorIbs: null, valorCbs: null });
    expect("destination" in devolucao).toBe(false);
    expect(colunasDaFinalidade({})).toEqual({ finalidade: null, tipoAjuste: null, chavesReferenciadas: null, valorIbs: null, valorCbs: null });
  });

  it("a coluna das referenciadas volta em lista, sem lixo", () => {
    expect(chavesReferenciadasDaColuna(`${ORIGINAL},${OUTRA}`)).toEqual([ORIGINAL, OUTRA]);
    expect(chavesReferenciadasDaColuna(null)).toEqual([]);
    expect(chavesReferenciadasDaColuna("123,")).toEqual([]);
  });

  it("chave em grupos de quatro, como no DANFE", () => {
    expect(chaveFormatada(ORIGINAL)).toBe("3526 1011 2223 3300 0181 5500 1000 0001 0010 0000 0035");
  });

  it("só a finalidade não normal é destacada", () => {
    expect(finalidadeEmDestaque("1")).toBeNull();
    expect(finalidadeEmDestaque(null)).toBeNull();
    expect(finalidadeEmDestaque("x")).toBeNull();
    expect(finalidadeEmDestaque("4")).toBe("4");
    expect(finalidadeEmDestaque("6")).toBe("6");
  });

  it("os `where` tratam a nota sem a marca (nula) como normal", () => {
    expect(whereDaFinalidade("1")).toEqual({ OR: [{ finalidade: null }, { finalidade: "1" }] });
    expect(whereDaFinalidade("5")).toEqual({ finalidade: "5" });
    expect(SEM_AJUSTE_IBS_CBS).toEqual({ OR: [{ finalidade: null }, { finalidade: { notIn: ["5", "6"] } }] });
  });
});
