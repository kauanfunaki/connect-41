// Os testes dos leitores de pagamento do SPED Generator (`testes.py`),
// portados: os mesmos textos e os mesmos resultados. Onde o motor usava a raiz
// da BLD implícita, aqui ela vai explícita. Os casos de RPA, recibo de
// motorista, contrato de motorista e fatura que o motor não tinha foram
// montados a partir do layout documentado nos comentários do próprio leitor.
import { describe, expect, it } from "vitest";
import {
  FATURA_IMOVEL, FATURA_VEICULO, categoriaFatura, competenciaDaPasta, lerContratoLocacao, lerContratoMotorista, lerFatura,
  lerPaginaRpa, lerReciboGenerico, lerReciboMotorista, nomeDoRecibo, papelDoCliente, pareceContratoLocacao, semAcento,
  valorBrEmCentavos, valorDoNomeArquivo,
} from "./leitoresDePagamento";

const BLD = "17122471";

describe("testar_nome_do_recibo", () => {
  it("o título 'RECIBO' não é o nome de ninguém", () => {
    expect(nomeDoRecibo("RECIBO\nLUIZ FELIPE DE SOUZA MACIEL\nCPF: 111.222.333-44", "11122233344")).toBe(
      "LUIZ FELIPE DE SOUZA MACIEL",
    );
  });

  it("o CPF colado na razão social do MEI sai do nome", () => {
    const textoMei =
      "RONALDO CESAR IOZEWIAKI 11176352954\nCNPJ\n38.108.058/0001-26\nRecebido de: BLD LOGISTICA\nTotal: R$ 1.551,50";
    expect(nomeDoRecibo(textoMei, "38108058000126")).toBe("RONALDO CESAR IOZEWIAKI");
  });

  it("com o CNPJ na linha de baixo, o nome vem da linha acima dele", () => {
    const textoPj =
      "GS CARGO SERVICOS E LOCACAO DE\nRASTREADORES EIRELI\n" +
      "CNPJ: 32.598.742/0001-57 | Inscrição Estadual: 121.054.634.113\n" +
      "Recibo de Locação nº 0000014106";
    expect(nomeDoRecibo(textoPj, "32598742000157")).toBe("RASTREADORES EIRELI");
  });

  it("quando o nome está dentro da frase, é o nome que sai — não a frase", () => {
    expect(
      nomeDoRecibo(
        "RECIBO\nServiços realizados pelo motorista DIEGO MONTOVANI\nno período de 01/11 a 15/11\nCPF 056.359.049-12",
        "05635904912",
      ),
    ).toBe("DIEGO MONTOVANI");
  });

  it("a fórmula 'Eu, FULANO, inscrito no CPF' também é lida", () => {
    expect(nomeDoRecibo("Eu, William Leone Tenkof Acosta, inscrito no CPF 123.456.789-00", "")).toBe(
      "William Leone Tenkof Acosta",
    );
  });

  it("valor por extenso não é nome — e vazio é resposta melhor que palpite", () => {
    expect(nomeDoRecibo("RECIBO\na importância de Duzentos e setenta e cinco reais\nR$ 275,40")).toBe("");
  });

  it("marca d'água de aplicativo de digitalização é descartada", () => {
    expect(nomeDoRecibo("Scanned by TapScanner\nJOAO DA SILVA ME")).toBe("JOAO DA SILVA ME");
  });

  it("'em nome de FULANO' vence a âncora do documento, e o nome quebrado se junta", () => {
    expect(
      nomeDoRecibo(
        "Recibo R$ 717,33\nPagamento realizado via Pix 41998164970 em nome de Olga Regina\n" +
          "da Silva Falcão Brandão, CPF: 322.772.539-87.",
        "32277253987",
      ),
    ).toBe("Olga Regina da Silva Falcão Brandão");
  });

  it("as partículas 'de/da/dos' sobrevivem — são parte do nome, não conectivo", () => {
    expect(nomeDoRecibo("Pagamento via Pix em nome de BEATRIZ SCREMIN LIMA DE SOUZA.")).toBe(
      "BEATRIZ SCREMIN LIMA DE SOUZA",
    );
  });

  it("e o conectivo de verdade continua sendo cortado", () => {
    expect(nomeDoRecibo("Serviços realizados pelo motorista DIEGO MONTOVANI no dia 12")).toBe("DIEGO MONTOVANI");
  });

  it("texto vazio devolve vazio, não erro", () => {
    expect(nomeDoRecibo("")).toBe("");
  });

  // Da porta: o `\b` do JS não vê letra acentuada como letra. "NOÉ" não é o
  // conectivo "no" -- no Python não era, e aqui também não pode ser.
  it("conectivo seguido de letra acentuada não corta o nome", () => {
    expect(nomeDoRecibo("Serviços realizados pelo motorista DIEGO NOÉ SANTOS")).toBe("DIEGO NOÉ SANTOS");
  });

  it("a linha com o nome ou a raiz do cliente não é o fornecedor", () => {
    expect(nomeDoRecibo("BLD LOGISTICA LTDA\nFULANO DE TAL", "", BLD, ["BLD"])).toBe("FULANO DE TAL");
    expect(nomeDoRecibo("EMPRESA 17.122.471 LTDA\nFULANO DE TAL", "", BLD)).toBe("FULANO DE TAL");
    // Como no motor com outra raiz: a linha com número de CNPJ e LTDA não é nome de gente.
    expect(nomeDoRecibo("EMPRESA 17.122.471 LTDA\nFULANO DE TAL", "", "99999999")).toBe("FULANO DE TAL");
  });
});

describe("testar_categoria_da_fatura_vem_do_documento", () => {
  const vamos = "VAMOS LOCACAO DE CAMINHOES, MAQUINAS E EQUIPAMENTOS S.A.";

  it("a razão social da VAMOS sozinha não faz mais a fatura virar máquina", () => {
    expect(categoriaFatura(vamos)).toBe("fatura_aluguel_veiculo");
  });

  it("e com o item de caminhão junto continua veículo", () => {
    expect(categoriaFatura(`${vamos}\nFATURA 217521185\nLocacao de veiculo pesado - cavalo mecanico`)).toBe(
      "fatura_aluguel_veiculo",
    );
  });

  it("máquina de verdade continua sendo reconhecida", () => {
    expect(categoriaFatura("FORNECEDOR X\nLocacao de equipamento industrial")).toBe("fatura_aluguel_maquina");
    expect(categoriaFatura("Aluguel de maquina de solda mensal")).toBe("fatura_aluguel_maquina");
    expect(categoriaFatura("FROTA SERVICOS\nEmpilhadeira eletrica mensal")).toBe("fatura_aluguel_maquina");
  });

  it("e o desempate de veículo segue valendo", () => {
    expect(categoriaFatura("LOCALIZA FLEET S.A.\nAluguel de frota")).toBe("fatura_aluguel_veiculo");
  });

  // O texto real, colado como o pdfplumber o entrega -- sem espaço entre as palavras.
  const real =
    "FATURADELOCAÇÃO Nº 216870303 1ªVIA-CLIENTE\n" +
    "VAMOSLOCAÇÃOCAMIN.MAQUINASEQUIP NATUREZADAOPERAÇÃO: LOCAÇÃODEVEÍCULOSPESADOS\n" +
    "RDRRENATOPAESDEBARROS1017ANDAR9SALA21017\n" +
    "ITAIMBIBI-CEP:04530-001-SAOPAULO-SP\n" +
    "1 93ZC635BZS8211157 P:01/08/2025a31/08/2025 30 R$ 7.470,00\n" +
    "Dispensadaemissãodedocumentofiscal-locaçãodebensmóveis VALORDALOCAÇÃOR$ 104.410,00";

  it("a fatura real da VAMOS, sem espaços, é veículo -- e não imóvel por causa da SALA", () => {
    expect(categoriaFatura(real)).toBe("fatura_aluguel_veiculo");
    expect(FATURA_IMOVEL.test(real)).toBe(false);
    expect(FATURA_VEICULO.test(real)).toBe(true);
  });

  it("e locação de sala DE VERDADE continua sendo imóvel", () => {
    expect(categoriaFatura("IMOBILIARIA XV\nLocacao de sala comercial mensal")).toBe("fatura_aluguel_imovel");
  });
});

describe("testar_locataria_e_assinatura_no_contrato (o papel do cliente)", () => {
  // Os três primeiros passavam pelo `_veredito_locataria` do validador, que
  // decide pelo `papel_da_bld`: "BLD é a locatária" é papel 'locataria'.
  it("NIRE de 11 dígitos na frente do CNPJ não engana: o cliente é o locatário", () => {
    const cintia =
      "LOCADORA: CÍNTIA ENDO, brasileira, CPF 033.789.599-67. LOCATÁRIO: BATEL " +
      "TRANSPORTES LOGISTICA E DISTRIBUIÇÃO LTDA, com Registro na Junta Comercial do " +
      "Paraná sob o NIRE: 41207416153, em 10/08/2012, inscrita no CNPJ sob o nº " +
      "17.122.471/0001-75, com sede na Rua Altônia, 434.";
    expect(papelDoCliente(cintia, BLD)).toBe("locataria");
  });

  it("rótulo que FECHA a qualificação vence o 'LOCADOR(A):' do começo do parágrafo", () => {
    const conceito =
      "LOCADOR(A): CARLA RENATA LINHARES DE LARA SCHIMANESKI, brasileira, neste ato " +
      "representada pela sua ADMINISTRADORA a IMOBILIÁRIA CONCEITO IMÓVEIS PONTA GROSSA " +
      "EIRELI-ME, inscrita no C.N.P.J. sob n° 24.567.467/0001-86, celebra(am) com o(a)(s) " +
      "a Sr.(a)(s) BLD LOGISTICA LTDA, empresa de direito privado, inscrito(a) no CNPJ sob " +
      "nº 17.122.471/0001-75, com sede a RUA ALTONIA, 434, PINHAIS, PR, representado por " +
      "GABRIEL HENRIQUE BADAN GERALDO, Brasileiro(a), solteiro, inscrito(a) no CPF sob n º " +
      "086.451.459-01, portador(a) da cédula de identidade R.G. sob n° 487467656 SESP/SP, " +
      "residente e domiciliado á RUA JOSE DUDEK, 85, PINHEIRINHO, CURITIBA, PR, doravante " +
      "denominado(a)(s) LOCATÁRIO(A)(S), mediante as cláusulas que seguem:";
    expect(papelDoCliente(conceito, BLD)).toBe("locataria");
  });

  it("parágrafo corrido: o 'denominada LOCADORA' fecha a OUTRA parte", () => {
    const corrido =
      "KATIA MARA, CPF 866.532.969-20, doravante denominada LOCADORA, e BLD LOGISTICA " +
      "LTDA, CNPJ 17.122.471/0001-75, doravante denominada LOCATÁRIA, têm justo o seguinte:";
    expect(papelDoCliente(corrido, BLD)).toBe("locataria");
  });

  it("bloco de assinatura: rótulo com dois-pontos abre, e o mais perto antes do CNPJ decide", () => {
    const assinatura =
      "LOCADOR(A): ______ Imobiliária Conceito\nLOCATÁRIO(A):______\nBLD LOGISTICA LTDA\n" +
      "CNPJ: 17.122.471/0001-75\nGABRIEL HENRIQUE BADAN GERALDO";
    expect(papelDoCliente(assinatura, BLD)).toBe("locataria");
  });

  it("cliente como LOCADOR é dito como tal -- é receita dele, não aluguel pago", () => {
    const locadora =
      "LOCADORA: BLD LOGISTICA LTDA, CNPJ 17.122.471/0001-75. LOCATÁRIO: PAULO " +
      "HENRIQUE DA SILVA, CPF 111.222.333-44.";
    expect(papelDoCliente(locadora, BLD)).toBe("locadora");
    const lido = lerContratoLocacao(locadora, BLD);
    expect(lido?.situacao).toBe("invalido");
    expect(lido?.observacao).toContain("LOCADOR");
  });

  it("sem o CNPJ do cliente, não há papel", () => {
    const outro = "LOCADORA: KATIA MARA, CPF 866.532.969-20. LOCATÁRIO: GABRIEL BADAN, CPF 086.451.459-01.";
    expect(papelDoCliente(outro, BLD)).toBe("");
    const lido = lerContratoLocacao(outro, BLD);
    expect(lido?.situacao).toBe("invalido");
    expect(lido?.observacao).toBe("o CNPJ do cliente não aparece neste contrato (locatário: GABRIEL BADAN)");
  });

  it("a raiz é do cliente, não da BLD: outro cliente, outro papel", () => {
    const corrido =
      "KATIA MARA, CPF 866.532.969-20, doravante denominada LOCADORA, e BLD LOGISTICA " +
      "LTDA, CNPJ 17.122.471/0001-75, doravante denominada LOCATÁRIA, têm justo o seguinte:";
    expect(papelDoCliente(corrido, "86653296")).toBe("locadora");
    expect(papelDoCliente(corrido, "")).toBe("");
  });
});

describe("testar_tipo_corrigivel (o detector de contrato de locação)", () => {
  it("exige as duas partes", () => {
    expect(pareceContratoLocacao("o LOCADOR ANAGE LTDA e o LOCATÁRIO BLD ...")).toBe(true);
    expect(pareceContratoLocacao("Recibo de LOCAÇÃO do mês de agosto R$ 500,00")).toBe(false);
    expect(pareceContratoLocacao("EVERALDO SOARES LOCACOES EIRELI")).toBe(false);
    expect(pareceContratoLocacao("")).toBe(false);
  });
});

describe("contrato de locação (o texto do contrato 'PINHAIS - VERA LUCIA')", () => {
  const vera =
    "CONTRATO DE LOCAÇÃO\n\nOs signatarios deste instrumento, de um lado a LOCADOR: VERA " +
    "LUCIA FAIS ANTONIASSI portadora do CPF n.° 750.149.550-53, e RG 5202170-7 de outro o " +
    "LOCATARIO: BDL LOGISTICA LTDA pessoa juridica de direito privado, devidamente inscrita " +
    "com CNPJ n° 17.122.471/0001-75 tem justo e contratado o seguinte:\nDO PRAZO DO CONTRATO " +
    "E DO CUSTO\nClausula Primeira: O prazo do presente contrato é de 12 (doze) meses, a " +
    "iniciar em 01 de abril de 2022 a terminar em 31 de marco de 2023.\nClausula Segunda: O " +
    "Aluguel mensal com o IPTU é de R$ 2.300,00 (Dois Mil e Trezentos reais).";

  it("a locadora sai com o CPF, e o aluguel também", () => {
    const lido = lerContratoLocacao(vera, BLD);
    expect(lido?.nome).toContain("VERA LUCIA");
    expect(lido?.documento).toBe("75014955053");
    expect(lido?.brutoCentavos).toBe(230000);
    expect(lido?.dataPagamento).toBe("");
    expect(lido?.situacao).toBe("ok");
  });

  it("o valor do nome do arquivo só confere, nunca substitui", () => {
    expect(valorDoNomeArquivo("CONTRATO - APS . LUIZ RICARDO R$R$8.500,00 - BLD LOGÍSTICA.pdf")).toBe(850000);
    expect(valorDoNomeArquivo("CONTRATO - ANAGE IMÓVEIS - R$5800,00.pdf")).toBe(580000);
    expect(valorDoNomeArquivo("CONTRATO PINHAIS.pdf")).toBeNull();
    const lido = lerContratoLocacao(vera, BLD, 580000);
    expect(lido?.brutoCentavos).toBe(230000);
    expect(lido?.situacao).toBe("conferir");
    expect(lido?.observacao).toBe("o nome do arquivo diz R$ 5,800.00 e o contrato diz R$ 2,300.00; vale o contrato");
    expect(lerContratoLocacao(vera, BLD, 230000)?.situacao).toBe("ok");
  });

  it("texto sem rótulo de locação não é contrato", () => {
    expect(lerContratoLocacao("RECIBO DE PAGAMENTO", BLD)).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// RPA -- casos próprios, montados do layout do comentário do leitor
// ---------------------------------------------------------------------------

type Bloco = { nome?: string; cpf?: string; bruto?: string; liquido?: string | null; importancia?: string; verbas?: string[]; totais?: string };

function blocoRpa(b: Bloco = {}): string {
  const verbas = b.verbas ?? ["9105 Inss Contribuinte Individual 11,00 85,53", "9135 I.S.S. 77,76"];
  return [
    "Empresa :176 - BLD LOGISTICA LTDA Data do serviço : 01/04/2025",
    "CNPJ/CEI : 17.122.471/0001-75 Centro de Custo : 7",
    `Recebi da empresa acima identificada, a importância de R$ ${b.importancia ?? b.liquido ?? "3.724,71"}`,
    "Verba Descrição Referência Vencimentos Descontos",
    `30 Honorário Autônomo ${b.bruto ?? "3.888,00"}`,
    ...verbas,
    b.totais ?? `${b.bruto ?? "3.888,00"} 163,29`,
    ...(b.liquido === null ? [] : [`Líquido >>> ${b.liquido ?? "3.724,71"}`]),
    `Nome : ${b.nome ?? "ABIMAEL MARIN CAMILO"} Inscrição do INSS:212.63438.79.4`,
    `CPF:${b.cpf ?? "101.426.679-35"}`,
    "PINHAIS, 30 de Abril de 2025.",
  ].join("\n");
}

const SEGUNDO: Bloco = {
  nome: "MARIA APARECIDA DOS SANTOS",
  cpf: "222.333.444-05",
  bruto: "1.031,00",
  liquido: "866,04",
  verbas: [
    "9105 Inss Contribuinte Individual 11,00 113,41",
    "9401 Contribuição SEST/SENAT 2,50 25,78",
    "9402 Contribuição SEST 1,50 15,46",
    "9403 Contribuição SENAT 10,31",
  ],
  totais: "1.031,00 164,96",
};

describe("lerPaginaRpa", () => {
  it("dois recibos de pessoas diferentes na mesma página", () => {
    const lidos = lerPaginaRpa(`RECIBO DE PAGAMENTO A AUTÔNOMO\n${blocoRpa()}\n${blocoRpa(SEGUNDO)}`);
    expect(lidos).toHaveLength(2);
    expect(lidos[0]).toMatchObject({
      nome: "ABIMAEL MARIN CAMILO",
      documento: "10142667935",
      brutoCentavos: 388800,
      liquidoCentavos: 372471,
      dataServico: "2025-04-01",
      dataPagamento: "2025-04-30",
      centroCusto: "7",
      situacao: "ok",
      observacao: "",
    });
    expect(lidos[0].retencoes).toEqual([
      { verba: "9105", descricao: "Inss Contribuinte Individual", centavos: 8553 },
      { verba: "9135", descricao: "I.S.S", centavos: 7776 },
    ]);
    expect(lidos[1]).toMatchObject({ nome: "MARIA APARECIDA DOS SANTOS", documento: "22233344405", situacao: "ok" });
  });

  it("as retenções são pela verba: 9401, 9402 e 9403 convivem, e o SENAT não pega o total da linha seguinte", () => {
    const [lido] = lerPaginaRpa(blocoRpa(SEGUNDO));
    expect(lido.retencoes).toEqual([
      { verba: "9105", descricao: "Inss Contribuinte Individual", centavos: 11341 },
      { verba: "9401", descricao: "Contribuição SEST/SENAT", centavos: 2578 },
      { verba: "9402", descricao: "Contribuição SEST", centavos: 1546 },
      { verba: "9403", descricao: "Contribuição SENAT", centavos: 1031 },
    ]);
    expect(lido.brutoCentavos! - lido.retencoes!.reduce((s, r) => s + r.centavos, 0)).toBe(lido.liquidoCentavos);
    expect(lido.situacao).toBe("ok");
  });

  it("conta que não fecha vira 'conferir', com a conta escrita", () => {
    const [lido] = lerPaginaRpa(blocoRpa({ liquido: "3.700,00" }));
    expect(lido.situacao).toBe("conferir");
    expect(lido.observacao).toBe("não fecha: bruto 3888.00 - retenções 163.29 = 3724.71, mas o líquido diz 3700.00");
  });

  it("um centavo de folga para o arredondamento do gerador; dois já não", () => {
    expect(lerPaginaRpa(blocoRpa({ liquido: "3.724,72" }))[0].situacao).toBe("ok");
    expect(lerPaginaRpa(blocoRpa({ liquido: "3.724,73" }))[0].situacao).toBe("conferir");
  });

  it("a segunda impressão do mesmo recibo na página é 'via', não outro pagamento", () => {
    const lidos = lerPaginaRpa(`${blocoRpa()}\n${blocoRpa()}`);
    expect(lidos.map((r) => r.situacao)).toEqual(["ok", "via"]);
    expect(lidos[1].observacao).toBe("2ª via do mesmo recibo nesta página (idêntico ao bloco 1)");
  });

  it("via com a conta errada continua via (a conta só se confere no original)", () => {
    const bloco = blocoRpa({ liquido: "3.700,00" });
    expect(lerPaginaRpa(`${bloco}\n${bloco}`).map((r) => r.situacao)).toEqual(["conferir", "via"]);
  });

  it("sem 'Líquido >>>', vale a importância do corpo", () => {
    const [lido] = lerPaginaRpa(blocoRpa({ liquido: null, importancia: "3.724,71" }));
    expect(lido.liquidoCentavos).toBe(372471);
    expect(lido.situacao).toBe("ok");
  });

  it("sem bruto, 'conferir' dizendo o que faltou", () => {
    const texto = blocoRpa().replace("30 Honorário Autônomo 3.888,00", "30 Outra verba 3.888,00");
    const [lido] = lerPaginaRpa(`RECIBO DE PAGAMENTO\n${texto}`);
    expect(lido.brutoCentavos).toBeNull();
    expect(lido).toMatchObject({ situacao: "conferir", observacao: "não li o bruto" });
  });

  it("o 'Nome:' preenchido com o CPF não vira nome", () => {
    expect(lerPaginaRpa(blocoRpa({ nome: "045.876.480-94" }))[0].nome).toBe("");
  });

  it("página que não é RPA, cabeçalho sem corpo e texto vazio: lista vazia", () => {
    expect(lerPaginaRpa("NOTA FISCAL ELETRÔNICA\nEmpresa : X")).toEqual([]);
    expect(lerPaginaRpa("RECIBO DE PAGAMENTO\nEmpresa : X\nsem corpo")).toEqual([]);
    expect(lerPaginaRpa("")).toEqual([]);
  });
});

describe("lerReciboMotorista", () => {
  const mei = [
    "45.262.666 SANDRO MARCEL CAETANO",
    "CNPJ",
    "45.262.666/0001-56",
    "Telefone E-mail",
    "42 32722451 SANDRO.CAETANO@HOTMAIL.COM",
    "Recebido de: BLD Logística Número do recibo: 00026",
    "CNPJ 17.122.471/0001-75 Data: 13/02/2025",
    "Data de pagamento: 10/02/2025",
    "Descrição Valor",
    "Entrega de Mercadorias R$ 2.870,00",
    "Total: R$ 2.870,00",
  ].join("\n");

  it("lê o layout MEI: o prestador é o CNPJ que não é do cliente", () => {
    expect(lerReciboMotorista(mei, BLD)).toEqual({
      nome: "SANDRO MARCEL CAETANO",
      documento: "45262666000156",
      numero: "00026",
      brutoCentavos: 287000,
      liquidoCentavos: 287000,
      dataPagamento: "2025-02-10",
      dataServico: "2025-02-13",
      centroCusto: "",
      retencoes: null,
      situacao: "ok",
      observacao: "",
    });
  });

  it("a raiz decide quem é o cliente", () => {
    expect(lerReciboMotorista(mei, "45262666")?.documento).toBe("17122471000175");
  });

  it("sem número do recibo ou sem total, não é deste layout", () => {
    expect(lerReciboMotorista(mei.replace("Número do recibo: 00026", ""), BLD)).toBeNull();
    expect(lerReciboMotorista(mei.replace("Total: R$ 2.870,00", ""), BLD)).toBeNull();
  });

  it("sem CNPJ, cai no CPF de 11 dígitos; sem nenhum, 'conferir'", () => {
    const semCnpj = "JOAO DA SILVA 12345678901\nNúmero do recibo: 7\nTotal: R$ 100,00";
    expect(lerReciboMotorista(semCnpj, BLD)).toMatchObject({ documento: "12345678901", situacao: "ok" });
    expect(lerReciboMotorista("Número do recibo: 7\nTotal: R$ 100,00", BLD)).toMatchObject({
      situacao: "conferir",
      observacao: "não identifiquei o prestador (nem CNPJ nem CPF)",
    });
  });
});

describe("lerContratoMotorista", () => {
  const contrato = [
    "RECIBO DE PAGAMENTO DE SERVIÇO",
    "Contratante: BLD Logística LTDA",
    "CNPJ: 17.122.471/0001-75",
    "Contratado:",
    "Nome: JADIR BYHAIN",
    "CPF: 968.672.569-53",
    "Serviços prestados: transporte, na condição de Transportador Autônomo de Cargas.",
    "Valor recebido: R$6250 (seis mil duzentos e cinquenta reais)",
    "Data do recebimento: 30 setembro 2025",
  ].join("\n");

  it("lê o contrato de uma página", () => {
    expect(lerContratoMotorista(contrato, BLD)).toMatchObject({
      nome: "JADIR BYHAIN",
      documento: "96867256953",
      brutoCentavos: 625000,
      liquidoCentavos: 625000,
      dataPagamento: "2025-09-30",
      situacao: "ok",
    });
  });

  it("valor com uma casa e data com 'de'", () => {
    const outro = contrato
      .replace("R$6250 (seis mil duzentos e cinquenta reais)", "R$ 439,2")
      .replace("30 setembro 2025", "5 de março de 2025");
    expect(lerContratoMotorista(outro, BLD)).toMatchObject({ brutoCentavos: 43920, dataPagamento: "2025-03-05" });
  });

  it("o cliente tem que ser o contratante", () => {
    expect(lerContratoMotorista(contrato, "99888777")).toMatchObject({
      situacao: "invalido",
      observacao: "o cliente não aparece como contratante nesta página",
    });
  });

  it("'Nome:' com o CPF não vira nome; sem valor, 'conferir'", () => {
    const semNome = contrato.replace("Nome: JADIR BYHAIN", "Nome: 045.876.480-94").replace(/Valor recebido.*\n/, "");
    expect(lerContratoMotorista(semNome, BLD)).toMatchObject({ nome: "", situacao: "conferir", observacao: "não li o valor recebido" });
  });

  it("folha de rosto não é contrato", () => {
    expect(lerContratoMotorista("LOTE DE CONTRATOS - SETEMBRO", BLD)).toBeNull();
  });
});

describe("lerReciboGenerico", () => {
  it("valor rotulado e contraparte identificada: 'ok'", () => {
    const texto = "RECIBO\nGS CARGO RASTREADORES EIRELI\nCNPJ: 32.598.742/0001-57\nData de pagamento: 05/03/2025\nTotal: R$ 1.551,50";
    expect(lerReciboGenerico(texto, BLD)).toMatchObject({
      nome: "GS CARGO RASTREADORES EIRELI",
      documento: "32598742000157",
      brutoCentavos: 155150,
      dataPagamento: "2025-03-05",
      situacao: "ok",
      observacao: "",
    });
  });

  it("sem rótulo, o maior R$ da página vira palpite 'conferir'", () => {
    const texto = "RECIBO\nFULANO DE TAL\nCPF 111.222.333-44\n12/04/2025\nR$ 100,00 R$ 1.250,00";
    expect(lerReciboGenerico(texto, BLD)).toMatchObject({
      brutoCentavos: 125000,
      dataPagamento: "2025-04-12",
      situacao: "conferir",
      observacao:
        "valor não estava rotulado — usei o maior da página (R$ 1,250.00) | data não estava rotulada — usei a primeira da página",
    });
  });

  it("o documento do cliente não é a contraparte", () => {
    const texto = "RECIBO\nCNPJ 17.122.471/0001-75\nTotal: R$ 10,00";
    expect(lerReciboGenerico(texto, BLD)).toMatchObject({ documento: "", situacao: "conferir" });
  });

  it("nem quem nem quanto: nada a afirmar", () => {
    expect(lerReciboGenerico("só um texto qualquer", BLD)).toBeNull();
    expect(lerReciboGenerico("   ", BLD)).toBeNull();
  });
});

describe("lerFatura", () => {
  const fatura = [
    "LOCALIZA RENT A CAR S.A.",
    "CNPJ: 16.670.085/0001-55",
    "FATURA / DUPLICATA Nº: CAMTZ - 837273",
    "CLIENTE: BLD LOGISTICA LTDA CÓDIGO: 12577500",
    "CNPJ: 17.122.471/0001-75 DATA DE EMISSÃO: 05/01/2025",
    "DESCRIÇÃO VALOR",
    "LOCAÇÃO DE VEÍCULOS, CONFORME ANEXO. R$ 53.726,25",
    "VENCIMENTO CONDIÇÕES DE PAGAMENTO VALOR TOTAL",
    "10/02/2025 A PRAZO R$ 53.726,25",
  ].join("\n");

  // Os valores esperados são os que `ler_fatura` do motor devolve para o mesmo texto
  // (conferido rodando o Python em 03/11/2026): sem "VALOR TOTAL" na mesma linha do
  // valor, a fatura usa o maior valor da página e pede conferência.
  it("a data que vale é a de emissão; o emitente é o CNPJ que não é do cliente", () => {
    expect(lerFatura(fatura, BLD, ["BLD"])).toEqual({
      nome: "LOCALIZA RENT A CAR S.A.", documento: "16670085000155", numero: "CAMTZ - 837273 CLIENTE",
      brutoCentavos: 5372625, liquidoCentavos: 5372625, dataPagamento: "2025-01-05", dataServico: "2025-02-10",
      centroCusto: "", retencoes: null, categoria: "fatura_aluguel_veiculo", situacao: "conferir",
      observacao: "não achei 'VALOR TOTAL' rotulado — usei o maior da página (R$ 53,726.25)",
    });
  });

  it("sem emissão, a competência sai do vencimento -- e a linha avisa", () => {
    const lido = lerFatura(fatura.replace("DATA DE EMISSÃO: 05/01/2025", ""), BLD);
    expect(lido).toMatchObject({ dataPagamento: "2025-02-10", situacao: "conferir" });
    expect(lido?.observacao).toBe("não achei 'VALOR TOTAL' rotulado — usei o maior da página (R$ 53,726.25) | não achei a data de emissão — a competência saiu do vencimento");
  });

  it("página que não é fatura", () => {
    expect(lerFatura("RECIBO DE ALUGUEL", BLD)).toBeNull();
  });
});

describe("utilitários", () => {
  it("competência da pasta: numerada ou por extenso", () => {
    expect(competenciaDaPasta("05.2025 - CATEGORIAS")).toBe("2025-05");
    expect(competenciaDaPasta("FEVEREIRO 2025")).toBe("2025-02");
    expect(competenciaDaPasta("Março 2025")).toBe("2025-03");
    expect(competenciaDaPasta("13-08-25")).toBe("");
    expect(competenciaDaPasta("TAC")).toBe("");
  });

  it("valor no formato brasileiro, em centavos", () => {
    expect(valorBrEmCentavos("1.234,56")).toBe(123456);
    expect(valorBrEmCentavos("439,2")).toBe(43920);
    expect(valorBrEmCentavos("300")).toBe(30000);
    expect(valorBrEmCentavos("")).toBeNull();
    expect(valorBrEmCentavos(".")).toBeNull();
    expect(valorBrEmCentavos("1,2,3")).toBeNull();
  });

  it("sem acento como o encode('ascii', 'ignore')", () => {
    expect(semAcento("Março São Paulo ª")).toBe("Marco Sao Paulo a");
  });
});
