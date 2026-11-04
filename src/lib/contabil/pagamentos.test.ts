// Os testes do passo 5 do SPED Generator (`testes.py`), portados: os mesmos
// casos e os mesmos números. A diferença é a conta: o motor guardava a
// classificação ("2.1.3.01.1020") e a traduzia para o reduzido ("2344") só na
// planilha; aqui ela já é o reduzido.
import { describe, expect, it } from "vitest";
import { chaveDoNome, type ContaDoPlano } from "./lancamentos";
import {
  CATEGORIAS, CONTAS_DO_MOTOR, ORIGEM, PlanoDeFornecedores, categoriaDoPagamento, entraNoLancamento, montarPagamentos, motoristasDoMes, tipoDaCategoria,
  type Pagamento, type Retencao,
} from "./pagamentos";

const conta = (classificacao: string, reduzido: string, nome: string): ContaDoPlano => ({ classificacao, reduzido, nome });
const reais = (v: number) => Math.round(v * 100);

function pag(tipo: string, nome: string, valor: number, o: Partial<Pagamento> & { caminho?: string } = {}): Pagamento {
  const { caminho, ...resto } = o;
  return {
    tipo, categoria: "", nome, documento: "", numero: "", dataPagamento: "2025-01-15", competencia: "2025-01",
    brutoCentavos: reais(valor), liquidoCentavos: reais(valor), retencoes: null, arquivo: "", pasta: caminho ?? "", pagina: 1, ...resto,
  };
}
const fatura = (nome: string, valor: number, documento = "", categoria = "fatura_aluguel_veiculo") =>
  pag("fatura", nome, valor, { documento, categoria, dataPagamento: "2026-01-10", competencia: "2026-01" });
const ret = (...itens: [string, number, string][]): Retencao[] => itens.map(([verba, v, descricao]) => ({ verba, centavos: reais(v), descricao }));

describe("testar_credito_pelo_nome_sem_cnpj", () => {
  it("chave do nome: pontuação, tipo de empresa no fim, documento na frente e acento não contam", () => {
    const cn = chaveDoNome;
    expect(cn("ARVAL BRASIL LTDA.")).toBe("ARVAL BRASIL");
    expect(cn("ARVAL BRASIL LTDA")).toBe("ARVAL BRASIL");
    expect(new Set([cn("LOCALIZA RENT A CAR"), cn("LOCALIZA RENT A CAR SA"), cn("Localiza Rent a Car S/A"), cn("LOCALIZA RENT A CAR S.A.")]).size).toBe(1);
    expect(cn("POSTO SAO BRAZ LTDA")).toBe("POSTO SAO BRAZ");
    expect(cn("OFICINA MECANICA EXEMPLO ME")).toBe("OFICINA MECANICA EXEMPLO");
    expect(cn("44.099.672 JADISON FRANCISCO DAS NEVES CUNHA")).toBe("JADISON FRANCISCO DAS NEVES CUNHA");
    expect(cn("WARLEY RODRIGO DA SILVA 08586992658")).toBe("WARLEY RODRIGO DA SILVA");
    expect(cn("AUTO POSTO PRA FRENTE BRASIL LTDA 03")).not.toBe(cn("AUTO POSTO PRA FRENTE BRASIL LTDA 01"));
    expect(cn("Companhia de Locação das Américas")).toBe("COMPANHIA DE LOCACAO DAS AMERICAS");
  });

  const plano = new PlanoDeFornecedores([
    conta("2.1.3.01.1020", "2344", "ARVAL BRASIL LTDA"),
    conta("2.1.3.01.0306", "1630", "LOCALIZA RENT A CAR SA"),
    conta("2.1.3.01.0239", "1563", "LOCALIZA FLEET S.A."),
    conta("2.1.3.01.0310", "1634", "COMPANHIA DE LOCACAO DAS AMERICAS"),
    conta("2.1.3.01.0700", "1700", "11.111.111 JOAO DA SILVA"),
    conta("2.1.3.01.0701", "1701", "22.222.222 JOAO DA SILVA"),
  ]);
  const categorias = { fatura_aluguel_veiculo: { codigoDebito: "1153", contaCredito: "" } };

  it("nome igual e conta única lança; homônimo, parecido e desconhecido ficam pendentes com o motivo", () => {
    const rel = montarPagamentos([
      fatura("ARVAL BRASIL LTDA.", 100), fatura("LOCALIZA RENT A CAR", 50), fatura("JOAO DA SILVA", 30),
      fatura("COMPANHIA DE LOCACAO DAS AMERICA", 20), fatura("FORNECEDOR QUE NAO EXISTE XPTO", 10),
      fatura("COM DOCUMENTO SEM REGRA LTDA", 5, "12345678000190"), fatura("", 1),
    ], { categorias, plano });
    const porNome = new Map(rel.lancamentos.map((l) => [l.nome, l]));
    const pend = new Map(rel.pendencias.map((p) => [p.rotulo, p]));

    expect(porNome.get("ARVAL BRASIL LTDA.")).toMatchObject({ credito: "2344", origemDoCredito: ORIGEM.plano, debito: "1153", codigoHistorico: "134", historico: "000 ARVAL BRASIL LTDA" });
    expect(porNome.get("LOCALIZA RENT A CAR")?.credito).toBe("1630");
    const joao = pend.get("JOAO DA SILVA")!;
    expect(joao.homonimos).toHaveLength(2);
    expect(joao.motivo).toContain("2 contas");
    const comp = pend.get("COMPANHIA DE LOCACAO DAS AMERICA")!;
    expect(comp.sugestao?.classificacao).toBe("2.1.3.01.0310");
    expect(comp.motivo).toContain("parecida");
    expect(pend.get("FORNECEDOR QUE NAO EXISTE XPTO")!.motivo).toContain("não há conta");
    const doc = pend.get("COM DOCUMENTO SEM REGRA LTDA")!;
    expect(doc.temDocumento).toBe(true);
    expect(doc.motivo).toContain("Tem CPF/CNPJ");
    const sem = pend.get("(sem nome)")!;
    expect(sem.chave).toBe("(sem identificação)");
    expect(sem.motivo).toContain("sem nome");
  });

  it("precedência: CPF/CNPJ > confirmado para o nome > plano > padrão da categoria", () => {
    const rel = montarPagamentos(
      [fatura("ARVAL BRASIL LTDA.", 100), fatura("JOAO DA SILVA", 30), fatura("FORNECEDOR QUE NAO EXISTE XPTO", 10), fatura("COM DOCUMENTO SEM REGRA LTDA", 5, "12345678000190")],
      {
        categorias: { fatura_aluguel_veiculo: { codigoDebito: "1153", contaCredito: "0001" } },
        contasDoFornecedor: new Map([["12345678000190", "9999"]]),
        contasPorNome: new Map([[chaveDoNome("JOAO DA SILVA"), "1701"], [chaveDoNome("ARVAL BRASIL"), "5555"]]),
        plano,
      },
    );
    const l = new Map(rel.lancamentos.map((x) => [x.nome, x]));
    expect(l.get("COM DOCUMENTO SEM REGRA LTDA")).toMatchObject({ credito: "9999", origemDoCredito: ORIGEM.cnpj });
    expect(l.get("JOAO DA SILVA")).toMatchObject({ credito: "1701", origemDoCredito: ORIGEM.nomeConfirmado });
    expect(l.get("ARVAL BRASIL LTDA.")?.credito).toBe("5555");
    expect(l.get("FORNECEDOR QUE NAO EXISTE XPTO")?.origemDoCredito).toBe(ORIGEM.categoria);
    expect(rel.pendencias).toEqual([]);
  });

  it("com CNPJ e sem regra, a conta de nome igual vira sugestão, não lançamento", () => {
    const rel = montarPagamentos([fatura("ARVAL BRASIL LTDA", 7, "99888777000166")], { categorias, plano });
    expect(rel.lancamentos).toEqual([]);
    expect(rel.pendencias[0].sugestao?.classificacao).toBe("2.1.3.01.1020");
    expect(rel.pendencias[0].motivo).toContain("mesmo nome");
  });

  it("categoria sem código: o motivo aponta a regra de categoria", () => {
    const rel = montarPagamentos([fatura("ARVAL BRASIL LTDA.", 1, "", "categoria_sem_codigo")], { plano });
    expect(rel.pendencias.some((p) => p.falta === "codigo_debito" && p.motivo.includes("código de débito"))).toBe(true);
  });
});

describe("testar_lancamentos_modelo_do_passo5", () => {
  const plano = new PlanoDeFornecedores([
    conta("2.1.3.01.2318", "3904", "LOCALIZA VEICULOS ESPECIAIS S.A."),
    conta("2.1.3.01.6118", "7790", "MGR ADMINISTRADORA DE BENS PROPRIOS LTDA"),
    conta("2.1.3.01.0500", "5000", "JOAO MOTORISTA"),
  ]);
  // As regras da tela dizem outra coisa (601, 525): o modelo tem de vencer.
  const categorias = {
    contrato_motorista: { codigoDebito: "601", contaCredito: "" }, recibo_motorista: { codigoDebito: "601", contaCredito: "" },
    rpa: { codigoDebito: "525", contaCredito: "" }, fatura_aluguel_imovel: { codigoDebito: "341", contaCredito: "" },
    fatura_aluguel_veiculo: { codigoDebito: "1153", contaCredito: "" },
  };
  const rel = montarPagamentos([
    pag("contrato_motorista", "Joao Motorista", 1000, { documento: "11122233344" }),
    pag("contrato_motorista", "MARIA SEM CONTRATO", 500, { numero: "0123" }),
    pag("recibo", "PEDRO RECIBO", 300, { caminho: "RECIBOS MOTORISTAS/x.pdf" }),
    pag("recibo", "", 120, { documento: "99988877766", caminho: "RECIBOS MOTORISTAS/y.pdf", dataPagamento: "" }),
    pag("fatura", "LOCALIZA RENT", 2000, { documento: "12345678000199", numero: "10963", categoria: "fatura_aluguel_veiculo" }),
    pag("fatura", "RESERVA IMOBILIARIA", 4000, { documento: "28697624000129", categoria: "fatura_aluguel_imovel" }),
    pag("rpa", "A", 1000, { retencoes: ret(["9105", 11, "INSS"], ["9135", 50, "ISS"], ["9402", 1.5, "SEST"], ["9403", 1, "SENAT"]) }),
    pag("rpa", "B", 500.25, { retencoes: ret(["9105", 5.5, "INSS"], ["9135", 25, "ISS"], ["9401", 1.25, "SEST/SENAT"]) }),
    pag("rpa", "C", 200, { competencia: "2025-02", dataPagamento: "2025-02-10", retencoes: [] }),
    pag("rpa", "D", 99, { retencoes: ret(["9999", 9, "IRRF"]) }),
  ], { categorias, plano, contasDoFornecedor: new Map([["11122233344", "5000"], ["12345678000199", "3904"], ["28697624000129", "7790"]]) });
  const por = new Map(rel.lancamentos.map((l) => [`${l.categoria}|${l.nome}`, l]));
  const resumo = (k: string) => { const l = por.get(k); return l && [l.debito, l.credito, l.codigoHistorico, l.historico]; };

  it("motorista: D 7535 / C 7251 mesmo com conta própria, hist. 133 + nº (000 sem) + nome", () => {
    expect(resumo("contrato_motorista|Joao Motorista")).toEqual(["7535", "7251", "133", "000 JOAO MOTORISTA"]);
    expect(por.get("contrato_motorista|MARIA SEM CONTRATO")?.historico).toBe("0123 MARIA SEM CONTRATO");
    expect(resumo("recibo_motorista|PEDRO RECIBO")?.slice(0, 2)).toEqual(["7535", "7251"]);
    expect(por.get("recibo_motorista|PEDRO RECIBO")?.historico).toBe("000 PEDRO RECIBO");
  });

  it("fatura de veículo e aluguel de imóvel: o nome do histórico é o da conta de crédito", () => {
    expect(resumo("fatura_aluguel_veiculo|LOCALIZA RENT")).toEqual(["1153", "3904", "134", "10963 LOCALIZA VEICULOS ESPECIAIS S.A."]);
    expect(resumo("fatura_aluguel_imovel|RESERVA IMOBILIARIA")).toEqual(["341", "7790", "135", "- MGR ADMINISTRADORA DE BENS PROPRIOS LTDA"]);
  });

  it("RPA: uma folha por mês, no último dia, D 4192 contra ISS, INSS, SEST/SENAT e líquido", () => {
    const rpa = rel.lancamentos.filter((l) => l.categoria === "rpa");
    const jan = new Map(rpa.filter((l) => l.competencia === "2025-01").map((l) => [l.credito, l]));
    expect([...jan.keys()].sort()).toEqual(["191", "525", "578", "580"]);
    expect([...jan.values()].every((l) => l.debito === "4192" && l.data === "2025-01-31" && l.historico === "01/2025")).toBe(true);
    expect(["580", "191", "578", "525"].map((c) => [c, jan.get(c)!.centavos, jan.get(c)!.codigoHistorico])).toEqual([["580", 7500, "66"], ["191", 1650, "21"], ["578", 375, "33"], ["525", 140500, "20"]]);
    const fev = rpa.filter((l) => l.competencia === "2025-02");
    expect(fev.map((l) => [l.credito, l.centavos, l.data])).toEqual([["525", 20000, "2025-02-28"]]);
  });

  it("RPA com retenção desconhecida fica fora da folha, com o motivo", () => {
    const p = rel.pendencias.find((x) => x.chave === "verba 9999");
    expect(p?.falta).toBe("retencao");
    expect(p?.motivo).toContain("não prevê");
  });

  it("sem nome vai o CPF/CNPJ; sem data, o último dia da competência; os totais fecham", () => {
    expect(por.get("recibo_motorista|")).toMatchObject({ historico: "000 99988877766", data: "2025-01-31" });
    expect(rel.documentosLancados).toBe(9);
    expect(rel.centavosLancados).toBe(962025);
    expect(rel.lancamentos.reduce((s, l) => s + l.centavos, 0)).toBe(962025);
  });

  it("as contas do modelo são da empresa: trocar uma muda o lançamento", () => {
    const outro = montarPagamentos([pag("contrato_motorista", "ZE", 10)], { contas: { ...CONTAS_DO_MOTOR, motoristaDebito: "9000", motoristaHistorico: "77" } });
    expect(outro.lancamentos[0]).toMatchObject({ debito: "9000", credito: "7251", codigoHistorico: "77" });
  });
});

describe("testar_imobilizado_e_recibo (a parte do passo 5)", () => {
  it("recibo de outras despesas: D da regra da categoria, histórico RECIBO + nome, sem código", () => {
    const rel = montarPagamentos(
      [pag("recibo", "Lavacao do Joao", 80, { documento: "12345678000100", dataPagamento: "2025-01-20", caminho: "RECIBOS/x.pdf" })],
      { categorias: { recibo_outros: { codigoDebito: "465", contaCredito: "" } }, contasDoFornecedor: new Map([["12345678000100", "9999"]]) },
    );
    expect(rel.lancamentos[0]).toMatchObject({ debito: "465", credito: "9999", codigoHistorico: "", historico: "RECIBO LAVACAO DO JOAO" });
  });
});

describe("testar_tipo_e_passo3_do_passo5", () => {
  it("toda categoria do catálogo tem tipo; fora do catálogo mostra o próprio nome", () => {
    expect(CATEGORIAS.filter(([c]) => tipoDaCategoria(c).documento === "")).toEqual([]);
    expect(tipoDaCategoria("fatura_aluguel_imovel")).toEqual({ assunto: "Imóvel", documento: "fatura de aluguel" });
    expect(tipoDaCategoria("contrato_locacao_veiculo").assunto).toBe("Veículo");
    expect(tipoDaCategoria("desconhecida")).toEqual({ assunto: "desconhecida", documento: "" });
  });

  it("a pendência por pessoa guarda todas as categorias, e sem CPF/CNPJ manda à etapa 3", () => {
    const rel = montarPagamentos([
      pag("fatura", "TRANSPORTADORA SEM CNPJ", 300, { categoria: "fatura_aluguel_veiculo" }),
      pag("recibo", "TRANSPORTADORA SEM CNPJ", 50, { caminho: "RECIBOS/x.pdf" }),
      pag("fatura", "COM CNPJ LTDA", 80, { documento: "12345678000199", categoria: "fatura_aluguel_veiculo" }),
    ], { categorias: { fatura_aluguel_veiculo: { codigoDebito: "1153", contaCredito: "" }, recibo_outros: { codigoDebito: "465", contaCredito: "" } } });
    const por = new Map(rel.pendencias.map((p) => [p.rotulo, p]));
    const sem = por.get("TRANSPORTADORA SEM CNPJ")!;
    expect(sem.categorias).toEqual(["fatura_aluguel_veiculo", "recibo_outros"]);
    expect(sem.temDocumento).toBe(false);
    expect(sem.motivo).toContain("etapa 3");
    const com = por.get("COM CNPJ LTDA")!;
    expect(com.temDocumento).toBe(true);
    expect(com.categorias).toEqual(["fatura_aluguel_veiculo"]);
  });
});

describe("testar_pdf_ligado_no_passo5 (o rastro do documento)", () => {
  it("o lançamento e a pendência levam o pagamento e onde o documento abre", () => {
    const rel = montarPagamentos([
      { ...fatura("LOCADORA SEM CONTA", 10), id: "p7", arquivoId: null, numero: "FAT1" },
      { ...fatura("LOCADORA COM CONTA", 20), id: "p8", arquivoId: "arq-1", numero: "FAT1" },
    ], { categorias: { fatura_aluguel_veiculo: { codigoDebito: "1153", contaCredito: "" } }, contasPorNome: new Map([["LOCADORA COM CONTA", "1631"]]) });
    expect(rel.lancamentos[0]).toMatchObject({ pagamentoId: "p8", arquivoId: "arq-1", pagina: 0, fonte: "planilha do BPO · nota FAT1" });
    expect(rel.pendencias[0].exemplos).toEqual([{ fonte: "planilha do BPO · nota FAT1", arquivoId: null, pagina: 1, pagamentoId: "p7" }]);
  });
});

describe("categoria e conferência", () => {
  it("a categoria corrigida ganha; o tipo corrigido descarta a gravada; o recibo segue a escolha do envio", () => {
    expect(categoriaDoPagamento({ tipo: "fatura", categoria: "fatura_aluguel_maquina", arquivo: "" })).toBe("fatura_aluguel_maquina");
    expect(categoriaDoPagamento({ tipo: "fatura", categoria: "fatura_aluguel_veiculo", tipoCorrigido: "contrato_locacao", arquivo: "" })).toBe("contrato_locacao_imovel");
    expect(categoriaDoPagamento({ tipo: "fatura", categoria: "", categoriaCorrigida: "fatura_aluguel_imovel", arquivo: "" })).toBe("fatura_aluguel_imovel");
    expect(categoriaDoPagamento({ tipo: "recibo", categoria: "recibo_motorista", arquivo: "x.pdf" })).toBe("recibo_motorista");
    expect(categoriaDoPagamento({ tipo: "recibo", categoria: "", arquivo: "x.pdf", pasta: "LAVAGENS" })).toBe("recibo_outros");
  });

  it("só o que a leitura deu como ok, ou uma pessoa aceitou, entra; contrato de locação nunca", () => {
    expect(entraNoLancamento({ situacao: "ok", decisao: "", tipo: "recibo" })).toBe(true);
    expect(entraNoLancamento({ situacao: "conferir", decisao: "", tipo: "recibo" })).toBe(false);
    expect(entraNoLancamento({ situacao: "conferir", decisao: "aceito", tipo: "recibo" })).toBe(true);
    expect(entraNoLancamento({ situacao: "ok", decisao: "descartado", tipo: "recibo" })).toBe(false);
    expect(entraNoLancamento({ situacao: "ok", decisao: "", tipo: "contrato_locacao" })).toBe(false);
    expect(entraNoLancamento({ situacao: "ok", decisao: "", tipo: "fatura", tipoCorrigido: "contrato_locacao" })).toBe(false);
  });

  it("o motorista do passo 5 casa a NFS-e do MEI pelo documento ou pelo nome inteiro", () => {
    const casa = motoristasDoMes([pag("contrato_motorista", "FULANO DE TAL", 10, { documento: "11122233344" }), pag("recibo", "BELTRANO", 5, { caminho: "MOTORISTAS" })]);
    expect(casa("57449839000100", "57.449.839 FULANO DE TAL")).toBe("contrato de motorista");
    expect(casa("111.222.333-44", "")).toBe("contrato de motorista");
    expect(casa("", "BELTRANO")).toBe("");
  });
});
