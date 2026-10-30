import { describe, expect, it } from "vitest";
import { apoioSchema, decimal, parametrosSchema, percentual, ratearCredito, reaisExatos, somar, unidades, type DecisaoFiscal } from "./dominio";
import { apurarBase, apurarPeriodos, cfopEfetivo, conferirApoios, produtosDaBase } from "./calculo";
import { lerCsv, lerDocumentoXml, lerDocumentosTxt, lerLinhasApoio, COLUNAS_APOIO } from "./importacao";
import { serializarPacote } from "./pacote";
import { csvSeguro } from "./exportacao";
import { ARQUIVO_ICMS_DE_TESTE } from "../arquivoIcms.fixture";

import { XML_FICTICIO, documentoDeTeste } from "./fixture";
const parametros = parametrosSchema.parse({ saldoIcms: "100.00", saldoIpi: "0.00", saldoPis: "0.00", saldoCofins: "0.00", receitaBruta: "0.00" });

describe("SPED autônomo: valores exatos", () => {
  it("soma valores grandes e arredonda sem float", () => { expect(somar(["99999999999999.99", "0.01"])).toBe("100000000000000.00"); expect(decimal(unidades("-0.105"))).toBe("-0.11"); expect(percentual("95.00", "1.65")).toBe("1.57"); });
  it("preserva centavos e não cria parcelas negativas no rateio anual", () => { const pesos = Object.fromEntries(Array.from({ length: 12 }, (_, i) => [`2026-${String(i + 1).padStart(2, "0")}`, "0.00"])); const parcelas = Object.values(ratearCredito("0.10", pesos)); expect(somar(parcelas)).toBe("0.10"); expect(parcelas.every(v => unidades(v) >= BigInt(0))).toBe(true); expect(ratearCredito("100.00", { "2026-01": "100", "2026-02": "300" })).toEqual({ "2026-01": "25.00", "2026-02": "75.00" }); });
  it("recusa números inválidos", () => { expect(() => unidades("1e8")).toThrow(); expect(() => unidades("NaN")).toThrow(); });
  it("apresenta os centavos de valores grandes sem converter para float", () => { expect(reaisExatos("99999999999999.99")).toBe("R$ 99.999.999.999.999,99"); });
});
describe("normalização e prioridade da fonte", () => {
  it("extrai itens, tributos e valor líquido da mercadoria", () => { const d = lerDocumentoXml(XML_FICTICIO); expect(d.itens[0]).toMatchObject({ codigo: "A1", valor: "95.00", icms: { valor: "17.10" }, pis: { valor: "1.57" }, cofins: { valor: "7.22" } }); expect(d.emitente).toBe("17122471000175"); });
  it("aceita namespaces sem tratar identificadores como número", () => { const d = lerDocumentoXml(XML_FICTICIO.replace('<cProd>A1</cProd>', '<cProd>000001</cProd>')); expect(d.itens[0].codigo).toBe("000001"); });
  it("recusa entidades externas e XML inválido", () => { expect(() => lerDocumentoXml('<!DOCTYPE a SYSTEM "file:///etc/passwd"><a/>')).toThrow(); expect(() => lerDocumentoXml("inválido")).toThrow(); });
  it("lê o TXT de referência sem duplicar C170 e C190", () => { const ds = lerDocumentosTxt(ARQUIVO_ICMS_DE_TESTE, "17122471000175"); expect(ds).toHaveLength(6); expect(ds[0].itens).toHaveLength(2); expect(ds[0].competencia).toBe("2026-09"); expect(ds[3]).toMatchObject({ numero: "900", valor: "10000.00", identidade: "12345678901234567890123456789012345678901234" }); expect(() => lerDocumentosTxt(ARQUIVO_ICMS_DE_TESTE, "39952818000140")).toThrow(/CNPJ/); });
  it("preserva o prefixo do emitente e o desempate por NCM da origem", () => { expect(cfopEfetivo("5656", "27101921", "entrada", "xml", null)).toBe("1653"); expect(cfopEfetivo("6102", "40112090", "entrada", "xml", null)).toBe("2126"); expect(cfopEfetivo("9999", "", "entrada", "xml", null)).toBeNull(); expect(cfopEfetivo("5102", "", "entrada", "xml", { tipoItem: "07", definicao: "556", creditoPisCofins: "N", observacao: "" })).toBe("1556"); });
  it("lê CSV com aspas e mantém CPF com zero inicial", () => { const csv = csvSeguro([...COLUNAS_APOIO], [["R1", "2026-09", "recibo", "01234567890", 'Pessoa; "Exemplo"', "2026-09-15", "100.00", "90.00"]]); const ds = lerLinhasApoio(lerCsv(csv)); expect(ds[0]).toMatchObject({ documento: "01234567890", nome: 'Pessoa; "Exemplo"', decisao: "pendente" }); expect(() => lerLinhasApoio([["errado"]])).toThrow(/modelo/); });
});
describe("apuração e consolidação", () => {
  it("confere débitos, créditos e ajustes contra os números dos módulos Python", () => {
    const docs = lerDocumentosTxt(ARQUIVO_ICMS_DE_TESTE, "17122471000175").map((d, i) => ({ ...d, id: `d${i}`, companyId: "empresa", cnpjEmpresa: "17122471000175", sentido: d.emitente === "17122471000175" ? "saida" as const : "entrada" as const, nomeArquivo: "referencia.txt" }));
    const r = apurarBase(docs, [], [], parametros, "icms_ipi");
    expect(r.tributos.find(t => t.tributo === "icms")).toMatchObject({ debitos: "1296.00", creditos: "594.00", saldoAnterior: "100.00" });
    const isentas = somar(r.linhas.map(l => l.isentas)); expect(isentas).toBe("3500.00");
  });
  it("crédito decidido é por produto/mês e aplicado uma vez", () => {
    const d = documentoDeTeste(), outro = { ...d, id: "doc2" };
    const decisao: DecisaoFiscal = { tipo: "credito_icms", chave: "39952818000140|2026-09|17122471000175|A1", dados: { valor: "5.00" }, autor: "Fiscal", em: "2026-10-30" };
    const r = apurarBase([d, outro], [decisao], [], parametros, "icms_ipi"); expect(r.tributos[0].creditos).toBe("5.00"); expect(produtosDaBase([d, outro], [decisao])[0].ocorrencias).toBe(2);
  });
  it("não inventa crédito de PIS/COFINS a partir do XML do fornecedor", () => { const r = apurarBase([documentoDeTeste()], [], [], parametros, "contribuicoes"); expect(r.tributos[0].recolher).toBeNull(); expect(r.pendencias.some(p => p.includes("PIS/COFINS"))).toBe(true); });
  it("decisão fiscal por item preserva o XML e calcula no Connect", () => { const d = documentoDeTeste(); const ds: DecisaoFiscal[] = [{ tipo: "classificacao", chave: "17122471000175|A1", dados: { tipoItem: "10", definicao: "126", creditoPisCofins: "S", observacao: "" }, autor: "Fiscal", em: "hoje" }, { tipo: "tributacao", chave: "39952818000140|2026-09|doc|1", dados: { pis: { cst: "50", base: "80.00", aliquota: "1.65", valor: "1.32" }, cofins: { cst: "50", base: "80.00", aliquota: "7.60", valor: "6.08" } }, autor: "Fiscal", em: "hoje" }]; const r = apurarBase([d], ds, [], parametros, "contribuicoes"); expect(r.tributos[0].creditos).toBe("1.32"); expect(r.tributos[1].creditos).toBe("6.08"); expect(d.itens[0].pis.valor).toBe("1.57"); });
  it("não transporta saldo desconhecido como zero", () => { const r = apurarBase([documentoDeTeste()], [], [], parametrosSchema.parse({}), "icms_ipi"); expect(r.tributos[0].recolher).toBeNull(); expect(r.tributos[0].saldoAnterior).toBeNull(); });
  it("consolida estabelecimentos apurando os saldos separadamente", () => { const d = documentoDeTeste(); const r = apurarPeriodos([d, { ...d, id: "filialdoc", companyId: "filial", cnpjEmpresa: "39952818000220" }], [], [], [{ companyId: "empresa", competencia: "2026-09", dados: parametros }, { companyId: "filial", competencia: "2026-09", dados: { ...parametros, saldoIcms: "50.00" } }], "icms_ipi", [], "2026-09", ["empresa", "filial"], "empresa", true); expect(r.tributos[0]).toMatchObject({ creditos: "34.20", saldoAnterior: "150.00", transportar: "184.20" }); });
  it("contrato é cadastro, não duplica pagamento no faturamento", () => { const a = { ...apoioSchema.parse({ identidade: "r", competencia: "2026-09", categoria: "recibo", documento: "01234567890", nome: "Pessoa fictícia", bruto: "100.00", liquido: "90.00", dataPagamento: "2026-09-15" }), id: "a", companyId: "e", autor: "fiscal", em: "hoje" }; const r = conferirApoios([a, { ...a, id: "b" }, { ...a, id: "c", categoria: "contrato_locacao" }]); expect(r.bruto).toBe("200.00"); expect(r.duplicatas).toHaveLength(1); });
  it("deriva crédito de motorista com alíquotas confirmadas para a competência", () => {
    const a = { ...apoioSchema.parse({ identidade: "r", competencia: "2026-09", categoria: "rpa", documento: "01234567890", nome: "Pessoa fictícia", bruto: "100.00", liquido: "90.00", dataPagamento: "2026-09-15", credito: "S", natureza: "03", decisao: "aceito" }), id: "a", companyId: "e", autor: "fiscal", em: "hoje" };
    const r = apurarBase([], [], [], { ...parametros, semMovimento: true, aliquotaMotoristaPis: "1.2375", aliquotaMotoristaCofins: "5.7000" }, "contribuicoes", [a]);
    expect(r.tributos[0].creditos).toBe("1.24"); expect(r.tributos[1].creditos).toBe("5.70"); expect(r.ajustes).toHaveLength(2);
    const desconhecido = apurarBase([], [], [], parametros, "contribuicoes", [a]); expect(desconhecido.tributos[0].recolher).toBeNull();
  });
});
describe("revisão e exportação", () => {
  it("hash não depende da ordem das chaves do JSON no MySQL", () => { expect(serializarPacote({ b: [1, { z: "2", a: "1" }], a: 1 }).sha256).toBe(serializarPacote({ a: 1, b: [1, { a: "1", z: "2" }] }).sha256); });
  it("alteração posterior produz outro hash e preserva bytes anteriores", () => { const valor = { revisao: 1, documentos: [documentoDeTeste()] }; const antes = serializarPacote(valor); valor.documentos[0].valor = "200.00"; expect(serializarPacote(valor).sha256).not.toBe(antes.sha256); expect(Buffer.from(antes.bytes).toString()).toContain('"valor":"95.00"'); });
  it("CSV protege fórmulas e não perde identificadores", () => { const csv = csvSeguro(["Código", "Nome"], [["000012", "=1+1"]]); expect(csv).toContain('"000012"'); expect(csv).toContain("'=1+1"); });
});


