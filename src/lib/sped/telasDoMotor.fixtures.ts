// Exemplos das leituras de §11 (API-CONNECT, 23/10/2026), para os testes.
//
// O contrato pede as fixtures em `tests/fixtures/connect_v1/telas/*.json`,
// "usadas nos dois lados". Elas nascem no repositório do motor, em paralelo;
// até lá, estes objetos são os exemplos do próprio documento (e, onde o
// documento só dá a forma, um preenchimento mínimo coerente com ela).

export const IMPORTACAO = {
  id: 812, origem: "pasta_fiscal", host: "WIN-FISCAL", estado: "concluida", dry_run: false,
  iniciado_em: "2026-10-01T10:00:00+00:00", concluido_em: "2026-10-01T10:20:00+00:00", filtro_dentro: "2026-09", cnpj_dest: "17122471000175",
  lidos: 1200, gravados_cte: 0, gravados_nfe: 830, ja_existentes: 300, cancelados_pulados: 2,
  ignorados_cnpj: 10, rejeitados: 58, por_competencia: { "2026-09": 812 }, por_cnpj: { "17122471000175": 830 }, outros_cnpj: 0,
  erro_fatal: null,
};

export const RESUMO_QUARENTENA = { pendente_desconhecido: 59, por_classe: [{ classe: "evento_nfe", total: 21004 }, { classe: "desconhecido", total: 59 }], por_motivo: [{ motivo: "sem Id=NFe", total: 40 }] };

export const REJEITADO = { id: 9001, importacao_id: 812, arquivo: "nota.xml", motivo: "sem Id=NFe", chave: null, classe: "desconhecido", resolvido: false, resolvido_por: null, resolvido_em: null, observacao: null, criado_em: "2026-10-01T10:05:00+00:00" };

export const COBERTURA = {
  empresa_id: 3, cnpj_empresa: "17122471001147", competencia: "2026-09",
  estado: "ok", abandonada: false, apurado_em: "2026-10-02T09:00:00+00:00", duracao_seg: 21,
  cte_total: 15022, nfe_total: 830, cte_por_serie: { "001": 14100, "002": 922 },
  cte_por_dia: { "2026-09-01": 510 }, nfe_por_fonte: { sieg: 800, pasta: 30 },
  dias_sem_nada: ["2026-09-07"], mensagem: null,
};
export const AVALIACAO = { semaforo: "amarelo", motivos: [{ cor: "amarelo", texto: "CT-e 41% abaixo do mês anterior." }], variacao_cte: "-0.4100" };

export const ERROS_EXTRACAO = { itens: [{ route_id: 77, cte_key: null, data_rota: "2026-09-03", step_type: "first_mile", href: null, erro: "timeout", ocorrido_em: "2026-09-04T01:00:00+00:00" }], total: 1, rotas_inteiras: 1, documentos: 0, truncado: false };

export const NFSE_RESUMO = { itens: [{ competencia: "2026-09", sentido: "entrada", quantidade: 40, valor: "12000.00", sem_xml: 3, prestadores: 12 }], quarentena_por_triar: 2 };

const linha = (cfop: string, valor: string) => ({ cfop, cst: "000", aliquota: "12.0000", qtd: 10, valor_operacao: valor, valor_bc: valor, valor_icms: "120.00" });
export const APURACAO = {
  arquivo_id: 301, empresa_id: 3, cnpj: "17122471001147", nome: "icms_ipi_17122471001147_2026-09_v4.txt", competencia: "2026-09",
  e110: { VL_TOT_DEBITOS: "1000.00", VL_TOT_CREDITOS: "800.00", VL_SLD_CREDOR_TRANSPORTAR: null },
  ajustes_arquivo: [{ codigo: "PR020222", descricao: "Estorno", valor: "10.00" }],
  conferencias: [{ regra: "E110 fecha", esperado: "0.00", obtido: "0.00", bate: true }],
  tem_divergencia: false,
  saldo_banco: { saldo_credor_ant: "50.00", saldo_a_transportar: "40.00", origem: "gerador", atualizado_em: "2026-10-01T00:00:00+00:00" },
  divergencia_banco: null,
  ajustes_depois_da_geracao: [55, 56],
  cfop: { saidas_cte: [linha("6352", "1000.00")], saidas_nfe: [], entradas: [linha("1102", "500.00")], entradas_cte: [] },
};

export const DOCUMENTOS_DO_CFOP = { documentos: [{ registro: "D100", chave: "4".repeat(44), numero: "123", participante: "Cliente", data: "2026-09-05", valor_doc: "100.00", valor_operacao: "100.00", valor_bc: "100.00", valor_icms: "12.00" }], total: 1, soma: "100.00", truncado: false };

const quadro = (cfop: string) => ({ cfop, valor_contabil: "100.00", base_calculo: "100.00", aliquota: "12.0000", imposto: "12.00", isentas: "0.00", outras: null });
export const DEMONSTRATIVO_ICMS = {
  nome: "icms.txt", cnpj: "17122471001147", empresa: "BLD SP", competencia: "2026-09",
  saidas: [quadro("6352")], entradas: [quadro("1102")], total_saidas: quadro(""), total_entradas: quadro(""),
  debitos: [{ descricao: "Débitos", valor: "12.00", detalhe: "", total: false }], creditos: [], apuracao: [{ descricao: "Saldo", valor: "12.00", detalhe: null, total: true }],
};

export const SALDOS = { itens: [{ competencia: "2026-08", saldo_credor_ant: "0.00", debitos: "10.00", creditos: "60.00", saldo_apurado: "50.00", saldo_a_transportar: "50.00", origem: "gerador", atualizado_em: null }], proximo_cursor: null };

export const DCIP_DIME = {
  empresa_id: 5, cnpj: "17122471000500", competencia: "2026-09",
  ajustes: [{ id: 55, codigo: "SC020102", natureza: "credito", subtipo_dcip: "040/095", descricao: "Crédito presumido", valor: "100.00" }],
  resumo: { total: "100.00", creditos_dcip: "100.00", quadro_46_ids: [55], quadro_12_ids: [], sem_item_ids: [] },
};

export const TABELAS_ICMS = {
  naturezas: { credito: { rotulo: "Crédito", efeito: "reduz o imposto" } },
  codigos_conhecidos: [{ codigo: "SP020", descricao: "Outros créditos" }], codigos_sc: [{ codigo: "SC020102", descricao: "Crédito presumido" }],
  itens_quadro_04: [{ item: "040", descricao: "Créditos" }], itens_quadro_05: [], origens_quadro_46: [{ codigo: "1", descricao: "Crédito presumido" }],
};

export const COMPETENCIAS_CONTRIB = { competencias: ["2026-09", "2026-08"], anos: ["2026", "2025"] };

export const DEMONSTRATIVO_CONTRIB = {
  ano: "2026", competencia: null, filial: "todas", relatorio: "entradas", ordenar: "cst",
  estabelecimentos: [{ cnpj: "17122471000175", rotulo: "Matriz" }],
  meses: [{ competencia: "2026-09", arquivo: { arquivo_id: 401, qtd_linhas: 8000 } }, { competencia: "2026-10", arquivo: null }],
  linhas: [{ cst: "50", base: "1000.00", pis: "16.50" }], total: { base: "1000.00" },
  cadeia: [{ competencia: "2026-09", imposto: "pis", entrou: "0.00", apurado: "16.50", descontado: "0.00", saiu: "16.50", esperado_da_anterior: null, bate: false }],
  apuracao: { pis: [{ rotulo: "Contribuição apurada", valores: { "2026-09": "16.50" }, soma_ano: "16.50", total: false }], cofins: [] },
  creditos: [], por_cfop: [], avisos: ["Outubro sem arquivo"], faltando: ["2026-10"], aliq_pis: "1.6500", aliq_cofins: "7.6000",
};

export const FECHAMENTO = {
  competencia: "2026-09",
  fiscais: [{ tipo: "cte", sentido: "saida", rotulo: "CT-e", documentos: 15022, valor: null, sem_valor: 15022, origem: "contagem do último SPED gerado de cada filial" }],
  apoio: [{ tipo: "rpa", rotulo: "RPA", cadastro: false, documentos: 40, pessoas: 12, valor_bruto: "4000.00", valor_liquido: "3600.00", vias: 3, conferir: 1, invalidos: 0, sem_valor: 0, linhas: 44 }],
  totais: { fiscais_entrada: "1000.00", fiscais_saida: null, sem_valor: 15022, apoio_bruto: "4000.00", apoio_liquido: "3600.00", apoio_documentos: 40, fora: 4 },
};
export const FATURAMENTO = {
  competencia: "2026-09",
  linhas: [{ grupo: "saida", rotulo: "CT-e emitidos", documentos: 15022, valor: null, origem: "cte_valor_sped", apurar: true, pendentes: [301] }],
  totais: { saidas: null, entradas_com_nota: "1000.00", entradas_sem_nota: "0.00", entradas: "1000.00", saidas_menos_entradas: null, incompletas: 1, arquivos_a_apurar: 1 },
};
const grupo = { chave_negocio: "rpa|123|2026-09", tipo: "rpa", competencia: "2026-09", nome: "Fulano", documento: "12345678901", data_pagamento: "2026-09-10", valor_bruto: "100.00", ocorrencias: 2, valor_excedente: "100.00", paginas: [1, 2], caminhos: ["\\\\srv\\a.pdf"] };
export const CONFERENCIA_FECHAMENTO = {
  competencia: "", mostrando_sem_credito: false,
  conferir: [{ id: 1, tipo: "rpa", nome: "Fulano", valor_bruto: "100.00", decisao: null, decidido_por: null, motivo_decisao: null, mesmo_documento_em: null, falta_para_aceitar: "CPF" }], conferir_truncado: false,
  ocultos: { linhas: 79, valor: "5000.00", motivos: { "pessoa física fora do § 19": 60 } },
  duplicatas_topo: [grupo], duplicatas_resumo: { grupos: 2324, valor_excedente: "99999.00", ocorrencias: 5100 },
};
export const DUPLICATAS = { itens: [grupo], proximo_cursor: "eyJvIjo1MH0" };
export const ALUGUEIS = { grupos: [{ locador: "Imobiliária", valor: "3000.00" }], ressalvas: [] };

export const COMPETENCIAS_CONFERENCIA = { competencias: ["2026-09", "2026-08"] };
export const PREVIA = {
  competencia: "2026-09", aliquotas: { cheia: "9.2500", presumida: "6.9375" },
  linhas: [{ chave: "fat", rotulo: "Faturamento", grupo: "faturamento", aliquota: "9.2500", base: "1000.00", imposto: "92.50", simulada: false, fonte: "SPED", pendente: false },
    { chave: "cte", rotulo: "CT-e", grupo: "faturamento", aliquota: null, base: null, imposto: null, simulada: false, fonte: "CT-e não apurado", pendente: true }],
  totais: { base_faturamento: "1000.00", base_entradas: "0.00", debito: "92.50", credito: "104.84", a_pagar: "-12.34", parcial: true, pendentes: ["CT-e"] },
  contratos_para_zerar: "0.00", simulacoes: [], cte: { quebrados: 0 }, combustivel: { litros: "10.00" }, confronto: { sem_nota: 3 }, conferencia: { pendentes: 1 },
};
export const PRESTADORES = { mei: [{ cnpj: "1", nome: "MEI", origem: "cadastro" }], normal: [] };
export const CONFRONTO = {
  itens: [
    { id: 1, planilha: "pag.xlsx", competencia: "2026-09", posicao: 2, fornecedor: "Posto", documento: "123", numero_nota: null, data_pagamento: "2026-09-10", valor: "500.00", categoria: "Combustível", situacao: "sem_nota", evidencia: "" },
    { id: 2, planilha: "pag.xlsx", competencia: "2026-09", posicao: 3, fornecedor: "Posto", documento: "123", numero_nota: "77", data_pagamento: "2026-09-10", valor: "500.00", categoria: "Combustível", situacao: "possivel_duplicidade", evidencia: { mesma_nota: 1 } },
  ],
  proximo_cursor: null, resumo: { sem_nota: 1 }, rotulos: { sem_nota: "Sem nota", possivel_duplicidade: "Possível duplicidade" },
};
export const DOCUMENTOS_CONFERENCIA = {
  itens: [{ id: 5, arquivo: "omie.xlsx", competencia: "2026-09", linha_num: 4, numero: "88", fornecedor: "Fornecedor", data_documento: "2026-09-02", valor: "200.00", situacao: "divergente", chave: null, nome_emit: "", cnpj_emit: "", valor_nota: null, evidencia: "", decisao: null, decidido_por: null, observacao: null, decidido_em: null }],
  proximo_cursor: null, resumo: { divergente: 1 }, rotulos: { divergente: "Valor divergente" }, decisoes: ["aceito", "recusado"],
};
