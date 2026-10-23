// Esquemas e corpos das escritas das telas fiscais (API-CONNECT §13, adendo de
// 23/10/2026).
//
// Puro (sem `server-only`): os tipos são usados pelas telas, pelas Server
// Actions, pela rota de envio e pelos testes. Quem chama as rotas é
// `criarClienteDoMotor` (`./motor.ts`).
//
// As regras de §13.0 que moram aqui:
// - dinheiro em string decimal nos dois sentidos (número JSON é 422 no motor);
// - corpo sem campo de autor: o autor é o `X-Connect-Ator` (§1.4);
// - os tetos dos três envios de arquivo (§13.0.9), que a tela, a rota do
//   Connect e o motor conferem — o motor por último.

import { z } from "zod";
import { decimal, previaFinanceiraSchema, rejeitadoSchema, documentoDaConferenciaSchema } from "./telasDoMotor";

const texto = z.string().nullish().transform((v) => v ?? "");
const textoOuNulo = z.string().nullish().transform((v) => v ?? null);
const contagem = z.number().int();
const registroIds = z.array(z.number().int()).default([]);

// ─── Envios de arquivo (§13.0.9) ─────────────────────────────────────────────

const MiB = 1024 * 1024;

export const DESTINOS_DE_ENVIO = ["documentos", "omie", "confronto"] as const;
export type DestinoDeEnvio = (typeof DESTINOS_DE_ENVIO)[number];

export type RegraDoEnvio = {
  /** A rota do motor. */
  caminho: string;
  /** O nome da parte do arquivo no multipart. */
  parte: "arquivos" | "arquivo";
  /** Mais de um arquivo por envio. */
  varios: boolean;
  /** O teto do corpo inteiro no motor (`Content-Length`), em bytes. */
  teto: number;
  /** Extensões aceitas (minúsculas, sem ponto); vazio = o motor decide e marca "ignorado". */
  extensoes: readonly string[];
  /** O módulo do Connect que envia (nível `agir`). */
  modulo: string;
  /** A tela que relê o resultado. */
  tela: string;
  rotulo: string;
};

export const ENVIOS: Readonly<Record<DestinoDeEnvio, RegraDoEnvio>> = {
  documentos: { caminho: "/documentos", parte: "arquivos", varios: true, teto: 25 * MiB, extensoes: [], modulo: "fiscal_acervo", tela: "/fiscal/documentos", rotulo: "documentos" },
  omie: { caminho: "/conferencia/documentos", parte: "arquivo", varios: false, teto: 20 * MiB, extensoes: [], modulo: "fiscal_conferencia", tela: "/fiscal/conferencia", rotulo: "relatório do Omie" },
  confronto: { caminho: "/conferencia/confronto", parte: "arquivo", varios: false, teto: 20 * MiB, extensoes: ["xlsx"], modulo: "fiscal_conferencia", tela: "/fiscal/conferencia", rotulo: "planilha do BPO" },
};

/**
 * O que sobra para o envelope do multipart (separadores, cabeçalhos de cada
 * parte e o campo `competencia`). A tela recusa quando os arquivos passam de
 * `teto − folga`; a rota do Connect confere o corpo exato antes de mandar.
 */
export const FOLGA_DO_ENVELOPE = 64 * 1024;

const formatarMiB = (bytes: number) => `${Math.round(bytes / MiB)} MB`;

/** A frase da recusa por tamanho: o teto e o caminho para o que é maior. */
export function mensagemDeTamanho(destino: DestinoDeEnvio): string {
  const r = ENVIOS[destino];
  return destino === "documentos"
    ? `O envio passa de ${formatarMiB(r.teto)}, o limite do Connect. Divida em lotes menores ou, para lotes grandes, use o painel do motor (até 500 MB) ou a importação por pasta.`
    : `A ${r.rotulo} passa de ${formatarMiB(r.teto)}, o limite do motor. Reduza o arquivo ou envie pelo painel do motor.`;
}

const extensao = (nome: string) => (nome.includes(".") ? nome.split(".").pop()!.toLowerCase() : "");

export type ArquivoParaEnviar = { name: string; size: number; type?: string };

/**
 * Confere os arquivos antes do envio, no navegador e de novo na rota:
 * quantidade, extensão e tamanho (o total dos arquivos contra o teto menos a
 * folga do envelope). `null` quando está tudo certo.
 */
export function conferirArquivos(destino: DestinoDeEnvio, arquivos: readonly ArquivoParaEnviar[]): string | null {
  const r = ENVIOS[destino];
  if (arquivos.length === 0) return r.varios ? "Escolha ao menos um arquivo." : "Escolha o arquivo.";
  if (!r.varios && arquivos.length > 1) return "Envie um arquivo por vez.";
  if (arquivos.some((a) => a.size === 0)) return `O arquivo ${arquivos.find((a) => a.size === 0)!.name} está vazio.`;
  if (r.extensoes.length) {
    const fora = arquivos.find((a) => !r.extensoes.includes(extensao(a.name)));
    if (fora) return destino === "confronto" ? `A planilha do BPO tem de ser .xlsx; ${fora.name} não é.` : `Formato não aceito: ${fora.name}.`;
  }
  const total = arquivos.reduce((s, a) => s + a.size, 0);
  if (total > r.teto - FOLGA_DO_ENVELOPE) return mensagemDeTamanho(destino);
  return null;
}

/** O que entra na derivação da chave de um envio: o pedido, não os bytes do multipart. */
export type ImpressaoDoEnvio = {
  destino: DestinoDeEnvio;
  raiz: string;
  /** Quem envia: o motor amarra a chave ao `ator.id` (§1.5). */
  usuario: string;
  campos: Record<string, string>;
  arquivos: { nome: string; tamanho: number; sha256: string }[];
  /** O gesto do usuário: o mesmo enquanto ele repete o mesmo envio, novo depois de sucesso ou recusa. */
  gesto: string;
};

async function sha256Hex(dados: BufferSource | string): Promise<string> {
  const bytes = typeof dados === "string" ? new TextEncoder().encode(dados) : dados;
  const hash = await globalThis.crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(hash), (b) => b.toString(16).padStart(2, "0")).join("");
}

/** SHA-256 em hexadecimal dos bytes de um arquivo. */
export const sha256DoArquivo = async (arquivo: Blob) => sha256Hex(await arquivo.arrayBuffer());

/**
 * A `Idempotency-Key` de um envio (§13.0.9), **derivada**: a nova tentativa do
 * mesmo arquivo (falha de rede, 5xx, `motor_ocupado`, duplo clique) gera a
 * mesma chave e o motor devolve o resultado guardado (`Idempotent-Replay`), em
 * vez de importar de novo. Os arquivos entram pela impressão (nome, tamanho,
 * SHA-256) e na ordem em que foram escolhidos — a mesma do multipart. O
 * separador do multipart não entra: muda a cada envio. Formato `c41:` + 64
 * hexadecimais, dentro de `^[A-Za-z0-9:_-]{16,100}$`.
 */
export async function chaveDoEnvio(i: ImpressaoDoEnvio): Promise<string> {
  const campos = Object.keys(i.campos).sort().map((k) => [k, i.campos[k]]);
  const canonico = JSON.stringify([i.destino, i.raiz, i.usuario, campos, i.arquivos.map((a) => [a.nome, a.tamanho, a.sha256]), i.gesto]);
  return `c41:${await sha256Hex(canonico)}`;
}

// ─── Respostas (§13.1 a §13.11) ──────────────────────────────────────────────

/** §13.3 — o relatório de `ingestao.ingerir`. */
export const envioDeDocumentosSchema = z.looseObject({
  resumo: z.looseObject({
    lidos: contagem,
    cancelamentos: contagem,
    novos: contagem,
    duplicados: contagem,
    erros: contagem,
    ignorados: contagem,
    por_tipo: z.record(z.string(), contagem).default({}),
  }),
  relatorio: z.array(z.looseObject({
    arquivo: texto,
    tipo: texto,
    chave: textoOuNulo,
    situacao: z.enum(["novo", "duplicado", "erro", "ignorado"]),
    detalhe: texto,
  })),
  importacao_id: z.number().int(),
});
export type EnvioDeDocumentos = z.infer<typeof envioDeDocumentosSchema>;

/** §13.4 e §13.5 — as colunas de `_COLS_PAGAMENTO_LEITURA` mais a decisão; só a chave e a decisão são fixadas. */
export const pagamentoSchema = z.looseObject({
  caminho: z.string(),
  pagina: z.number().int(),
  ordem: z.number().int(),
  decisao: texto,
  decidido_por: texto,
  decidido_em: textoOuNulo,
  motivo_decisao: texto,
  corrigido_por: texto,
  corrigido_em: textoOuNulo,
  valor_corrigido: decimal.optional().transform((v) => v ?? null),
});
export type PagamentoDoMotor = z.infer<typeof pagamentoSchema>;
export const pagamentoGravadoSchema = z.looseObject({ pagamento: pagamentoSchema, registro_ids: registroIds });
export type PagamentoGravado = z.infer<typeof pagamentoGravadoSchema>;

/** §13.6 */
export const contratoInformadoSchema = z.looseObject({
  contrato: z.looseObject({ fornecedor: z.string(), informado_por: texto, informado_em: textoOuNulo }),
  resultado: z.looseObject({
    pagamentos: contagem,
    aceitos: contagem,
    conferir: contagem,
    bloqueados: z.array(z.unknown()).default([]),
    fora_vigencia: contagem,
    sem_documento: contagem,
    sem_credito: contagem,
  }),
  registro_ids: registroIds,
});
export type ContratoInformado = z.infer<typeof contratoInformadoSchema>;

/** §13.7 */
export const cteApuradoSchema = z.looseObject({
  arquivo_id: z.number().int(),
  qtd_cte: contagem,
  valor_total: decimal,
  series: contagem,
  segundos: decimal,
});
export type CteApurado = z.infer<typeof cteApuradoSchema>;

/** §13.8 — a prévia inteira, a mesma de `GET /conferencia/previa`. */
export const simulacaoGravadaSchema = previaFinanceiraSchema;

/** §13.9 */
export const combustivelApuradoSchema = z.looseObject({
  competencia: z.string(),
  cnpj_empresa: texto,
  empresa_id: z.number().int(),
  valor_cfop: decimal,
  valor_ncm: decimal,
  valor_ambos: decimal,
  itens: contagem,
  notas_lidas: contagem,
  notas_falhadas: contagem,
  segundos: decimal,
});
export type CombustivelApurado = z.infer<typeof combustivelApuradoSchema>;

const resumoPorSituacao = z.record(z.string(), z.looseObject({ documentos: contagem, valor: decimal })).default({});

/** §13.10 — conferência do relatório do Omie. */
export const relatorioOmieConferidoSchema = z.looseObject({
  arquivo: z.string(),
  competencia: z.string(),
  linhas: contagem,
  resumo: resumoPorSituacao,
  no_banco: contagem,
  a_conferir: contagem,
});
export type RelatorioOmieConferido = z.infer<typeof relatorioOmieConferidoSchema>;

/** §13.10 — o item de §11.4.5. */
export const documentoDecididoSchema = documentoDaConferenciaSchema;

/** §13.11 */
export const confrontoEnviadoSchema = z.looseObject({
  planilha: z.string(),
  pagamentos: contagem,
  competencias: z.array(z.string()).default([]),
  resumo: resumoPorSituacao,
  total_sem_nota: decimal,
  documentos_sem_nota: contagem,
  total_duplicidade: decimal,
  documentos_duplicidade: contagem,
});
export type ConfrontoEnviado = z.infer<typeof confrontoEnviadoSchema>;

/** §13.2 — o item de §11.1.3. */
export const rejeitadoResolvidoSchema = rejeitadoSchema;

// ─── Corpos ──────────────────────────────────────────────────────────────────

export type ChaveDoPagamento = { caminho: string; pagina: number; ordem: number };
export const DECISOES_DE_PAGAMENTO = ["aceito", "descartado", ""] as const;
export type DecisaoDePagamento = (typeof DECISOES_DE_PAGAMENTO)[number];

/** Os campos corrigíveis (§13.5): ausente não mexe, `""` limpa a correção. */
export const CAMPOS_CORRIGIVEIS = ["valor", "documento", "competencia", "data_pagamento", "nome", "tipo"] as const;
export type CampoCorrigivel = (typeof CAMPOS_CORRIGIVEIS)[number];
export type CorrecaoDePagamento = ChaveDoPagamento & Partial<Record<CampoCorrigivel, string>> & { motivo?: string; decisao?: DecisaoDePagamento };

export const SIM_OU_NAO = ["S", "N"] as const;
export const CAMPOS_SIM_NAO_DO_CONTRATO = ["existe_contrato", "locataria_bld", "e_imovel", "aprovado_fora_da_regra", "so_contabil"] as const;
export const CAMPOS_TEXTO_DO_CONTRATO = ["onde_esta", "locador_nome", "locador_documento", "vigencia_inicio", "vigencia_fim", "observacao", "tratativa"] as const;
export type CorpoDoContrato = { fornecedor: string } & Partial<Record<(typeof CAMPOS_SIM_NAO_DO_CONTRATO)[number], "S" | "N">> & Partial<Record<(typeof CAMPOS_TEXTO_DO_CONTRATO)[number], string>>;

export const DECISOES_DO_DOCUMENTO = ["aceito", "corrigido", "pendente", ""] as const;
export type CorpoDaDecisaoDoDocumento = { decisao: (typeof DECISOES_DO_DOCUMENTO)[number]; observacao: string; chave?: string };

/**
 * As linhas que o motor deixa simular (`financeiro.SIMULADAS`, a lista da
 * fixture `erro_simulacao_linha`). A tela oferece estas; outra o motor recusa
 * com 422 e a lista dele.
 */
export const LINHAS_SIMULAVEIS = ["rpas", "credito_mes_anterior"] as const;
export const ROTULO_DA_LINHA_SIMULAVEL: Record<(typeof LINHAS_SIMULAVEIS)[number], string> = { rpas: "RPAs", credito_mes_anterior: "Crédito do mês anterior" };
export type CorpoDaSimulacao = { competencia: string; linha: string; valor: string | null; observacao?: string };

/** A competência de §11.4 e §13.1: `AAAA-MM`, mês 01 a 12. */
export const COMPETENCIA = /^\d{4}-(0[1-9]|1[0-2])$/;
/** Dinheiro do corpo (§2): string decimal maior ou igual a zero, até 2 casas. */
export const DINHEIRO = /^\d{1,13}(\.\d{1,2})?$/;

/** "1.234,56" ou "1234.56" → "1234.56". `null` quando não é dinheiro. */
export function dinheiroDoCampo(v: string): string | null {
  const t = v.trim().replace(/\s/g, "");
  if (!t) return null;
  const normal = t.includes(",") ? t.replace(/\./g, "").replace(",", ".") : t;
  return DINHEIRO.test(normal) ? normal : null;
}

// ─── Pagamento na tela (§11.3.5 → §13.4 e §13.5) ────────────────────────────

/** A chave de um `PagamentoAConferir` da leitura; `null` quando a linha não a traz (a tela não oferece decidir). */
export function chaveDoPagamentoDaLinha(linha: Record<string, unknown>): ChaveDoPagamento | null {
  const { caminho, pagina, ordem } = linha;
  if (typeof caminho !== "string" || !caminho) return null;
  if (typeof pagina !== "number" || !Number.isInteger(pagina) || typeof ordem !== "number" || !Number.isInteger(ordem)) return null;
  return { caminho, pagina, ordem };
}

/** A coluna da correção já gravada de cada campo corrigível (`_COLS_PAGAMENTO_LEITURA`). */
const COLUNA_CORRIGIDA: Record<CampoCorrigivel, string> = {
  valor: "valor_corrigido", documento: "documento_corrigido", competencia: "competencia_corrigida",
  data_pagamento: "data_pagamento_corrigida", nome: "nome_corrigido", tipo: "tipo_corrigido",
};
/** A coluna original, que a tela mostra como referência. */
export const COLUNA_ORIGINAL: Record<CampoCorrigivel, string> = {
  valor: "valor_bruto", documento: "documento", competencia: "competencia", data_pagamento: "data_pagamento", nome: "nome", tipo: "tipo",
};

/** O formulário da correção começa com a correção já gravada (vazio = sem correção). */
export function correcaoGravada(linha: Record<string, unknown>): Record<CampoCorrigivel, string> {
  return Object.fromEntries(CAMPOS_CORRIGIVEIS.map((c) => {
    const v = linha[COLUNA_CORRIGIDA[c]];
    return [c, v === null || v === undefined ? "" : String(v)];
  })) as Record<CampoCorrigivel, string>;
}

/**
 * O corpo da correção pela convenção do painel (§13.5): só vai o campo que a
 * pessoa mexeu; mexer até esvaziar manda `""`, que **limpa** a correção. O
 * valor digitado com vírgula vira string decimal; `undefined` no lugar de um
 * valor que não é dinheiro, para a tela recusar antes.
 */
export function camposDaCorrecao(inicial: Record<CampoCorrigivel, string>, atual: Record<CampoCorrigivel, string>): Partial<Record<CampoCorrigivel, string>> | { erro: string } {
  const corpo: Partial<Record<CampoCorrigivel, string>> = {};
  for (const c of CAMPOS_CORRIGIVEIS) {
    const antes = inicial[c].trim();
    let depois = atual[c].trim();
    if (c === "valor" && depois) {
      const d = dinheiroDoCampo(depois);
      if (d === null) return { erro: "Valor inválido: use 1.234,56 ou 1234.56." };
      depois = d;
    }
    if (c === "documento") depois = depois.replace(/\D/g, "");
    if (depois !== antes) corpo[c] = depois;
  }
  return corpo;
}

// ─── Prévia financeira → o que falta apurar (§11.4.2 → §13.7 a §13.9) ───────

export type SimulacaoGravada = { linha: string; valor: string | null; observacao: string };
export type PendenciasDaPrevia = { cte: number[]; combustivel: string[]; simulacoes: SimulacaoGravada[] };

const registro = (v: unknown): Record<string, unknown> | null => (v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : null);

/**
 * Os blocos livres da prévia (`cte`, `combustivel`, `simulacoes`) lidos como o
 * motor os manda nas fixtures: `cte.pendentes` são ids de arquivo,
 * `combustivel.pendentes` são CNPJs de estabelecimento e `simulacoes` as
 * linhas digitadas. O que não vier nessa forma é ignorado — a tela só não
 * oferece o botão.
 */
export function pendenciasDaPrevia(previa: { cte: unknown; combustivel: unknown; simulacoes: unknown }): PendenciasDaPrevia {
  const cte = (registro(previa.cte)?.pendentes ?? []) as unknown[];
  const comb = (registro(previa.combustivel)?.pendentes ?? []) as unknown[];
  const sims = Array.isArray(previa.simulacoes) ? previa.simulacoes : [];
  return {
    cte: Array.isArray(cte) ? [...new Set(cte.filter((x): x is number => typeof x === "number" && Number.isSafeInteger(x) && x > 0))] : [],
    combustivel: Array.isArray(comb) ? comb.filter((x): x is string => typeof x === "string" && /^\d{14}$/.test(x)) : [],
    simulacoes: sims.map(registro).filter((x): x is Record<string, unknown> => !!x && typeof x.linha === "string")
      .map((x) => ({ linha: x.linha as string, valor: typeof x.valor === "string" ? x.valor : null, observacao: typeof x.observacao === "string" ? x.observacao : "" })),
  };
}
