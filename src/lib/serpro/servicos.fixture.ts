// Respostas do ambiente de demonstração do Serpro (trial), chamado em 20/10/2026
// com os corpos de exemplo da documentação. Dados fictícios: CNPJ e CPF de
// zeros e noves, valores de exemplo. O PDF de cada resposta foi trocado por um
// base64 curto; o resto é o que o trial devolveu, inclusive o que diverge da
// documentação (o `detalhamentoDas` do PGDAS-D, o `detalhamento` em lista do
// PGMEI e as chaves "Numero"/"Tipo" maiúsculas no envelope do PGMEI).

export type RespostaDoTrial = { status: number; cabecalhos: { etag?: string }; corpo: string };

/** O PDF cortado, como fica nas respostas abaixo. */
export const PDF_FICTICIO = "JVBERi0xLjQKJSBmaWN0w61jaW86IG8gUERGIGRvIHRyaWFsIGZvaSBjb3J0YWRvCg==";

export const PROCURACOES: RespostaDoTrial = {
  status: 200,
  cabecalhos: { etag: "W/\"331-4DwST0KULwsSAlYvaboLo8ctN0g\"" },
  corpo: "{\"contratante\":{\"numero\":\"99999999999999\",\"tipo\":2},\"autorPedidoDados\":{\"numero\":\"99999999999999\",\"tipo\":2},\"contribuinte\":{\"numero\":\"99999999999\",\"tipo\":1},\"pedidoDados\":{\"idSistema\":\"PROCURACOES\",\"idServico\":\"OBTERPROCURACAO41\",\"versaoSistema\":\"1\",\"dados\":\"{ \\\"outorgante\\\":\\\"99999999999999\\\", \\\"tipoOutorgante\\\": \\\"2\\\", \\\"outorgado\\\":\\\"99999999999\\\", \\\"tipoOutorgado\\\":\\\"1\\\" }\"},\"status\":200,\"dados\":\"[{\\\"dtexpiracao\\\":\\\"20230414\\\",\\\"nrsistemas\\\":2,\\\"sistemas\\\":[\\\"Caixa Postal - Mensagens\\\",\\\"Caixa Postal - Termo de Opção pelo Domicílio Tributário Eletrônico\\\"]},{\\\"dtexpiracao\\\":\\\"20221231\\\",\\\"nrsistemas\\\":3,\\\"sistemas\\\":[\\\"Declarações - DIRPF\\\",\\\"Meu Imposto de Renda\\\",\\\"Opção de Impressão do IRPF\\\"]}]\",\"mensagens\":[{\"codigo\":\"Sucesso-PROCURACOES\",\"texto\":\"Requisição efetuada com sucesso.\"}]}",
};

export const DAS_DO_SIMPLES: RespostaDoTrial = {
  status: 200,
  cabecalhos: { etag: "W/\"337c4-lN0ih844+UI86bgiK1/QmDZMCvQ\"" },
  corpo: "{\"contratante\":{\"numero\":\"00000000000100\",\"tipo\":2},\"autorPedidoDados\":{\"numero\":\"00000000000100\",\"tipo\":2},\"contribuinte\":{\"numero\":\"00000000000100\",\"tipo\":2},\"pedidoDados\":{\"idSistema\":\"PGDASD\",\"idServico\":\"GERARDAS12\",\"versaoSistema\":\"1.0\",\"dados\":\"{ \\\"periodoApuracao\\\": \\\"201801\\\", \\\"dataConsolidacao\\\": \\\"20220831\\\" }\"},\"status\":200,\"dados\":\"[{\\\"pdf\\\":\\\"JVBERi0xLjQKJSBmaWN0w61jaW86IG8gUERGIGRvIHRyaWFsIGZvaSBjb3J0YWRvCg==\\\",\\\"cnpjCompleto\\\":\\\"00000000000100\\\",\\\"detalhamentoDas\\\":{\\\"periodoApuracao\\\":\\\"201801\\\",\\\"numeroDocumento\\\":\\\"07202221401801678\\\",\\\"dataVencimento\\\":\\\"20180220\\\",\\\"dataLimiteAcolhimento\\\":\\\"20220831\\\",\\\"valores\\\":{\\\"principal\\\":40,\\\"multa\\\":8,\\\"juros\\\":10.15,\\\"total\\\":58.15},\\\"observacao1\\\":\\\"Esta empresa NÃO É OPTANTE pelo Simples Nacional.\\\",\\\"observacao2\\\":\\\"\\\",\\\"observacao3\\\":\\\"\\\",\\\"composicao\\\":[{\\\"periodoApuracao\\\":\\\"201801\\\",\\\"codigo\\\":\\\"1001\\\",\\\"denominacao\\\":\\\"01/2018\\\",\\\"valores\\\":{\\\"principal\\\":2.2,\\\"multa\\\":0.44,\\\"juros\\\":0.56,\\\"total\\\":3.2}},{\\\"periodoApuracao\\\":\\\"201801\\\",\\\"codigo\\\":\\\"1002\\\",\\\"denominacao\\\":\\\"01/2018\\\",\\\"valores\\\":{\\\"principal\\\":1.4,\\\"multa\\\":0.28,\\\"juros\\\":0.36,\\\"total\\\":2.04}},{\\\"periodoApuracao\\\":\\\"201801\\\",\\\"codigo\\\":\\\"1004\\\",\\\"denominacao\\\":\\\"01/2018\\\",\\\"valores\\\":{\\\"principal\\\":5.1,\\\"multa\\\":1.02,\\\"juros\\\":1.29,\\\"total\\\":7.41}},{\\\"periodoApuracao\\\":\\\"201801\\\",\\\"codigo\\\":\\\"1005\\\",\\\"denominacao\\\":\\\"01/2018\\\",\\\"valores\\\":{\\\"principal\\\":1.1,\\\"multa\\\":0.22,\\\"juros\\\":0.28,\\\"total\\\":1.6}},{\\\"periodoApuracao\\\":\\\"201801\\\",\\\"codigo\\\":\\\"1006\\\",\\\"denominacao\\\":\\\"01/2018\\\",\\\"valores\\\":{\\\"principal\\\":16.6,\\\"multa\\\":3.32,\\\"juros\\\":4.21,\\\"total\\\":24.13}},{\\\"periodoApuracao\\\":\\\"201801\\\",\\\"codigo\\\":\\\"1007\\\",\\\"denominacao\\\":\\\"SP - 01/2018\\\",\\\"valores\\\":{\\\"principal\\\":13.6,\\\"multa\\\":2.72,\\\"juros\\\":3.45,\\\"total\\\":19.77}}]}}]\",\"mensagens\":[{\"codigo\":\"[Sucesso-PGDASD]\",\"texto\":\"Requisição efetuada com sucesso.\"}]}",
};

export const DAS_DO_MEI: RespostaDoTrial = {
  status: 200,
  cabecalhos: { etag: "W/\"34574-/6yJUI1bllL0PbhVFyCYJqkjWQM\"" },
  corpo: "{\"contratante\":{\"Numero\":\"00000000000100\",\"Tipo\":2},\"autorPedidoDados\":{\"Numero\":\"00000000000100\",\"Tipo\":2},\"contribuinte\":{\"Numero\":\"00000000000100\",\"Tipo\":2},\"pedidoDados\":{\"idSistema\":\"PGMEI\",\"idServico\":\"GERARDASPDF21\",\"dados\":\"{ \\\"periodoApuracao\\\": \\\"201901\\\" }\"},\"status\":\"200\",\"mensagens\":[{\"codigo\":\"[Sucesso-PGMEI]\",\"texto\":\"Requisição efetuada com sucesso.\"}],\"dados\":\"[{\\\"cnpjCompleto\\\":\\\"00000000000100\\\",\\\"razaoSocial\\\":\\\"EXEMPLO\\\",\\\"pdf\\\":\\\"JVBERi0xLjQKJSBmaWN0w61jaW86IG8gUERGIGRvIHRyaWFsIGZvaSBjb3J0YWRvCg==\\\",\\\"detalhamento\\\":[{\\\"periodoApuracao\\\":\\\"201901\\\",\\\"numeroDocumento\\\":\\\"00000000000000000\\\",\\\"dataVencimento\\\":\\\"20190220\\\",\\\"dataLimiteAcolhimento\\\":\\\"20220831\\\",\\\"valores\\\":{\\\"principal\\\":55.9,\\\"multa\\\":11.18,\\\"juros\\\":10.71,\\\"total\\\":77.79},\\\"observacao1\\\":\\\"CPF: 000.000.000-00\\\",\\\"observacao2\\\":\\\"Tributos (R$): INSS 49,90 ICMS 1,00 ISS 5,00\\\",\\\"observacao3\\\":\\\"PGMEI(Versao:3.8.0)\\\",\\\"composicao\\\":[{\\\"periodoApuracao\\\":201901,\\\"codigo\\\":\\\"0151\\\",\\\"denominacao\\\":\\\"INSS - SIMPLES NACIONAL - MEI - 01/2019\\\",\\\"valores\\\":{\\\"principal\\\":49.9,\\\"multa\\\":9.98,\\\"juros\\\":9.56,\\\"total\\\":69.44}},{\\\"periodoApuracao\\\":201901,\\\"codigo\\\":\\\"0083\\\",\\\"denominacao\\\":\\\"ICMS - SIMPLES NACIONAL - MEI - PB - 01/2019\\\",\\\"valores\\\":{\\\"principal\\\":1,\\\"multa\\\":0.2,\\\"juros\\\":0.19,\\\"total\\\":1.39}},{\\\"periodoApuracao\\\":201901,\\\"codigo\\\":\\\"0125\\\",\\\"denominacao\\\":\\\"ISS - SIMPLES NACIONAL - MEI - SUME (PB) - 01/2019\\\",\\\"valores\\\":{\\\"principal\\\":5,\\\"multa\\\":1,\\\"juros\\\":0.96,\\\"total\\\":6.96}}]}]}]\"}",
};

export const GUIA_DA_DCTFWEB: RespostaDoTrial = {
  status: 200,
  cabecalhos: { etag: "W/\"3707f-jCVEyjjFCo/muaaGfB5MzGyAWDM\"" },
  corpo: "{\"contratante\":{\"numero\":\"00000000000000\",\"tipo\":2},\"autorPedidoDados\":{\"numero\":\"00000000000000\",\"tipo\":2},\"contribuinte\":{\"numero\":\"00000000000000\",\"tipo\":2},\"pedidoDados\":{\"idSistema\":\"DCTFWEB\",\"idServico\":\"GERARGUIA31\",\"versaoSistema\":\"1.0\",\"dados\":\"{\\\"categoria\\\": \\\"GERAL_MENSAL\\\",\\\"anoPA\\\":\\\"2027\\\",\\\"mesPA\\\":\\\"11\\\",\\\"numeroReciboEntrega\\\": 24573}\"},\"status\":200,\"dados\":\"{\\\"PDFByteArrayBase64\\\":\\\"JVBERi0xLjQKJSBmaWN0w61jaW86IG8gUERGIGRvIHRyaWFsIGZvaSBjb3J0YWRvCg==\\\"}\",\"mensagens\":[{\"codigo\":\"MG11\",\"texto\":\"Emissor Guia Pagamento executado com sucesso.\"},{\"codigo\":\"Sucesso-DCTFWEB\",\"texto\":\"Requisição efetuada com sucesso\"}]}",
};

export const DARF_DO_SICALC: RespostaDoTrial = {
  status: 200,
  cabecalhos: { etag: "W/\"5d9d2-KRfoquEjQoEte6hiyQxyB6cdQ8w\"" },
  corpo: "{\"contratante\":{\"numero\":\"99999999999999\",\"tipo\":2},\"autorPedidoDados\":{\"numero\":\"99999999999999\",\"tipo\":2},\"contribuinte\":{\"numero\":\"99999999999999\",\"tipo\":2},\"pedidoDados\":{\"idSistema\":\"SICALC\",\"idServico\":\"CONSOLIDARGERARDARF51\",\"versaoSistema\":\"2.9\",\"dados\":\"{\\\"uf\\\": \\\"SP\\\", \\\"municipio\\\": \\\"7107\\\", \\\"codigoReceita\\\": \\\"1162\\\", \\\"codigoReceitaExtensao\\\": \\\"01\\\", \\\"tipoPA\\\": \\\"ME\\\", \\\"dataPA\\\": \\\"01/2022\\\", \\\"vencimento\\\": \\\"2022-02-18T00:00:00\\\", \\\"valorImposto\\\": \\\"1000.00\\\", \\\"dataConsolidacao\\\": \\\"2022-08-08T00:00:00\\\", \\\"observacao\\\": \\\"Darf calculado\\\"}\"},\"status\":200,\"responseId\":\"zaq4b3fc-3b37-4eb9-836b-d0255b047085\",\"dados\":\"{\\\"consolidado\\\":{\\\"valorPrincipalMoedaCorrente\\\":1000,\\\"valorTotalConsolidado\\\":1258.4,\\\"valorMultaMora\\\":200,\\\"percentualMultaMora\\\":20,\\\"valorJuros\\\":58.4,\\\"percentualJuros\\\":5.84,\\\"termoInicialJuros\\\":\\\"2022-03-01T00:00:00\\\",\\\"dataArrecadacaoConsolidacao\\\":\\\"2022-08-08T00:00:00\\\",\\\"dataValidadeCalculo\\\":\\\"2022-08-31T00:00:00\\\"},\\\"darf\\\":\\\"JVBERi0xLjQKJSBmaWN0w61jaW86IG8gUERGIGRvIHRyaWFsIGZvaSBjb3J0YWRvCg==\\\"}\",\"mensagens\":[{\"codigo\":\"[Sucesso-SICALC]\",\"texto\":\"Requisição efetuada com sucesso.\"}]}",
};

/** O que o trial devolve a qualquer corpo fora do cenário: HTTP 200, com "ERRO". */
export const FORA_DO_CENARIO: RespostaDoTrial = {
  status: 200,
  cabecalhos: {},
  corpo: JSON.stringify({ contratante: null, autorPedidoDados: null, contribuinte: null, pedidoDados: null, status: 400, dados: null, mensagens: [{ codigo: "ERRO", texto: "Dados inválidos. Utilize o json no menu Cenário da documentação." }] }),
};
