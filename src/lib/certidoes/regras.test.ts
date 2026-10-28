import { describe, expect, it } from "vitest";
import { certidoesDaCarteira, dataDaInfoSimples, grupoDaEmpresa, lerCertidao, mesDoTrimestre, nomeDoComprovante, trimestreDe } from "./regras";

// As regras puras das certidões (28/10/2026): quem precisa de quê, o trimestre
// e a leitura de cada consulta, com os campos das páginas da InfoSimples.

const ok = (data: Record<string, unknown>, recibo = "https://storage.infosimples.com/recibo.pdf") => ({ code: 200, code_message: "Sucesso", data: [data], site_receipts: [recibo] });

describe("quais certidões a carteira precisa", () => {
  const MATRIZ = { id: "m", cnpj: "11.444.777/0001-61", stateCode: "PR", city: "Curitiba" };
  const FILIAL_SP = { id: "f-sp", cnpj: "11444777000242", stateCode: "SP", city: "São Paulo" };
  const FILIAL_CTBA = { id: "f-ctba", cnpj: "11444777000323", stateCode: "pr", city: "CURITIBA" };

  it("federal, FGTS e trabalhista uma por raiz, pela matriz; estadual do PR uma por raiz; Curitiba por estabelecimento", () => {
    const lista = certidoesDaCarteira([FILIAL_SP, MATRIZ, FILIAL_CTBA]);
    expect(lista.filter((c) => c.tipo === "FEDERAL")).toEqual([{ companyId: "m", tipo: "FEDERAL" }]);
    expect(lista.filter((c) => c.tipo === "FGTS" || c.tipo === "TRABALHISTA").map((c) => c.companyId)).toEqual(["m", "m"]);
    expect(lista.filter((c) => c.tipo === "ESTADUAL_PR")).toEqual([{ companyId: "m", tipo: "ESTADUAL_PR" }]);
    expect(lista.filter((c) => c.tipo === "CURITIBA").map((c) => c.companyId).sort()).toEqual(["f-ctba", "m"]);
  });

  it("raiz sem matriz na carteira: o menor CNPJ; a estadual vai para um estabelecimento do PR", () => {
    const lista = certidoesDaCarteira([FILIAL_CTBA, FILIAL_SP]);
    expect(lista.find((c) => c.tipo === "FEDERAL")!.companyId).toBe("f-sp");
    expect(lista.find((c) => c.tipo === "ESTADUAL_PR")!.companyId).toBe("f-ctba");
  });

  it("sem CNPJ válido, nenhuma; fora do PR, sem estadual nem municipal", () => {
    expect(certidoesDaCarteira([{ id: "x", cnpj: null, stateCode: "PR", city: "Curitiba" }, { id: "y", cnpj: "123", stateCode: null, city: null }])).toEqual([]);
    expect(certidoesDaCarteira([FILIAL_SP]).map((c) => c.tipo)).toEqual(["FEDERAL", "FGTS", "TRABALHISTA"]);
  });
});

describe("o trimestre", () => {
  it("trimestre, mês dentro dele e o grupo de cada empresa", () => {
    expect(trimestreDe("2026-10-28")).toBe("2026-T4");
    expect(trimestreDe("2027-03-31")).toBe("2027-T1");
    expect([mesDoTrimestre("2026-10-01"), mesDoTrimestre("2026-11-15"), mesDoTrimestre("2026-12-31")]).toEqual([0, 1, 2]);
    const grupos = Array.from({ length: 300 }, (_, i) => grupoDaEmpresa(`empresa-${i}-${i * 7}`));
    expect(new Set(grupos)).toEqual(new Set([0, 1, 2]));
    // Um terço de cada, mais ou menos: o custo fica no mínimo da InfoSimples.
    for (const g of [0, 1, 2]) expect(grupos.filter((x) => x === g).length).toBeGreaterThan(70);
    expect(grupoDaEmpresa("abc")).toBe(grupoDaEmpresa("abc"));
  });
});

describe("a leitura de cada consulta", () => {
  it("federal negativa: código, emissão, validade e o comprovante", () => {
    expect(lerCertidao("FEDERAL", ok({ conseguiu_emitir_certidao_negativa: true, tipo: "Certidão Negativa", certidao_codigo: "ABCD.1234", emissao_data: "28/10/2026", validade_data: "26/04/2027" }))).toEqual({
      tipo: "lida",
      situacao: "NEGATIVA",
      codigo: "ABCD.1234",
      emitidaEm: "2026-10-28",
      validaAte: "2027-04-26",
      mensagem: null,
      comprovante: "https://storage.infosimples.com/recibo.pdf",
    });
  });

  it("positiva com efeito de negativa, pela palavra no tipo ou no título", () => {
    expect(lerCertidao("FEDERAL", ok({ conseguiu_emitir_certidao_negativa: true, tipo: "Certidão Positiva com Efeitos de Negativa" }))).toMatchObject({ situacao: "POSITIVA_COM_EFEITO" });
    expect(lerCertidao("CURITIBA", ok({ conseguiu_emitir_certidao_negativa: true, titulo: "CERTIDÃO POSITIVA COM EFEITO DE NEGATIVA", numero: "77", data_validade: "2027-01-26" }))).toMatchObject({
      situacao: "POSITIVA_COM_EFEITO",
      codigo: "77",
      validaAte: "2027-01-26",
    });
  });

  it("não conseguiu emitir a negativa: positiva", () => {
    expect(lerCertidao("TRABALHISTA", ok({ conseguiu_emitir_certidao_negativa: false, consta: "Consta débito", total_de_processos: 2 }))).toMatchObject({ situacao: "POSITIVA", mensagem: "Consta débito" });
    expect(lerCertidao("ESTADUAL_PR", ok({ conseguiu_emitir_certidao_negativa: false, mensagem: "Há pendências" }))).toMatchObject({ situacao: "POSITIVA" });
  });

  it("FGTS: regular ou irregular pelo texto; o CRF e as datas de início e fim", () => {
    expect(lerCertidao("FGTS", ok({ situacao: "Regular", crf: "2026102800000", validade_inicio_data: "28/10/2026", validade_fim_data: "26/11/2026" }))).toMatchObject({
      situacao: "NEGATIVA",
      codigo: "2026102800000",
      emitidaEm: "2026-10-28",
      validaAte: "2026-11-26",
    });
    expect(lerCertidao("FGTS", ok({ situacao: "IRREGULAR" }))).toMatchObject({ situacao: "POSITIVA" });
  });

  it("comprovante só https", () => {
    expect(lerCertidao("FEDERAL", ok({ conseguiu_emitir_certidao_negativa: true }, "http://exemplo/recibo"))).toMatchObject({ comprovante: null });
  });

  it("erros: token recusado para a rotina, site fora tenta de novo, o resto não", () => {
    expect(lerCertidao("FEDERAL", { code: 601, code_message: "Token inválido" })).toEqual({ tipo: "nao_saiu", mensagem: "Token inválido (código 601)", tentarDeNovo: false, configuracao: true });
    expect(lerCertidao("FEDERAL", { code: 615, code_message: "Site indisponível" })).toMatchObject({ tentarDeNovo: true, configuracao: false });
    expect(lerCertidao("FEDERAL", { code: 612, code_message: "Sem resultado" })).toMatchObject({ tentarDeNovo: false });
    expect(lerCertidao("FEDERAL", { code_message: "Sem resposta da InfoSimples: timeout" })).toMatchObject({ tentarDeNovo: true, mensagem: "Sem resposta da InfoSimples: timeout" });
    expect(lerCertidao("FEDERAL", { code: 200, data: [] })).toMatchObject({ tipo: "nao_saiu" });
  });

  it("datas e o nome do arquivo", () => {
    expect([dataDaInfoSimples("01/02/2027"), dataDaInfoSimples("2027-02-01T10:00:00"), dataDaInfoSimples("ontem"), dataDaInfoSimples(null)]).toEqual(["2027-02-01", "2027-02-01", null, null]);
    expect(nomeDoComprovante("FEDERAL", "Empresa: Fictícia/Ltda", "2026-10-28", "pdf")).toBe("CND Federal - Empresa Fictícia Ltda - 2026-10-28.pdf");
  });
});
