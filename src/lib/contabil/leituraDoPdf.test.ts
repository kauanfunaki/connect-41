// A leitura de um PDF inteiro (o laço de `varrer` do SPED Generator) e a chave
// de negócio (`db.chave_negocio_pagamento`). Os casos do motor que passavam
// por pdfplumber e OCR viram aqui textos de página; o resto é o mesmo.
import { describe, expect, it } from "vitest";
import { chaveNegocioPagamento, competenciaDoPagamento, lerDocumento, type RegistroLido } from "./leituraDoPdf";

const BLD = "17122471";

const RPA = [
  "RECIBO DE PAGAMENTO A AUTÔNOMO",
  "Empresa :176 - BLD LOGISTICA LTDA Data do serviço : 01/04/2025",
  "CNPJ/CEI : 17.122.471/0001-75 Centro de Custo : 7",
  "Recebi da empresa acima identificada, a importância de R$ 3.724,71",
  "30 Honorário Autônomo 3.888,00",
  "9105 Inss Contribuinte Individual 11,00 85,53",
  "9135 I.S.S. 77,76",
  "Líquido >>> 3.724,71",
  "Nome : ABIMAEL MARIN CAMILO Inscrição do INSS:212.63438.79.4",
  "CPF:101.426.679-35",
  "PINHAIS, 30 de Abril de 2025.",
].join("\n");

const VERA =
  "CONTRATO DE LOCAÇÃO\n\nOs signatarios deste instrumento, de um lado a LOCADOR: VERA " +
  "LUCIA FAIS ANTONIASSI portadora do CPF n.° 750.149.550-53, e RG 5202170-7 de outro o " +
  "LOCATARIO: BDL LOGISTICA LTDA pessoa juridica de direito privado, devidamente inscrita " +
  "com CNPJ n° 17.122.471/0001-75 tem justo e contratado o seguinte:\nDO PRAZO DO CONTRATO " +
  "E DO CUSTO\nClausula Primeira: O prazo do presente contrato é de 12 (doze) meses, a " +
  "iniciar em 01 de abril de 2022 a terminar em 31 de marco de 2023.\nClausula Segunda: O " +
  "Aluguel mensal com o IPTU é de R$ 2.300,00 (Dois Mil e Trezentos reais).";

const ler = (tipo: RegistroLido["tipo"], paginas: string[], o: { arquivo?: string; pasta?: string } = {}) =>
  lerDocumento({ tipo, paginas, arquivo: o.arquivo ?? "documento.pdf", pasta: o.pasta ?? "", raizDoCliente: BLD });

describe("lerDocumento", () => {
  it("RPA: uma linha por recibo, com página e ordem; página vazia só não conta", () => {
    const linhas = ler("rpa", ["", `${RPA}\n${RPA.replace("ABIMAEL MARIN CAMILO", "OUTRO PRESTADOR DA SILVA")}`]);
    expect(linhas.map((l) => [l.pagina, l.ordem, l.situacao])).toEqual([
      [2, 1, "ok"],
      [2, 2, "ok"],
    ]);
    expect(linhas[0]).toMatchObject({
      tipo: "rpa",
      competencia: "2025-04",
      nome: "ABIMAEL MARIN CAMILO",
      documento: "10142667935",
      brutoCentavos: 388800,
      liquidoCentavos: 372471,
      categoria: "",
      chaveNegocio: "rpa|10142667935|2025-04-30|3888.00",
    });
    expect(linhas[0].retencoes).toHaveLength(2);
  });

  it("RPA achado em pasta de recibo: 'conferir', com o motivo", () => {
    const [linha] = ler("recibo", [RPA]);
    expect(linha.tipo).toBe("recibo");
    expect(linha.situacao).toBe("conferir");
    expect(linha.observacao).toBe("layout de RPA achado em pasta de recibo — confira se o tipo está certo antes de contar");
    expect(linha.retencoes).toHaveLength(2);
  });

  it("RPA em pasta de recibo que já era 'conferir' mantém o motivo dele", () => {
    const [linha] = ler("recibo", [RPA.replace("Líquido >>> 3.724,71", "Líquido >>> 3.000,00")]);
    expect(linha.situacao).toBe("conferir");
    expect(linha.observacao).toMatch(/^não fecha:/);
  });

  it("contrato de locação achado em pasta de recibo: 'conferir', e não um pagamento comum", () => {
    const [linha] = ler("recibo", [VERA], { arquivo: "CONTRATO VERA - R$2.500,00.pdf" });
    expect(linha.situacao).toBe("conferir");
    expect(linha.observacao).toBe(
      "layout de CONTRATO DE LOCAÇÃO achado em pasta de recibo — contrato é cadastro, não pagamento: " +
        "confira o tipo do documento antes de contar | o nome do arquivo diz R$ 2,500.00 e o contrato diz R$ 2,300.00; vale o contrato",
    );
    expect(linha.documento).toBe("75014955053");
  });

  it("recibo: o layout MEI antes do genérico", () => {
    const mei =
      "45.262.666 SANDRO MARCEL CAETANO\nCNPJ\n45.262.666/0001-56\nRecebido de: BLD Logística Número do recibo: 00026\n" +
      "CNPJ 17.122.471/0001-75 Data: 13/02/2025\nData de pagamento: 10/02/2025\nTotal: R$ 2.870,00";
    const [linha] = ler("recibo", [mei]);
    expect(linha).toMatchObject({ numero: "00026", documento: "45262666000156", competencia: "2025-02", situacao: "ok" });
  });

  it("contrato de locação: o documento inteiro, uma linha só, na página 1", () => {
    // O contrato "PINHAIS - VERA LUCIA" do motor, que lá chegava por OCR; aqui o texto já vem lido.
    const linhas = ler("contrato_locacao", [VERA, "Clausula Decima: foro de Pinhais."], { arquivo: "CONTRATO PINHAIS.pdf" });
    expect(linhas).toHaveLength(1);
    expect(linhas[0]).toMatchObject({ pagina: 1, ordem: 1, documento: "75014955053", brutoCentavos: 230000, situacao: "ok" });
    expect(linhas[0].nome).toContain("VERA LUCIA");
  });

  it("o valor do contrato pode estar numa página adiante", () => {
    const [primeira, segunda] = VERA.split("Clausula Segunda");
    const [linha] = ler("contrato_locacao", [primeira, "", `Clausula Segunda${segunda}`]);
    expect(linha.brutoCentavos).toBe(230000);
  });

  it("PDF de imagem: a lápide diz que não há texto e que os valores vão à mão", () => {
    const linhas = ler("contrato_locacao", ["", "  \n"], { arquivo: "CONTRATO PINHAIS.pdf" });
    expect(linhas).toEqual([
      expect.objectContaining({
        pagina: 0,
        ordem: 1,
        situacao: "invalido",
        observacao: "nenhuma das 2 páginas tem texto (PDF de imagem — preencha os valores à mão)",
        brutoCentavos: null,
        chaveNegocio: "",
      }),
    ]);
  });

  it("texto que não bate no layout: a lápide diz isso", () => {
    const [linha] = ler("contrato_motorista", ["DANFE - DOCUMENTO AUXILIAR DA NOTA FISCAL"], { pasta: "NOVOS 2.0/05.2025 - CATEGORIAS/TAC" });
    expect(linha).toMatchObject({
      pagina: 0,
      situacao: "invalido",
      observacao: "texto lido, mas nenhuma página bate no layout de contrato_motorista",
      competencia: "2025-05",
    });
  });

  it("contrato de motorista e fatura passam pelos leitores deles", () => {
    const contrato =
      "RECIBO DE PAGAMENTO DE SERVIÇO\nCNPJ: 17.122.471/0001-75\nNome: JADIR BYHAIN\nCPF: 968.672.569-53\n" +
      "Valor recebido: 1800\nData do recebimento: 30 setembro 2025";
    expect(ler("contrato_motorista", [contrato])[0]).toMatchObject({ brutoCentavos: 180000, competencia: "2025-09", situacao: "ok" });
    const fatura = "LOCALIZA FLEET S.A.\nCNPJ: 16.670.085/0001-55\nFATURA 123456\nDATA DE EMISSÃO: 05/01/2025\nVALOR TOTAL R$ 1.000,00";
    expect(ler("fatura", [fatura])[0]).toMatchObject({
      categoria: "fatura_aluguel_veiculo",
      competencia: "2025-01",
      chaveNegocio: "fatura|16670085000155|2025-01-05|1000.00",
    });
  });

  it("documento sem páginas é tratado como imagem, como no motor", () => {
    expect(ler("rpa", [])[0].observacao).toBe("nenhuma das 0 páginas tem texto (PDF de imagem — preencha os valores à mão)");
  });
});

describe("competência (_competencia)", () => {
  it("data de pagamento > data do serviço > pasta", () => {
    expect(competenciaDoPagamento({ dataPagamento: "2025-08-13", dataServico: "2025-07-01" }, ["07.2025 - CATEGORIAS"])).toBe("2025-08");
    expect(competenciaDoPagamento({ dataPagamento: "", dataServico: "2025-07-01" }, ["06.2025 - CATEGORIAS"])).toBe("2025-07");
    expect(competenciaDoPagamento({ dataPagamento: "", dataServico: "" }, ["NOVOS", "13-08-25", "FEVEREIRO 2025"])).toBe("2025-02");
    expect(competenciaDoPagamento({ dataPagamento: "", dataServico: "" }, ["TAC"])).toBe("");
  });

  it("a pasta vem com barra ou contrabarra", () => {
    const [linha] = lerDocumento({ tipo: "rpa", paginas: ["nada"], arquivo: "x.pdf", pasta: "ACERVO\\03.2025 - CATEGORIAS\\TAC", raizDoCliente: BLD });
    expect(linha.competencia).toBe("2025-03");
  });
});

describe("testar_chave_de_negocio (db.chave_negocio_pagamento)", () => {
  it("sem valor, dois recibos do mesmo emitente colidem -- é a origem do falso positivo", () => {
    expect(chaveNegocioPagamento("recibo", "35030207000193", "", "", null)).toBe(
      chaveNegocioPagamento("recibo", "35030207000193", "", "", null),
    );
  });

  it("com o valor preenchido, as chaves separam", () => {
    expect(chaveNegocioPagamento("recibo", "35030207000193", "", "", 658545)).not.toBe(
      chaveNegocioPagamento("recibo", "35030207000193", "", "", 483368),
    );
    expect(chaveNegocioPagamento("recibo", "35030207000193", "", "", 658545)).toBe("recibo|35030207000193||6585.45");
  });

  it("e o discriminador de fato separa linhas idênticas da mesma fatura", () => {
    const comDisc = chaveNegocioPagamento("fatura", "111", "", "2025-07-28", 209075, "17");
    const semDisc = chaveNegocioPagamento("fatura", "111", "", "2025-07-28", 209075);
    expect(comDisc).not.toBe(semDisc);
    expect(comDisc.endsWith("|17")).toBe(true);
  });

  it("documento antes do nome; sem nenhum dos dois, chave vazia", () => {
    expect(chaveNegocioPagamento("rpa", "101.426.679-35", "ABIMAEL", "2025-04-30", 100)).toBe("rpa|10142667935|2025-04-30|1.00");
    expect(chaveNegocioPagamento("rpa", "", "  abimael   marin ", "", 5)).toBe("rpa|ABIMAEL MARIN||0.05");
    expect(chaveNegocioPagamento("rpa", "", "", "2025-04-30", 100)).toBe("");
  });
});
