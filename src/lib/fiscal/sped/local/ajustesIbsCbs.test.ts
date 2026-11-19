import { describe, expect, it } from "vitest";
import { documentoSchema, parametrosSchema, type DocumentoEscriturado } from "./dominio";
import { apurarBase, apurarPeriodos, produtosDaBase } from "./calculo";
import { lerDocumentoXml } from "./importacao";
import { pacoteGeracaoSchema } from "./contrato";
import { XML_FICTICIO, documentoDeTeste } from "./fixture";

// Notas de crédito e de débito da reforma (finNFe 5/6, funcionalidade-793):
// ajustam só IBS/CBS e ficam fora do ICMS/IPI/PIS/COFINS, das linhas, dos
// produtos e dos totais — informadas à parte em `ajustesIbsCbs`.

const REFERENCIADA = "35261011222333000181550010000001001000000035";
const XML_DEBITO = XML_FICTICIO.replace(
  "<dhEmi>2026-09-01T10:00:00-03:00</dhEmi>",
  `<dhEmi>2026-09-01T10:00:00-03:00</dhEmi><finNFe>6</finNFe><tpNFDebito>04</tpNFDebito><NFref><refNFe>${REFERENCIADA}</refNFe></NFref>`
).replace("</ICMSTot>", "</ICMSTot><IBSCBSTot><vBCIBSCBS>95.00</vBCIBSCBS><gIBS><vIBS>0.10</vIBS></gIBS><gCBS><vCBS>0.90</vCBS></gCBS></IBSCBSTot>");

const parametros = parametrosSchema.parse({ saldoIcms: "0.00", saldoIpi: "0.00", saldoPis: "0.00", saldoCofins: "0.00", receitaBruta: "0.00" });
const debito = (): DocumentoEscriturado => ({ ...lerDocumentoXml(XML_DEBITO), id: "debito", companyId: "empresa", cnpjEmpresa: "39952818000140", sentido: "entrada", nomeArquivo: "debito.xml" });

describe("notas de crédito e de débito no SPED local", () => {
  it("a leitura do XML leva finalidade, motivo, referenciada e IBS/CBS para o documento", () => {
    expect(debito()).toMatchObject({ finalidadeNfe: "6", tipoAjuste: "04", referenciadas: [REFERENCIADA], valorIbs: "0.10", valorCbs: "0.90" });
    expect(documentoDeTeste()).toMatchObject({ finalidadeNfe: "1", tipoAjuste: "", referenciadas: [], valorIbs: null, valorCbs: null });
  });

  it("documento gravado antes dos campos novos continua válido, como normal", () => {
    const { finalidadeNfe, tipoAjuste, referenciadas, valorIbs, valorCbs, ...antigo } = documentoDeTeste();
    void finalidadeNfe; void tipoAjuste; void referenciadas; void valorIbs; void valorCbs;
    expect(documentoSchema.parse(antigo)).toMatchObject({ finalidadeNfe: "1", tipoAjuste: "", referenciadas: [], valorIbs: null, valorCbs: null });
  });

  it("fica fora dos tributos, das linhas, dos produtos e dos totais, e vem à parte", () => {
    const so = apurarBase([documentoDeTeste()], [], [], parametros, "icms_ipi");
    const com = apurarBase([documentoDeTeste(), debito()], [], [], parametros, "icms_ipi");
    expect(com.tributos).toEqual(so.tributos);
    expect(com.linhas).toEqual(so.linhas);
    expect(com.totalEntradas).toBe(so.totalEntradas);
    expect(com.totalSaidas).toBe(so.totalSaidas);
    expect(so.ajustesIbsCbs).toEqual([]);
    expect(com.ajustesIbsCbs).toEqual([
      { documentoId: "debito", empresaId: "empresa", competencia: "2026-09", numero: "123", sentido: "entrada", finalidade: "6", tipoAjuste: "04", motivo: "Multa e juros", valor: "95.00", valorIbs: "0.10", valorCbs: "0.90", referenciadas: [REFERENCIADA] },
    ]);
    expect(produtosDaBase([documentoDeTeste(), debito()], [])[0].ocorrencias).toBe(1);
    // Cancelada não entra nem à parte.
    expect(apurarBase([{ ...debito(), cancelado: true }], [], [], parametros, "icms_ipi").ajustesIbsCbs).toEqual([]);
  });

  it("a apuração por período junta os ajustes de cada competência", () => {
    const r = apurarPeriodos([documentoDeTeste(), debito()], [], [], [{ companyId: "empresa", competencia: "2026-09", dados: parametros }], "contribuicoes", [], "2026-09", ["empresa"], "empresa", false);
    expect(r.ajustesIbsCbs?.map(a => a.documentoId)).toEqual(["debito"]);
  });

  it("o pacote do motor leva os ajustes e a finalidade de cada documento", () => {
    const apuracao = apurarBase([documentoDeTeste(), debito()], [], [], parametros, "icms_ipi");
    const pacote = pacoteGeracaoSchema.parse({
      versao: 1, finalidade: "geracao_connect_v1", tenant_id: "t", raiz: "39952818", competencia: "2026-09", obrigacao: "icms_ipi", tipo_sped: "0", revisao: 1,
      estabelecimentos: [{ id_connect: "empresa", cnpj: "39952818000140", nome: "Empresa", perfil: { uf: "SP", regime: "real", obrigacoes: ["icms_ipi"] } }],
      documentos: [documentoDeTeste(), debito()], apoios: [], decisoes: [], parametros: [], apuracao,
    });
    expect(pacote.apuracao.ajustesIbsCbs).toHaveLength(1);
    expect(pacote.documentos.map(d => d.finalidadeNfe)).toEqual(["1", "6"]);
  });
});
