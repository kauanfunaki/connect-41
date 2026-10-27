// Esquemas das leituras das telas fiscais (API-CONNECT §11, adendo de 23/10/2026).
//
// Puro (sem `server-only`): os tipos são usados pelas telas e pelos testes. O
// cliente que chama as rotas é `criarClienteDoMotor` (`./motor.ts`).
//
// As regras de §11.0.3 que estes esquemas fixam:
// - dinheiro, alíquota e percentual chegam como **string decimal**; número JSON
//   num campo de dinheiro é resposta fora do contrato;
// - `null` quer dizer "não levantado" e continua `null` até a tela, que mostra
//   "—" — nunca vira `"0.00"`;
// - contagens são inteiros JSON.
//
// Cada objeto é `looseObject` (campo a mais do motor não quebra a tela) e é
// estrito nos campos que a tela usa (§11.5). Os blocos que o contrato só
// descreve pela função do motor (`simulacoes`, `cte`, `combustivel`,
// prestadores, aluguéis...) entram como dado sem forma fixa e são mostrados
// com os nomes do motor.

import { z } from "zod";

const DECIMAL = /^-?\d{1,16}(\.\d{1,6})?$/;

/** Dinheiro, alíquota ou percentual: string decimal, ou `null` (não levantado). Obrigatório no objeto. */
export const decimal = z.string().regex(DECIMAL, "decimal fora do formato do motor").nullable();
/** O mesmo, num campo que pode faltar: ausente também é "não levantado". */
const decimalOpcional = decimal.optional().transform((v) => v ?? null);
const contagem = z.number().int();
const contagemOpcional = contagem.nullish().transform((v) => v ?? null);
const texto = z.string().nullish().transform((v) => v ?? "");
const textoOuNulo = z.string().nullish().transform((v) => v ?? null);
const quando = z.string().nullish().transform((v) => v ?? null);
/** Campo só exibido, cuja forma o contrato não fixa (texto, número ou objeto). */
const exibivel = z.unknown().optional().transform((v): string => (v === null || v === undefined ? "" : typeof v === "string" ? v : typeof v === "number" || typeof v === "boolean" ? String(v) : JSON.stringify(v)));
/** Bloco sem forma fixa no contrato: mostrado como veio, com os nomes do motor. */
export const blocoLivre = z.unknown().optional().transform((v) => v ?? null);

const paginaDe = <T extends z.ZodTypeAny>(item: T) =>
  z.looseObject({ itens: z.array(item), proximo_cursor: z.string().nullish().transform((v) => v ?? null) });

// ─── 11.1 Documentos e importações ───────────────────────────────────────────

export const importacaoSchema = z.looseObject({
  id: z.number().int(),
  origem: texto,
  host: textoOuNulo,
  estado: z.string(),
  dry_run: z.boolean().nullish().transform((v) => v ?? false),
  iniciado_em: quando,
  concluido_em: quando,
  filtro_dentro: textoOuNulo,
  cnpj_dest: textoOuNulo,
  lidos: contagem,
  gravados_cte: contagem,
  gravados_nfe: contagem,
  ja_existentes: contagemOpcional,
  cancelados_pulados: contagemOpcional,
  ignorados_cnpj: contagemOpcional,
  rejeitados: contagem,
  por_competencia: z.record(z.string(), contagem).nullish().transform((v) => v ?? {}),
  por_cnpj: z.record(z.string(), contagem).nullish().transform((v) => v ?? {}),
  outros_cnpj: contagemOpcional,
  erro_fatal: textoOuNulo,
});
export type ImportacaoDoMotor = z.infer<typeof importacaoSchema>;
export const importacoesSchema = paginaDe(importacaoSchema);

export const resumoQuarentenaSchema = z.looseObject({
  pendente_desconhecido: contagem,
  por_classe: z.array(z.looseObject({ classe: z.string(), total: contagem })),
  por_motivo: z.array(z.looseObject({ motivo: texto, total: contagem })),
});
export type ResumoDaQuarentena = z.infer<typeof resumoQuarentenaSchema>;

export const rejeitadoSchema = z.looseObject({
  id: z.number().int(),
  importacao_id: z.number().int().nullish().transform((v) => v ?? null),
  arquivo: texto,
  motivo: texto,
  chave: textoOuNulo,
  classe: texto,
  resolvido: z.boolean(),
  resolvido_por: textoOuNulo,
  resolvido_em: quando,
  observacao: textoOuNulo,
  criado_em: quando,
});
export type RejeitadoDoMotor = z.infer<typeof rejeitadoSchema>;
export const quarentenaSchema = paginaDe(rejeitadoSchema);

export const avaliacaoSchema = z.looseObject({
  semaforo: z.enum(["verde", "amarelo", "vermelho", "neutro"]),
  motivos: z.array(z.looseObject({ cor: z.string(), texto: z.string() })).default([]),
  variacao_cte: decimalOpcional,
});
export type AvaliacaoDaCobertura = z.infer<typeof avaliacaoSchema>;

const contadores = z.record(z.string(), z.number()).nullish().transform((v) => v ?? {});
export const coberturaSchema = z.looseObject({
  empresa_id: z.number().int(),
  cnpj_empresa: texto,
  competencia: z.string(),
  estado: z.enum(["apurando", "ok", "erro"]),
  abandonada: z.boolean().nullish().transform((v) => v ?? false),
  apurado_em: quando,
  duracao_seg: z.number().nullish().transform((v) => v ?? null),
  cte_total: contagemOpcional,
  nfe_total: contagemOpcional,
  cte_por_serie: contadores,
  cte_por_dia: contadores,
  nfe_por_fonte: contadores,
  dias_sem_nada: z.array(z.string()).nullish().transform((v) => v ?? []),
  mensagem: textoOuNulo,
});
export type CoberturaDoMotor = z.infer<typeof coberturaSchema>;

export const coberturaRespostaSchema = z.looseObject({
  registro: coberturaSchema.nullable(),
  anterior: coberturaSchema.nullable(),
  avaliacao: avaliacaoSchema.nullable(),
});
export type RespostaDaCobertura = z.infer<typeof coberturaRespostaSchema>;

const itemDaListaDeCobertura = coberturaSchema.extend({ avaliacao: avaliacaoSchema.nullish().transform((v) => v ?? null) });
export type ItemDaListaDeCobertura = z.infer<typeof itemDaListaDeCobertura>;
/** `{"itens": [...], "proximo_cursor": null}` (§11.1.4, fixado em 23/10/2026): sem cursor, a lista inteira. */
export const listaDeCoberturaSchema = z.looseObject({ itens: z.array(itemDaListaDeCobertura) }).transform((v) => v.itens);

export const errosExtracaoSchema = z.looseObject({
  itens: z.array(z.looseObject({
    route_id: exibivel,
    cte_key: textoOuNulo,
    data_rota: quando,
    step_type: texto,
    href: textoOuNulo,
    erro: texto,
    ocorrido_em: quando,
  })),
  total: contagem,
  rotas_inteiras: contagem,
  documentos: contagem,
  truncado: z.boolean(),
});
export type ErrosDeExtracao = z.infer<typeof errosExtracaoSchema>;

const itemNfse = z.looseObject({
  competencia: z.string(),
  sentido: texto,
  quantidade: contagem,
  valor: decimal,
  sem_xml: contagem,
  prestadores: contagemOpcional,
});
export type ResumoNfseItem = z.infer<typeof itemNfse>;
/**
 * A forma do painel (`nfse.api_resumo`, §11.1.6 fixado em 23/10/2026):
 * `{"por_competencia": [Item], "totais": {...}, "quarentena_por_triar": n}`.
 * A tela lê `itens` (o `por_competencia`).
 */
export const resumoNfseSchema = z.looseObject({
  por_competencia: z.array(itemNfse),
  totais: z.looseObject({ quantidade: contagemOpcional, sem_xml: contagemOpcional, competencias: contagemOpcional }).nullish().transform((v) => v ?? null),
  quarentena_por_triar: contagemOpcional,
}).transform((v) => ({ itens: v.por_competencia, totais: v.totais, quarentena_por_triar: v.quarentena_por_triar }));
export type ResumoNfse = z.infer<typeof resumoNfseSchema>;

// ─── 11.2 ICMS e IPI ─────────────────────────────────────────────────────────

export const linhaCfopSchema = z.looseObject({
  cfop: z.string(),
  cst: texto,
  aliquota: decimal,
  qtd: contagem,
  valor_operacao: decimal,
  valor_bc: decimal,
  valor_icms: decimal,
});
export type LinhaCfop = z.infer<typeof linhaCfopSchema>;
export const GRUPOS_CFOP = ["saidas_cte", "saidas_nfe", "entradas", "entradas_cte"] as const;
export type GrupoCfop = (typeof GRUPOS_CFOP)[number];

export const apuracaoIcmsSchema = z.looseObject({
  arquivo_id: z.number().int(),
  empresa_id: z.number().int().nullish().transform((v) => v ?? null),
  cnpj: texto,
  nome: texto,
  competencia: z.string(),
  e110: z.record(z.string(), decimal),
  ajustes_arquivo: z.array(z.looseObject({ codigo: texto, descricao: texto, valor: decimal })).default([]),
  conferencias: z.array(z.looseObject({ regra: z.string(), esperado: decimalOpcional, obtido: decimalOpcional, bate: z.boolean() })).default([]),
  tem_divergencia: z.boolean(),
  saldo_banco: z.looseObject({ saldo_credor_ant: decimalOpcional, saldo_a_transportar: decimalOpcional, origem: texto, atualizado_em: quando }).nullable(),
  divergencia_banco: z.looseObject({ banco: decimalOpcional, arquivo: decimalOpcional, origem: texto }).nullable(),
  ajustes_depois_da_geracao: z.array(z.number().int()).default([]),
  cfop: z.looseObject({
    saidas_cte: z.array(linhaCfopSchema).default([]),
    saidas_nfe: z.array(linhaCfopSchema).default([]),
    entradas: z.array(linhaCfopSchema).default([]),
    entradas_cte: z.array(linhaCfopSchema).default([]),
  }),
});
export type ApuracaoIcms = z.infer<typeof apuracaoIcmsSchema>;

export const documentosDoCfopSchema = z.looseObject({
  documentos: z.array(z.looseObject({
    registro: texto,
    chave: textoOuNulo,
    numero: exibivel,
    participante: texto,
    data: quando,
    valor_doc: decimal,
    valor_operacao: decimal,
    valor_bc: decimal,
    valor_icms: decimal,
  })),
  total: contagem,
  soma: decimal,
  truncado: z.boolean(),
});
export type DocumentosDoCfop = z.infer<typeof documentosDoCfopSchema>;

const quadroSchema = z.looseObject({
  cfop: texto,
  valor_contabil: decimal,
  base_calculo: decimal,
  aliquota: decimalOpcional,
  imposto: decimal,
  isentas: decimal,
  outras: decimal,
});
export type QuadroDoDemonstrativo = z.infer<typeof quadroSchema>;
const verbaSchema = z.looseObject({ descricao: z.string(), valor: decimal, detalhe: exibivel, total: z.boolean().nullish().transform((v) => v ?? false) });
export type VerbaDoDemonstrativo = z.infer<typeof verbaSchema>;
export const demonstrativoIcmsSchema = z.looseObject({
  nome: texto,
  cnpj: texto,
  empresa: texto,
  competencia: z.string(),
  saidas: z.array(quadroSchema),
  entradas: z.array(quadroSchema),
  total_saidas: quadroSchema,
  total_entradas: quadroSchema,
  debitos: z.array(verbaSchema),
  creditos: z.array(verbaSchema),
  apuracao: z.array(verbaSchema),
});
export type DemonstrativoIcms = z.infer<typeof demonstrativoIcmsSchema>;

export const saldoIcmsSchema = z.looseObject({
  competencia: z.string(),
  saldo_credor_ant: decimal,
  debitos: decimal,
  creditos: decimal,
  saldo_apurado: decimal,
  saldo_a_transportar: decimal,
  origem: texto,
  atualizado_em: quando,
});
export type SaldoIcms = z.infer<typeof saldoIcmsSchema>;
export const saldosIcmsSchema = paginaDe(saldoIcmsSchema);

export const ajusteDaDcipSchema = z.looseObject({
  id: z.number().int(),
  codigo: texto,
  natureza: texto,
  subtipo_dcip: textoOuNulo,
  descricao: texto,
  valor: decimalOpcional,
});
export const dcipDimeSchema = z.looseObject({
  empresa_id: z.number().int(),
  cnpj: texto,
  competencia: z.string(),
  ajustes: z.array(ajusteDaDcipSchema),
  resumo: z.looseObject({
    total: decimal,
    creditos_dcip: decimal,
    quadro_46_ids: z.array(z.number().int()).default([]),
    quadro_12_ids: z.array(z.number().int()).default([]),
    sem_item_ids: z.array(z.number().int()).default([]),
  }),
});
export type DcipDime = z.infer<typeof dcipDimeSchema>;

const codigoDescricao = z.looseObject({ codigo: exibivel, descricao: texto });
const itemDescricao = z.looseObject({ item: exibivel, descricao: texto });
export const tabelasIcmsSchema = z.looseObject({
  naturezas: z.record(z.string(), z.looseObject({ rotulo: texto, efeito: texto })),
  codigos_conhecidos: z.array(codigoDescricao).default([]),
  codigos_sc: z.array(codigoDescricao).default([]),
  itens_quadro_04: z.array(itemDescricao).default([]),
  itens_quadro_05: z.array(itemDescricao).default([]),
  origens_quadro_46: z.array(codigoDescricao).default([]),
});
export type TabelasIcms = z.infer<typeof tabelasIcmsSchema>;

// ─── 11.3 PIS e COFINS ───────────────────────────────────────────────────────

export const competenciasEAnosSchema = z.looseObject({ competencias: z.array(z.string()), anos: z.array(z.string()).default([]) });
export const competenciasSchema = z.looseObject({ competencias: z.array(z.string()) });

const linhaDaApuracaoContrib = z.looseObject({
  rotulo: z.string(),
  valores: z.record(z.string(), decimal),
  soma_ano: decimal,
  total: z.boolean().nullish().transform((v) => v ?? false),
});
export type LinhaDaApuracaoContrib = z.infer<typeof linhaDaApuracaoContrib>;
export const demonstrativoContribSchema = z.looseObject({
  ano: textoOuNulo,
  competencia: textoOuNulo,
  filial: exibivel,
  relatorio: texto,
  ordenar: texto,
  estabelecimentos: blocoLivre,
  meses: z.array(z.looseObject({
    competencia: z.string(),
    arquivo: z.looseObject({ arquivo_id: z.number().int(), qtd_linhas: contagemOpcional }).nullish().transform((v) => v ?? null),
  })).default([]),
  linhas: z.array(z.record(z.string(), z.unknown())).default([]),
  total: blocoLivre,
  cadeia: z.array(z.looseObject({
    competencia: z.string(),
    imposto: texto,
    entrou: decimal,
    apurado: decimal,
    descontado: decimal,
    saiu: decimal,
    esperado_da_anterior: decimalOpcional,
    bate: z.boolean(),
  })).default([]),
  apuracao: z.looseObject({ pis: z.array(linhaDaApuracaoContrib).default([]), cofins: z.array(linhaDaApuracaoContrib).default([]) }),
  /** O quadro de créditos: `formato` diz como ler cada valor (`valor` em reais, `aliquota`/`quantidade` com 4 casas, `codigo` texto). */
  creditos: z.array(z.looseObject({
    cod_cred: exibivel,
    ind_cred_ori: exibivel,
    linhas: z.array(z.looseObject({
      rotulo: z.string(),
      chave: texto,
      formato: texto,
      total: z.boolean().nullish().transform((v) => v ?? false),
      valores: z.record(z.string(), z.record(z.string(), z.string().nullable())).default({}),
    })).default([]),
  })).default([]),
  por_cfop: blocoLivre,
  avisos: z.array(exibivel).default([]),
  faltando: z.array(z.string()).default([]),
  aliq_pis: decimalOpcional,
  aliq_cofins: decimalOpcional,
});
export type DemonstrativoContrib = z.infer<typeof demonstrativoContribSchema>;

export const fechamentoSchema = z.looseObject({
  competencia: z.string(),
  fiscais: z.array(z.looseObject({
    tipo: z.string(),
    sentido: texto,
    rotulo: z.string(),
    documentos: contagem,
    valor: decimal,
    sem_valor: contagemOpcional,
    origem: texto,
  })),
  apoio: z.array(z.looseObject({
    tipo: z.string(),
    rotulo: z.string(),
    cadastro: z.boolean().nullish().transform((v) => v ?? false),
    documentos: contagem,
    pessoas: contagemOpcional,
    valor_bruto: decimal,
    valor_liquido: decimal,
    vias: contagemOpcional,
    conferir: contagemOpcional,
    invalidos: contagemOpcional,
    sem_valor: contagemOpcional,
    linhas: contagemOpcional,
  })),
  totais: z.looseObject({
    fiscais_entrada: decimal,
    fiscais_saida: decimal,
    sem_valor: contagemOpcional,
    apoio_bruto: decimal,
    apoio_liquido: decimal,
    apoio_documentos: contagemOpcional,
    fora: contagemOpcional,
  }),
});
export type FechamentoContrib = z.infer<typeof fechamentoSchema>;

export const faturamentoSchema = z.looseObject({
  competencia: z.string(),
  linhas: z.array(z.looseObject({
    grupo: z.string(),
    rotulo: z.string(),
    documentos: contagem,
    valor: decimal,
    origem: texto,
    apurar: z.boolean().nullish().transform((v) => v ?? false),
    pendentes: z.array(z.number().int()).default([]),
  })),
  totais: z.looseObject({
    saidas: decimal,
    entradas_com_nota: decimal,
    entradas_sem_nota: decimal,
    entradas: decimal,
    saidas_menos_entradas: decimal,
    incompletas: contagemOpcional,
    // Contagem pela regra 11.0.3; aceita também a lista de ids, que é o que o nome sugere.
    arquivos_a_apurar: z.union([contagem, z.array(z.number().int())]).nullish().transform((v) => (Array.isArray(v) ? v.length : v ?? null)),
  }),
});
export type Faturamento = z.infer<typeof faturamentoSchema>;

export const grupoDuplicataSchema = z.looseObject({
  chave_negocio: exibivel,
  tipo: texto,
  competencia: texto,
  nome: texto,
  documento: texto,
  data_pagamento: quando,
  valor_bruto: decimal,
  ocorrencias: contagem,
  valor_excedente: decimal,
  paginas: blocoLivre,
  caminhos: blocoLivre,
});
export type GrupoDuplicata = z.infer<typeof grupoDuplicataSchema>;
export const duplicatasSchema = paginaDe(grupoDuplicataSchema);

/** `_COLS_PAGAMENTO_LEITURA` não está no contrato: os campos ficam como vieram, e a tela mostra só os que existem. */
export const pagamentoAConferirSchema = z.looseObject({
  decisao: textoOuNulo,
  decidido_por: textoOuNulo,
  motivo_decisao: textoOuNulo,
  mesmo_documento_em: blocoLivre,
  falta_para_aceitar: textoOuNulo,
});
export type PagamentoAConferir = z.infer<typeof pagamentoAConferirSchema>;
export const conferenciaDoFechamentoSchema = z.looseObject({
  competencia: texto,
  mostrando_sem_credito: z.boolean(),
  conferir: z.array(pagamentoAConferirSchema),
  conferir_truncado: z.boolean(),
  ocultos: z.looseObject({ linhas: contagem, valor: decimal, motivos: z.record(z.string(), contagem).default({}) }),
  duplicatas_topo: z.array(grupoDuplicataSchema),
  duplicatas_resumo: z.looseObject({ grupos: contagem, valor_excedente: decimal, ocorrencias: contagem }),
});
export type ConferenciaDoFechamento = z.infer<typeof conferenciaDoFechamentoSchema>;

export const alugueisSchema = z.looseObject({
  grupos: z.array(z.record(z.string(), z.unknown())).default([]),
  ressalvas: z.array(z.record(z.string(), z.unknown())).default([]),
});
export type AlugueisDeImoveis = z.infer<typeof alugueisSchema>;

// ─── 11.4 Conferência fiscal ─────────────────────────────────────────────────

export const previaFinanceiraSchema = z.looseObject({
  competencia: z.string(),
  aliquotas: z.looseObject({ cheia: decimal, presumida: decimal }),
  linhas: z.array(z.looseObject({
    chave: z.string(),
    rotulo: z.string(),
    grupo: z.string(),
    aliquota: decimalOpcional,
    base: decimalOpcional,
    imposto: decimalOpcional,
    simulada: z.boolean().nullish().transform((v) => v ?? false),
    fonte: texto,
    pendente: z.boolean().nullish().transform((v) => v ?? false),
  })),
  totais: z.looseObject({
    base_faturamento: decimal,
    base_entradas: decimal,
    debito: decimal,
    credito: decimal,
    a_pagar: decimal,
    parcial: z.boolean(),
    pendentes: z.array(z.string()).default([]),
  }),
  contratos_para_zerar: decimalOpcional,
  simulacoes: blocoLivre,
  cte: blocoLivre,
  combustivel: blocoLivre,
  confronto: blocoLivre,
  conferencia: blocoLivre,
});
export type PreviaFinanceira = z.infer<typeof previaFinanceiraSchema>;

/** `db.nfse_entrada_por_regime`, na forma das fixtures do motor (23/10/2026). */
/**
 * `origem` (§14.1, 23/10/2026): a camada que decidiu o regime — a correção do
 * cliente, o cadastro global ou o palpite pelo nome. Motor anterior a §14 não
 * manda; valor fora do enum também vira `null` (a tela só não mostra o selo).
 */
const origemDoRegime = z.enum(["cliente", "cadastro", "nome"]).nullish().catch(null).transform((v) => v ?? null);
const prestadorSchema = z.looseObject({ cnpj: texto, nome: texto, documentos: contagemOpcional, valor: decimalOpcional, regime: texto, por_cadastro: z.boolean().nullish().transform((v) => v ?? false), origem: origemDoRegime });
export type PrestadorNfse = z.infer<typeof prestadorSchema>;
export const prestadoresSchema = z.looseObject({
  mei: decimalOpcional,
  normal: decimalOpcional,
  prestadores_mei: z.array(prestadorSchema).default([]),
  prestadores_normal: z.array(prestadorSchema).default([]),
});
export type PrestadoresNfse = z.infer<typeof prestadoresSchema>;

export const SITUACOES_DO_CONFRONTO = ["sem_nota", "achado", "com_nota", "possivel_duplicidade"] as const;
export const itemDoConfrontoSchema = z.looseObject({
  id: z.number().int(),
  planilha: texto,
  competencia: texto,
  posicao: exibivel,
  fornecedor: texto,
  documento: texto,
  numero_nota: textoOuNulo,
  data_pagamento: quando,
  valor: decimal,
  categoria: texto,
  situacao: z.string(),
  evidencia: exibivel,
});
export type ItemDoConfronto = z.infer<typeof itemDoConfrontoSchema>;
const rotulos = z.record(z.string(), z.string()).nullish().transform((v) => v ?? null);
export const confrontoSchema = paginaDe(itemDoConfrontoSchema).extend({ resumo: blocoLivre, rotulos });
export type PaginaDoConfronto = z.infer<typeof confrontoSchema>;

export const documentoDaConferenciaSchema = z.looseObject({
  id: z.number().int(),
  arquivo: texto,
  competencia: texto,
  linha_num: exibivel,
  numero: exibivel,
  fornecedor: texto,
  data_documento: quando,
  valor: decimal,
  situacao: z.string(),
  chave: textoOuNulo,
  nome_emit: texto,
  cnpj_emit: texto,
  valor_nota: decimalOpcional,
  evidencia: exibivel,
  decisao: textoOuNulo,
  decidido_por: textoOuNulo,
  observacao: textoOuNulo,
  decidido_em: quando,
});
export type DocumentoDaConferencia = z.infer<typeof documentoDaConferenciaSchema>;
export const documentosDaConferenciaSchema = paginaDe(documentoDaConferenciaSchema).extend({
  resumo: blocoLivre,
  rotulos,
  decisoes: z.array(z.unknown()).nullish().transform((v) => (v ?? []).map((d) => (typeof d === "string" ? d : d && typeof d === "object" && "valor" in d ? String((d as { valor: unknown }).valor) : String(d))).filter(Boolean)),
});
export type PaginaDosDocumentosDaConferencia = z.infer<typeof documentosDaConferenciaSchema>;
