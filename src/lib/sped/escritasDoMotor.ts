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
import { decimal, previaFinanceiraSchema, prestadoresSchema, rejeitadoSchema, documentoDaConferenciaSchema } from "./telasDoMotor";

const texto = z.string().nullish().transform((v) => v ?? "");
const textoOuNulo = z.string().nullish().transform((v) => v ?? null);
const contagem = z.number().int();
const registroIds = z.array(z.number().int()).default([]);

// ─── Envios de arquivo (§13.0.9) ─────────────────────────────────────────────

const MiB = 1024 * 1024;

export const DESTINOS_DE_ENVIO = ["documentos", "omie", "confronto", "pagamentos_apoio", "faturas_bpo"] as const;
export type DestinoDeEnvio = (typeof DESTINOS_DE_ENVIO)[number];

export type RegraDoEnvio = {
  /** A rota do motor. */
  caminho: string;
  /** O nome da parte do arquivo no multipart. */
  parte: "arquivos" | "arquivo" | "planilha";
  /** Mais de um arquivo por envio. */
  varios: boolean;
  /**
   * Uma segunda parte de arquivos, opcional e com várias (§14.3: os `pdfs`
   * dos comprovantes ao lado da `planilha` do BPO).
   */
  extra?: { parte: "pdfs"; extensoes: readonly string[]; rotulo: string };
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
  // §14.3 — as duas importações de apoio, na tela onde os pagamentos de apoio
  // são conferidos (PIS e COFINS › Fechamento, §14.6).
  pagamentos_apoio: { caminho: "/pagamentos-apoio/importar", parte: "arquivos", varios: true, teto: 25 * MiB, extensoes: ["pdf"], modulo: "fiscal_contribuicoes", tela: "/fiscal/contribuicoes", rotulo: "pagamentos de apoio" },
  faturas_bpo: { caminho: "/faturas-bpo/importar", parte: "planilha", varios: false, teto: 25 * MiB, extensoes: ["xlsx"], extra: { parte: "pdfs", extensoes: ["pdf"], rotulo: "comprovantes" }, modulo: "fiscal_contribuicoes", tela: "/fiscal/contribuicoes", rotulo: "planilha de faturas do BPO" },
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
  if (destino === "documentos") return `O envio passa de ${formatarMiB(r.teto)} num corpo só. Acima disso o Connect manda em partes, até 500 MB.`;
  if (destino === "pagamentos_apoio" || destino === "faturas_bpo") return `O envio passa de ${formatarMiB(r.teto)}, o limite do motor por envio. Divida em envios menores.`;
  return `A ${r.rotulo} passa de ${formatarMiB(r.teto)}, o limite do motor. Reduza o arquivo ou envie pelo painel do motor.`;
}

const extensao = (nome: string) => (nome.includes(".") ? nome.split(".").pop()!.toLowerCase() : "");

export type ArquivoParaEnviar = { name: string; size: number; type?: string };

/**
 * Confere os arquivos antes do envio, no navegador e de novo na rota:
 * quantidade, extensão e tamanho (o total dos arquivos contra o teto menos a
 * folga do envelope). `null` quando está tudo certo.
 */
export function conferirArquivos(destino: DestinoDeEnvio, arquivos: readonly ArquivoParaEnviar[], extras: readonly ArquivoParaEnviar[] = []): string | null {
  const r = ENVIOS[destino];
  if (arquivos.length === 0) return r.varios ? "Escolha ao menos um arquivo." : r.parte === "planilha" ? "Escolha a planilha." : "Escolha o arquivo.";
  if (!r.varios && arquivos.length > 1) return r.parte === "planilha" ? "Envie uma planilha por vez." : "Envie um arquivo por vez.";
  if (extras.length && !r.extra) return "Este envio não aceita arquivos a mais.";
  const todos = [...arquivos, ...extras];
  if (todos.some((a) => a.size === 0)) return `O arquivo ${todos.find((a) => a.size === 0)!.name} está vazio.`;
  if (r.extensoes.length) {
    const fora = arquivos.find((a) => !r.extensoes.includes(extensao(a.name)));
    if (fora) {
      if (destino === "confronto" || destino === "faturas_bpo") return `A ${r.rotulo} tem de ser .xlsx; ${fora.name} não é.`;
      if (destino === "pagamentos_apoio") return `Os pagamentos de apoio vão em PDF; ${fora.name} não é.`;
      return `Formato não aceito: ${fora.name}.`;
    }
  }
  if (r.extra) {
    const fora = extras.find((a) => !r.extra!.extensoes.includes(extensao(a.name)));
    if (fora) return `Os ${r.extra.rotulo} vão em PDF; ${fora.name} não é.`;
  }
  const total = todos.reduce((s, a) => s + a.size, 0);
  if (total > r.teto - FOLGA_DO_ENVELOPE) return mensagemDeTamanho(destino);
  return null;
}

// ─── Campos de formulário dos envios (§13.10, §13.11, §14.3) ────────────────

/** Os tipos de `POST /pagamentos-apoio/importar` (o `--tipo` da ferramenta, fixture `erro_pagamentos_apoio_tipo`). */
export const TIPOS_DE_PAGAMENTO_APOIO = ["rpa", "recibo", "contrato_motorista", "contrato_locacao", "fatura"] as const;
export type TipoDePagamentoApoio = (typeof TIPOS_DE_PAGAMENTO_APOIO)[number];
export const ROTULO_DO_TIPO_DE_APOIO: Record<TipoDePagamentoApoio, string> = {
  rpa: "RPA", recibo: "Recibo", contrato_motorista: "Contrato de motorista", contrato_locacao: "Contrato de locação", fatura: "Fatura",
};

/** A subpasta "virtual" do lote (§14.3): até 200, sem `..` nem barra no começo. */
export function pastaValida(pasta: string): boolean {
  return pasta.length <= 200 && !pasta.split(/[\\/]/).includes("..") && !/^[\\/]/.test(pasta);
}

/**
 * Os campos de formulário que cada envio aceita, na ordem do multipart, já
 * validados. Campo ausente ou vazio não vai (o motor usa o padrão); os
 * booleanos só vão quando `"true"`, porque o padrão é `"false"`. Uma função só,
 * usada pela tela e pela rota do Connect.
 */
export function camposDoEnvio(destino: DestinoDeEnvio, ler: (campo: string) => string | null | undefined): { campos: Record<string, string> } | { erro: string; campo: string } {
  const v = (k: string) => (ler(k) ?? "").trim();
  const sim = (k: string) => v(k) === "true" || v(k) === "1";
  switch (destino) {
    case "documentos":
      return { campos: {} };
    case "omie":
    case "confronto": {
      const competencia = v("competencia");
      if (competencia && !COMPETENCIA.test(competencia)) return { erro: "Competência inválida (AAAA-MM).", campo: "competencia" };
      return { campos: competencia ? { competencia } : {} };
    }
    case "pagamentos_apoio": {
      const tipo = v("tipo");
      if (!(TIPOS_DE_PAGAMENTO_APOIO as readonly string[]).includes(tipo)) return { erro: "Escolha o tipo dos documentos.", campo: "tipo" };
      const pasta = v("pasta");
      if (!pastaValida(pasta)) return { erro: "Pasta inválida: até 200 caracteres, sem “..” nem barra no começo.", campo: "pasta" };
      return { campos: { tipo, ...(pasta ? { pasta } : {}), ...(sim("ocr") ? { ocr: "true" } : {}) } };
    }
    case "faturas_bpo":
      return { campos: sim("substituir") ? { substituir: "true" } : {} };
  }
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

// ─── Respostas de §14 ────────────────────────────────────────────────────────

export const REGIMES = ["mei", "normal"] as const;
export type Regime = (typeof REGIMES)[number];
export const ORIGENS_DO_REGIME = ["cliente", "cadastro", "nome"] as const;
export type OrigemDoRegime = (typeof ORIGENS_DO_REGIME)[number];
const regimeOuNulo = z.enum(REGIMES).nullish().transform((v) => v ?? null);

/** §14.1 — o prestador depois da escrita, com as três camadas. */
export const prestadorComRegimeSchema = z.looseObject({
  cnpj: z.string(),
  nome: texto,
  regime: z.enum(REGIMES),
  origem: z.enum(ORIGENS_DO_REGIME),
  regime_cliente: regimeOuNulo,
  regime_cadastro: regimeOuNulo,
  regime_pelo_nome: regimeOuNulo,
  definido_por: textoOuNulo,
  atualizado_em: textoOuNulo,
});
export type PrestadorComRegime = z.infer<typeof prestadorComRegimeSchema>;
/** `prestadores` só vem quando o corpo trouxe `competencia`: é o corpo de `GET /conferencia/prestadores`. */
export const regimeGravadoSchema = z.looseObject({
  prestador: prestadorComRegimeSchema,
  prestadores: prestadoresSchema.optional().transform((v) => v ?? null),
});
export type RegimeGravado = z.infer<typeof regimeGravadoSchema>;

const porChave = <T extends z.ZodTypeAny>(valor: T) => z.record(z.string(), valor).default({});

/** §14.3 — `POST /pagamentos-apoio/importar`. */
export const pagamentosApoioImportadosSchema = z.looseObject({
  tipo: z.string(),
  pasta: texto,
  linhas: contagem,
  gravadas: contagem,
  situacoes: porChave(contagem),
  por_competencia: porChave(contagem),
  soma_ok: z.looseObject({ bruto: decimal, liquido: decimal }),
  paginas_sem_texto: contagem,
  ocr: z.looseObject({ lidas: contagem, falhou: contagem }),
  recusadas: z.array(z.looseObject({ arquivo: texto, tipo_no_banco: texto, linhas: contagem })).default([]),
  arquivos: z.array(z.looseObject({ arquivo: texto, caminho: texto, linhas: contagem })).default([]),
});
export type PagamentosApoioImportados = z.infer<typeof pagamentosApoioImportadosSchema>;

/** §14.3 — `POST /faturas-bpo/importar`. */
export const faturasBpoImportadasSchema = z.looseObject({
  planilha: z.string(),
  pagamentos: contagem,
  situacoes: porChave(contagem),
  soma_ok: decimal,
  com_comprovante: contagem,
  por_competencia: porChave(decimal),
  removidas: contagem,
  gravadas: contagem,
});
export type FaturasBpoImportadas = z.infer<typeof faturasBpoImportadasSchema>;

/** §14.4 — o id opaco de uma sessão de upload. */
export const ID_DO_UPLOAD = /^[0-9a-f]{32}$/;
/** §14.4 — o objeto `Upload`. */
export const uploadSchema = z.looseObject({
  id: z.string().regex(ID_DO_UPLOAD),
  nome: z.string(),
  tamanho: contagem,
  tamanho_parte: z.number().int().positive(),
  partes_esperadas: z.number().int().positive(),
  partes_recebidas: z.array(z.number().int()).default([]),
  recebido: contagem,
  estado: z.enum(["aberta", "concluindo", "concluida"]),
  criado_por: texto,
  criado_em: textoOuNulo,
  expira_em: textoOuNulo,
  importacao_id: z.number().int().nullish().transform((v) => v ?? null),
});
export type UploadDoMotor = z.infer<typeof uploadSchema>;
/** §14.4 — resposta do `PUT /uploads/{id}/partes/{n}`. */
export const parteRecebidaSchema = z.looseObject({
  numero: z.number().int(),
  tamanho: contagem,
  sha256: z.string(),
  recebido: contagem,
  partes_recebidas: z.array(z.number().int()).default([]),
  partes_esperadas: z.number().int(),
});
export type ParteRecebida = z.infer<typeof parteRecebidaSchema>;
/** §14.4 — a conclusão: o relatório de §13.3 mais `upload_id`. */
export const uploadConcluidoSchema = envioDeDocumentosSchema.extend({ upload_id: z.string() });
export type UploadConcluido = z.infer<typeof uploadConcluidoSchema>;

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

// ─── Prestador na tela (§14.1) ───────────────────────────────────────────────

export type RegimeNaTela = {
  /** O selo da camada que decidiu; `null` quando o motor não mandou `origem` (anterior a §14). */
  origem: { rotulo: string; variante: "info" | "neutral" | "warning"; dica: string } | null;
  /** O regime que vale agora, como a tela escreve. */
  rotulo: string;
  /** As correções que a linha oferece: trocar para o outro regime e, só quando a correção é do cliente, apagá-la. */
  acoes: { regime: Regime | null; rotulo: string }[];
};

const ORIGEM_NA_TELA: Record<OrigemDoRegime, NonNullable<RegimeNaTela["origem"]>> = {
  cliente: { rotulo: "Corrigido neste cliente", variante: "info", dica: "A correção vale só para este cliente e vence o cadastro global." },
  cadastro: { rotulo: "Cadastro global", variante: "neutral", dica: "O fato da Receita, gravado no painel do motor: vale para todos os clientes." },
  nome: { rotulo: "Pelo nome", variante: "warning", dica: "Palpite pelo nome do prestador: nem o cliente nem o cadastro têm este CNPJ." },
};

/**
 * Os dados da coluna de regime de um prestador (§14.1): o selo da origem e os
 * botões. Corrigir para o regime que já vale não muda nada, então a linha só
 * oferece o outro; "voltar ao cadastro" (`regime: null`) só faz sentido quando
 * quem decidiu foi a correção do cliente.
 */
export function regimeNaTela(p: { regime: string; origem: OrigemDoRegime | null }): RegimeNaTela {
  const atual: Regime | null = p.regime === "mei" || p.regime === "normal" ? p.regime : null;
  const acoes: RegimeNaTela["acoes"] = [];
  if (atual !== "mei") acoes.push({ regime: "mei", rotulo: "É MEI" });
  if (atual !== "normal") acoes.push({ regime: "normal", rotulo: "É normal" });
  if (p.origem === "cliente") acoes.push({ regime: null, rotulo: "Desfazer correção" });
  return { origem: p.origem ? ORIGEM_NA_TELA[p.origem] : null, rotulo: atual === "mei" ? "MEI" : atual === "normal" ? "Normal" : p.regime || "—", acoes };
}

// ─── Relatório de vários envios (§14.4: uma sessão por arquivo) ─────────────

/** Junta os relatórios de ingestão de vários envios num só, para a tela mostrar o lote inteiro. */
export function somarEnvios(envios: readonly EnvioDeDocumentos[]): EnvioDeDocumentos | null {
  if (envios.length === 0) return null;
  const chaves = ["lidos", "cancelamentos", "novos", "duplicados", "erros", "ignorados"] as const;
  const resumo = { ...envios[0].resumo, por_tipo: { ...envios[0].resumo.por_tipo } };
  for (const e of envios.slice(1)) {
    for (const k of chaves) resumo[k] += e.resumo[k];
    for (const [t, n] of Object.entries(e.resumo.por_tipo)) resumo.por_tipo[t] = (resumo.por_tipo[t] ?? 0) + n;
  }
  return { ...envios[envios.length - 1], resumo, relatorio: envios.flatMap((e) => e.relatorio) };
}
