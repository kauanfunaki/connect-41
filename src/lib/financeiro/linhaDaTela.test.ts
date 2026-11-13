import { describe, expect, it } from "vitest";
import { linhaDaTela } from "./linhaDaTela";
import type { LinhaDaConta } from "./data";

// O que se testa (13/11/2026): a linha que vai para o navegador leva só o que
// a tabela mostra, sem os campos vazios — o RSC escreve `null` e
// `"$undefined"` por extenso, e numa lista isso se repete em cada conta.

const diaDe = (d: Date) => d.toISOString().slice(0, 10);

function conta(over: Partial<LinhaDaConta> = {}): LinhaDaConta {
  return {
    id: "e1",
    situacao: "A_VENCER",
    valorCentavos: 12_345,
    vencimentoKey: "2026-11-20",
    vencimento: new Date("2026-11-20T15:00:00Z"),
    previsao: null,
    pagoEm: null,
    competencia: "2026-11",
    descricao: null,
    empresaId: "c1",
    empresaNome: "Empresa Um",
    contraparteNome: "Fornecedor",
    categoriaNome: null,
    rateio: 0,
    retidoCentavos: 0,
    status: "CONFERIDO",
    approvalStatus: "NAO_REQUER",
    documentoId: null,
    closeReason: null,
    parcelaDeAcordo: false,
    centroDeCustoId: null,
    centroDeCustoNome: null,
    projetoNome: null,
    baixadoCentavos: 0,
    numeroDocumento: null,
    emissao: null,
    presaAoOmie: false,
    serie: null,
    ...over,
  };
}

describe("linhaDaTela", () => {
  it("conta simples: só os campos obrigatórios, nenhum vazio", () => {
    const l = linhaDaTela(conta(), { diaDe, mostrarEmpresa: false, mostrarCentro: false });
    expect(l).toEqual({
      id: "e1",
      situacao: "A_VENCER",
      valorCentavos: 12_345,
      vencimento: "2026-11-20",
      competencia: "2026-11",
      contraparte: "Fornecedor",
      status: "CONFERIDO",
    });
    expect(Object.values(l)).not.toContain(null);
    expect(Object.values(l)).not.toContain(undefined);
  });

  it("leva o que existe, com as datas no dia de São Paulo", () => {
    const l = linhaDaTela(
      conta({
        previsao: new Date("2026-11-25T15:00:00Z"),
        descricao: "aluguel",
        categoriaNome: "Aluguel",
        rateio: 2,
        retidoCentavos: 150,
        approvalStatus: "AGUARDANDO",
        documentoId: "d1",
        centroDeCustoNome: "Obra",
        projetoNome: "Projeto X",
        baixadoCentavos: 1_000,
        numeroDocumento: "4512",
        emissao: new Date("2026-11-01T15:00:00Z"),
        presaAoOmie: true,
        serie: "3/12",
        parcelaDeAcordo: true,
      }),
      { diaDe, mostrarEmpresa: true, mostrarCentro: true, cobranca: "EM_COBRANCA" }
    );
    expect(l).toMatchObject({
      previsao: "2026-11-25",
      descricao: "aluguel",
      empresa: "Empresa Um",
      categoria: "Aluguel",
      rateio: 2,
      retidoCentavos: 150,
      aprovacao: "AGUARDANDO",
      documentoId: "d1",
      centro: "Obra",
      projeto: "Projeto X",
      baixadoCentavos: 1_000,
      numeroDocumento: "4512",
      emissao: "2026-11-01",
      presaAoOmie: true,
      serie: "3/12",
      parcelaDeAcordo: true,
      cobranca: "EM_COBRANCA",
    });
  });

  it("empresa e centro só quando a tela mostra a coluna", () => {
    const l = linhaDaTela(conta({ centroDeCustoNome: "Obra" }), { diaDe, mostrarEmpresa: false, mostrarCentro: false });
    expect(l).not.toHaveProperty("empresa");
    expect(l).not.toHaveProperty("centro");
  });

  it("paga: a data da baixa, e a previsão sai — como a tabela mostrava", () => {
    const l = linhaDaTela(
      conta({ situacao: "PAGA", status: "PAGO", pagoEm: new Date("2026-11-10T15:00:00Z"), previsao: new Date("2026-11-25T15:00:00Z") }),
      { diaDe, mostrarEmpresa: false, mostrarCentro: false }
    );
    expect(l.pagoEm).toBe("2026-11-10");
    expect(l).not.toHaveProperty("previsao");
  });

  it("'em dia' na cobrança também vai: é o que tira o 'parcela de acordo' da linha", () => {
    expect(linhaDaTela(conta(), { diaDe, mostrarEmpresa: false, mostrarCentro: false, cobranca: "EM_DIA" }).cobranca).toBe("EM_DIA");
    expect(linhaDaTela(conta(), { diaDe, mostrarEmpresa: false, mostrarCentro: false, cobranca: null })).not.toHaveProperty("cobranca");
  });

  it("é bem menor que a conta inteira, em JSON", () => {
    const inteira = JSON.stringify(conta());
    const naTela = JSON.stringify(linhaDaTela(conta(), { diaDe, mostrarEmpresa: false, mostrarCentro: false }));
    expect(naTela.length).toBeLessThan(inteira.length / 3);
  });
});
