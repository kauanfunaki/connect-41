// Cliente da API do motor SPED para o Connect (`/api/connect/v1`, 22/10/2026).
//
// O contrato é `docs/API-CONNECT.md` do repositório do motor. Este módulo é
// separado de `client.ts` (o índice de documentos, `/api/integracao`) porque o
// prefixo é outro, a autenticação é outra (leitura e escrita) e as regras de
// nova tentativa são outras.
//
// ─── O que não muda ─────────────────────────────────────────────────────────
//
// - O Connect **não executa nada**: só enfileira, cancela e destrava. Quem gera
//   são os agentes do motor (PLANO-BACKEND-FISCAL-SPED §2).
// - O token nunca sai do servidor. A tela recebe o resultado, nunca a
//   credencial; por isso `server-only`.
// - `cnpj_raiz` vai sempre na query e vem da `Company` autorizada, nunca de um
//   campo de formulário — quem chama já resolveu o alcance.
// - Dinheiro e alíquota viajam como string decimal, nos dois sentidos.

import "server-only";
import { z } from "zod";
import { ErroDoSped, extrairErro, type CorpoDeErro } from "./client";
import type { TipoDeDecisao } from "@/lib/fiscal/motor/decisoes";

export type CredenciaisDoMotorV1 = { baseUrl: string; token: string; tokenEscrita: string | null };

/** Quem age, sempre da sessão do servidor (§1.4). */
export type AtorDoMotor = { id: string; nome: string; email: string; tenant?: string };

const PREFIXO = "/api/connect/v1";
const TIMEOUT_LEITURA_MS = 15_000;
const TIMEOUT_ESCRITA_MS = 30_000;
const TIMEOUT_DOWNLOAD_MS = 120_000;
const RAIZ = /^\d{8}$/;
export const FORMATO_DA_CHAVE = /^[A-Za-z0-9:_-]{16,100}$/;

/** Uma chave por intenção do usuário (§8.2): o formulário a cria ao abrir. */
export function novaChaveDeIdempotencia(): string {
  return `c41:${globalThis.crypto.randomUUID()}`;
}

/**
 * `X-Connect-Ator`: base64url **sem padding** de um JSON em UTF-8. É base64
 * porque nome com acento não cabe em cabeçalho HTTP. Os limites são os do
 * motor; cortar aqui é melhor que tomar `400 ator_invalido` por um nome longo.
 */
export function codificarAtor(ator: AtorDoMotor): string {
  const limpo = {
    id: ator.id.trim().slice(0, 64),
    nome: ator.nome.trim().slice(0, 100),
    email: ator.email.trim().slice(0, 191),
    ...(ator.tenant ? { tenant: ator.tenant.slice(0, 64) } : {}),
  };
  if (!limpo.id || !limpo.nome || !limpo.email.includes("@")) {
    throw new ErroDoMotor(0, "ator_invalido", MENSAGENS.ator_invalido);
  }
  return Buffer.from(JSON.stringify(limpo), "utf8").toString("base64url");
}

export class ErroDoMotor extends ErroDoSped {
  constructor(
    status: number,
    codigo: string | null,
    mensagem: string,
    /** O corpo inteiro do erro: `existente` no 409 de duplicata, `validacao_id`, `campos`... */
    readonly corpo: Record<string, unknown> = {},
  ) {
    super(status, codigo, mensagem);
    this.name = "ErroDoMotor";
  }

  get campos(): Record<string, string> | null {
    const c = this.corpo.campos;
    return c && typeof c === "object" ? (c as Record<string, string>) : null;
  }

  /** 4xx — a mesma chave não adianta: a próxima ação usa outra. */
  get definitivo(): boolean {
    return this.status >= 400 && this.status < 500 && this.codigo !== "idempotencia_em_andamento";
  }
}

// ─── Mensagens ───────────────────────────────────────────────────────────────

/**
 * Códigos em que a mensagem é do Connect: são de infraestrutura ou de
 * configuração, e o texto do motor fala com quem opera o motor, não com quem
 * usa a tela.
 */
const MENSAGENS: Record<string, string> = {
  integracao_desligada: "A integração com o motor SPED está desligada no servidor do motor.",
  nao_autenticado: "O motor SPED recusou o token configurado. Confira a integração em Administração › Integrações.",
  escrita_desligada: "O motor SPED está com a escrita desligada: por enquanto só é possível consultar.",
  token_sem_escrita: "O token de escrita configurado não tem permissão de escrita no motor SPED.",
  escrita_nao_habilitada: "Escrita do SPED não habilitada: falta o token de escrita na integração.",
  raiz_nao_permitida: "Esta raiz de CNPJ ainda não foi liberada no motor SPED.",
  decisao_bloqueada: "Este tipo de decisão está bloqueado para gravação pelo Connect no motor SPED. Fale com o responsável pelo motor.",
  ator_ausente: "Não foi possível identificar o usuário para o motor SPED.",
  ator_invalido: "Não foi possível identificar o usuário para o motor SPED: confira nome e e-mail do seu cadastro.",
  idempotencia_ausente: "A ação foi enviada sem identificador. Recarregue a página e repita.",
  idempotencia_conflito: "Esta ação já foi enviada com outros dados. Recarregue a página e repita.",
  idempotencia_em_andamento: "A mesma ação ainda está sendo processada no motor. Aguarde alguns segundos e confira.",
  cursor_invalido: "A paginação expirou porque os filtros mudaram. Volte à primeira página.",
  json_invalido: "O motor SPED não entendeu a solicitação.",
  corpo_grande: "A solicitação é grande demais para o motor SPED. Envie menos itens por vez.",
  tipo_de_conteudo: "O motor SPED não entendeu a solicitação.",
  tipo_desconhecido: "Tipo de decisão desconhecido pelo motor SPED.",
  operacao_nao_suportada: "O motor SPED não permite esta operação neste tipo de decisão.",
  conflito_versao: "O cadastro mudou no motor desde que você abriu a tela. Recarregue e repita a alteração.",
  banco_indisponivel: "O banco do motor SPED está fora do ar. Tente de novo em alguns minutos.",
  erro_interno: "O motor SPED falhou ao processar a solicitação. Tente de novo; se persistir, avise o responsável pelo motor.",
  resposta_invalida: "O motor SPED respondeu num formato inesperado. Avise o responsável pela integração.",
  tempo_esgotado: "O motor SPED não respondeu a tempo. Tente de novo em instantes.",
  falha_de_rede: "Não foi possível falar com o motor SPED. Confira a conexão e tente de novo.",
  raiz_invalida: "Raiz de CNPJ inválida.",
  nao_encontrado: "Registro não encontrado no motor SPED.",
};

/** Quando o motor não manda texto, o que dizer por código. */
const PADRAO: Record<string, string> = {
  parametro_invalido: "O motor SPED recusou os dados informados.",
  empresa_inativa: "O estabelecimento está inativo no motor SPED.",
  matriz_nao_cadastrada: "A matriz desta raiz não está cadastrada no motor SPED.",
  validacao_nao_suportada: "O motor SPED ainda não valida este tipo de arquivo.",
  sem_arquivo_dominio: "Não há arquivo da Domínio para esta competência.",
  execucao_duplicada: "Já existe um pedido igual na fila ou em execução.",
  execucao_nao_cancelavel: "Só é possível cancelar um pedido que ainda está na fila.",
  execucao_ativa: "O agente ainda deu sinal há pouco: a execução não pode ser destravada agora.",
  validacao_em_andamento: "Já existe uma validação em andamento para este arquivo.",
};

/** A mensagem em português de um erro do motor (§2.1). */
export function mensagemDoErro(status: number, codigo: string | null, erroDoMotor: string | null): string {
  if (codigo && MENSAGENS[codigo]) return MENSAGENS[codigo];
  if (erroDoMotor) return erroDoMotor;
  if (codigo && PADRAO[codigo]) return PADRAO[codigo];
  if (status === 404) return MENSAGENS.nao_encontrado;
  if (status >= 500) return MENSAGENS.erro_interno;
  return `O motor SPED recusou a solicitação (${status}).`;
}

async function erroDaResposta(resposta: Response): Promise<ErroDoMotor> {
  let corpo: Record<string, unknown> = {};
  try {
    const lido = await resposta.json();
    if (lido && typeof lido === "object") corpo = lido as Record<string, unknown>;
  } catch {
    // Corpo não-JSON (proxy na frente do motor): fica o status.
  }
  const codigo = typeof corpo.codigo === "string" && corpo.codigo ? corpo.codigo : extrairErro(corpo as CorpoDeErro).codigo;
  // No v1 `erro` é a frase e `codigo` o identificador; nos formatos antigos,
  // `erro` era o código — aí não serve de frase.
  const frase = typeof corpo.erro === "string" && corpo.erro && corpo.erro !== codigo ? corpo.erro : null;
  return new ErroDoMotor(resposta.status, codigo, mensagemDoErro(resposta.status, codigo, frase), corpo);
}

// ─── Esquemas das respostas ──────────────────────────────────────────────────

const texto = z.string().nullish().transform((v) => v ?? "");
const quando = z.string().nullish().transform((v) => v ?? null);

export const saudeSchema = z.object({
  versao_api: z.string(),
  agora: z.string(),
  escrita_habilitada: z.boolean(),
  banco: z.object({ ok: z.boolean(), latencia_ms: z.number().nullish() }),
  agentes: z.array(z.object({
    agente_host: z.string(),
    plataforma: texto,
    visto_em: quando,
    segundos_sem_sinal: z.number().nullish(),
    item_em_execucao: z.number().nullish(),
    fonte: z.string(),
  })),
  fila: z.object({
    por_estado: z.record(z.string(), z.number()),
    pendente_mais_antigo_seg: z.number().nullish(),
    executando_sem_batida: z.array(z.number()),
  }).nullable(),
});
export type SaudeDoMotor = z.infer<typeof saudeSchema>;

export const empresaMotorSchema = z.object({
  id: z.number().int(),
  cnpj: z.string().regex(/^\d{14}$/),
  matriz: z.boolean(),
  rotulo: texto,
  razao_social: texto,
  nome_fantasia: texto,
  apelido: texto,
  codigo_externo: texto,
  codigo_dominio: texto,
  uf: texto,
  ie: texto,
  cod_mun: texto,
  ativo: z.boolean(),
  obrigacoes: z.array(z.string()),
  config: z.record(z.string(), z.union([z.string(), z.number(), z.null()])).default({}),
  atualizado_em: quando,
  atualizado_por: quando,
});
export type EmpresaDoMotor = z.infer<typeof empresaMotorSchema>;

export const ESTADOS_DE_EXECUCAO = ["pendente", "executando", "concluida", "erro", "cancelada"] as const;
export const ACOES_DE_EXECUCAO = ["paralela", "simples", "erros", "sped", "sped_contribuicoes"] as const;

export const execucaoMotorSchema = z.object({
  id: z.number().int(),
  acao: z.string(),
  rotulo: texto,
  empresa_id: z.number().int().nullable(),
  cnpj: z.string().nullish().transform((v) => v ?? null),
  competencia: z.string().nullish().transform((v) => v ?? null),
  data_ini: z.string(),
  data_fim: z.string(),
  parametros: z.record(z.string(), z.unknown()).nullish().transform((v) => v ?? {}),
  estado: z.enum(ESTADOS_DE_EXECUCAO),
  solicitado_por: z.string().nullish().transform((v) => v ?? null),
  solicitado_em: quando,
  agente_host: quando,
  pid: z.number().nullish(),
  iniciado_em: quando,
  concluido_em: quando,
  batida_em: quando,
  codigo_saida: z.number().nullish(),
  mensagem: z.string().nullish().transform((v) => v ?? null),
  travada: z.boolean(),
  pode_cancelar: z.boolean(),
  pode_destravar: z.boolean(),
  arquivo_ids: z.array(z.number().int()).default([]),
});
export type ExecucaoDoMotor = z.infer<typeof execucaoMotorSchema>;

export const arquivoMotorSchema = z.object({
  id: z.number().int(),
  obrigacao: z.enum(["icms_ipi", "contribuicoes"]),
  cnpj: z.string(),
  empresa_id: z.number().int().nullable(),
  competencia: z.string(),
  data_ini: z.string(),
  data_fim: z.string(),
  versao: z.number().int(),
  considerado: z.boolean(),
  superado_por: z.number().int().nullable(),
  gerado_em: z.string(),
  qtd_linhas: z.number().nullish(),
  tamanho_bytes: z.number().nullish().transform((v) => v ?? null),
  retificadora: z.boolean().nullish().transform((v) => v ?? null),
  qtd_cte: z.number().nullish(),
  qtd_nfe: z.number().nullish(),
  qtd_erros_cte: z.number().nullish(),
  nome_arquivo: z.string(),
  execucao_id: z.number().int().nullish().transform((v) => v ?? null),
  validacao: z.object({
    estado: z.enum(["nao_validado", "validando", "ok", "erro"]),
    id: z.number().nullish(),
    erros: z.number().nullish(),
    advertencias: z.number().nullish(),
    iniciado_em: quando,
    concluido_em: quando,
    mensagem: z.string().nullish(),
  }),
  entrega: z.object({
    estado: z.enum(["nao_registrada", "registrada", "outro_arquivo", "dominio", "nenhum"]),
    origem: z.string().nullish(),
    tipo: z.string().nullish(),
    recibo: z.string().nullish(),
    data_entrega: z.string().nullish(),
    automatico: z.boolean().nullish(),
    decidido_por: z.string().nullish(),
    decidido_em: z.string().nullish(),
  }),
  decisao_ate: z.number().int().nullish().transform((v) => v ?? null),
  defasado: z.boolean(),
  defasado_fonte: z.enum(["registro", "legado"]).nullish().transform((v) => v ?? null),
  decisoes_posteriores: z.number().int().nullish().transform((v) => v ?? null),
});
export type ArquivoDoMotor = z.infer<typeof arquivoMotorSchema>;

export const arquivoDetalheSchema = arquivoMotorSchema.extend({
  totais: z.record(z.string(), z.unknown()).nullish().transform((v) => v ?? null),
  totais_erro: z.string().nullish(),
});
export type ArquivoDetalhado = z.infer<typeof arquivoDetalheSchema>;

export const validacaoSchema = z.looseObject({
  id: z.number().nullish(),
  estado: z.string(),
  erros: z.number().nullish(),
  advertencias: z.number().nullish(),
  mensagem: z.string().nullish(),
  iniciado_em: quando,
  concluido_em: quando,
  achados: z.array(z.record(z.string(), z.unknown())).default([]),
  achados_total: z.number().nullish(),
});
export type ValidacaoDoMotor = z.infer<typeof validacaoSchema>;

export const decisaoMotorSchema = z.looseObject({
  chave: z.record(z.string(), z.unknown()),
  valor: z.record(z.string(), z.unknown()),
  decidido_por: z.string().nullish().transform((v) => v ?? null),
  atualizado_em: quando,
});
export type DecisaoDoMotor = z.infer<typeof decisaoMotorSchema>;

export const registroDecisaoSchema = z.object({
  id: z.number().int(),
  tabela: z.string(),
  chave: z.string(),
  competencia: z.string().nullish().transform((v) => v ?? null),
  acao: z.string(),
  valor_antes: z.unknown().optional(),
  valor_depois: z.unknown().optional(),
  ator: z.string(),
  ator_nome: z.string().nullish().transform((v) => v ?? null),
  origem: z.string(),
  em: z.string(),
});
export type RegistroDeDecisao = z.infer<typeof registroDecisaoSchema>;

function pagina<T extends z.ZodTypeAny>(item: T) {
  return z.object({
    itens: z.array(item),
    proximo_cursor: z.string().nullish().transform((v) => v ?? null),
    rastreado: z.boolean().optional(),
  });
}
export type Pagina<T> = { itens: T[]; proximo_cursor: string | null; rastreado?: boolean };

const gravadasSchema = z.object({ gravadas: z.number().int(), itens: z.array(z.unknown()).default([]), registro_ids: z.array(z.number()).default([]) });
const apagadasSchema = z.object({ apagadas: z.number().int(), registro_ids: z.array(z.number()).default([]) });
const criadasSchema = z.object({ ids: z.array(z.number().int()), itens: z.array(z.unknown()).default([]) });
const validacaoIniciadaSchema = z.object({ validacao_id: z.number().int(), estado: z.string() });

// ─── Transporte ──────────────────────────────────────────────────────────────

export type DependenciasDoMotor = {
  fetch?: typeof fetch;
  /** Espera entre tentativas; os testes a trocam para não dormir. */
  esperar?: (ms: number) => Promise<void>;
};

type Query = Record<string, string | number | boolean | null | undefined>;
type Escrita = { ator: AtorDoMotor; chave?: string | null };
type Pedido = {
  metodo: "GET" | "POST" | "PUT" | "DELETE";
  caminho: string;
  raiz: string;
  query?: Query;
  corpo?: unknown;
  escrita?: Escrita;
  /** POSTs de criação (§1.5): sem chave, nem chama. */
  exigeChave?: boolean;
  timeoutMs?: number;
  accept?: string;
};

const RETRY_LEITURA = new Set([502, 503, 504]);

export function criarClienteDoMotor(creds: CredenciaisDoMotorV1, deps: DependenciasDoMotor = {}) {
  const fazer = deps.fetch ?? globalThis.fetch;
  const esperar = deps.esperar ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
  const base = creds.baseUrl.replace(/\/+$/, "");

  function url(caminho: string, raiz: string, query: Query = {}): string {
    const p = new URLSearchParams({ cnpj_raiz: raiz });
    for (const [k, v] of Object.entries(query)) if (v !== undefined && v !== null && v !== "") p.set(k, String(v));
    return `${base}${PREFIXO}${caminho}?${p.toString()}`;
  }

  /** Uma chamada com as novas tentativas do §8.2. Devolve a resposta OK; erro vira `ErroDoMotor`. */
  async function chamar(pedido: Pedido): Promise<Response> {
    if (!RAIZ.test(pedido.raiz)) throw new ErroDoMotor(0, "raiz_invalida", MENSAGENS.raiz_invalida);
    const escrita = pedido.metodo !== "GET";
    const headers: Record<string, string> = { Accept: pedido.accept ?? "application/json" };
    if (escrita) {
      // Sem token de escrita o Connect nem chama (§8.2).
      if (!creds.tokenEscrita) throw new ErroDoMotor(0, "escrita_nao_habilitada", MENSAGENS.escrita_nao_habilitada);
      if (!pedido.escrita) throw new ErroDoMotor(0, "ator_ausente", MENSAGENS.ator_ausente);
      headers.Authorization = `Bearer ${creds.tokenEscrita}`;
      headers["X-Connect-Ator"] = codificarAtor(pedido.escrita.ator);
      const chave = pedido.escrita.chave;
      if (chave) {
        if (!FORMATO_DA_CHAVE.test(chave)) throw new ErroDoMotor(0, "idempotencia_ausente", MENSAGENS.idempotencia_ausente);
        headers["Idempotency-Key"] = chave;
      } else if (pedido.exigeChave) {
        throw new ErroDoMotor(0, "idempotencia_ausente", MENSAGENS.idempotencia_ausente);
      }
      if (pedido.corpo !== undefined) headers["Content-Type"] = "application/json";
    } else {
      headers.Authorization = `Bearer ${creds.token}`;
    }

    const endereco = url(pedido.caminho, pedido.raiz, pedido.query);
    const timeout = pedido.timeoutMs ?? (escrita ? TIMEOUT_ESCRITA_MS : TIMEOUT_LEITURA_MS);
    // Leitura: uma nova tentativa. Escrita: até duas, e só com a mesma chave —
    // sem chave, repetir um POST poderia criar duas vezes.
    const maxTentativas = escrita ? (pedido.escrita?.chave ? 3 : 1) : 2;
    const corpo = pedido.corpo === undefined ? undefined : JSON.stringify(pedido.corpo);

    for (let tentativa = 1; ; tentativa++) {
      const ultima = tentativa >= maxTentativas;
      let resposta: Response;
      try {
        resposta = await fazer(endereco, {
          method: pedido.metodo,
          headers,
          body: corpo,
          cache: "no-store",
          signal: AbortSignal.timeout(timeout),
        });
      } catch (err) {
        const nome = err instanceof Error ? err.name : "";
        const codigo = nome === "TimeoutError" || nome === "AbortError" ? "tempo_esgotado" : "falha_de_rede";
        if (!ultima) { await esperar(500 * tentativa); continue; }
        throw new ErroDoMotor(0, codigo, MENSAGENS[codigo]);
      }
      if (resposta.ok) return resposta;

      const erro = await erroDaResposta(resposta);
      if (!ultima) {
        if (!escrita && RETRY_LEITURA.has(resposta.status)) { await esperar(500); continue; }
        if (escrita && resposta.status >= 500) { await esperar(500 * tentativa); continue; }
        if (escrita && erro.codigo === "idempotencia_em_andamento") {
          const depois = Number(resposta.headers.get("Retry-After"));
          await esperar(Math.min(Number.isFinite(depois) && depois > 0 ? depois : 2, 5) * 1000);
          continue;
        }
      }
      throw erro;
    }
  }

  async function json<T extends z.ZodTypeAny>(pedido: Pedido, schema: T): Promise<z.infer<T>> {
    const resposta = await chamar(pedido);
    let bruto: unknown;
    try {
      bruto = await resposta.json();
    } catch {
      throw new ErroDoMotor(resposta.status, "resposta_invalida", MENSAGENS.resposta_invalida);
    }
    const lido = schema.safeParse(bruto);
    if (!lido.success) {
      console.warn(`[sped/motor] resposta fora do contrato em ${pedido.metodo} ${pedido.caminho}:`, lido.error.issues.slice(0, 3));
      throw new ErroDoMotor(resposta.status, "resposta_invalida", MENSAGENS.resposta_invalida);
    }
    return lido.data;
  }

  const idDe = (id: number) => {
    if (!Number.isSafeInteger(id) || id < 1) throw new ErroDoMotor(0, "nao_encontrado", MENSAGENS.nao_encontrado);
    return id;
  };

  return {
    // §3
    saude: (raiz: string) => json({ metodo: "GET", caminho: "/saude", raiz }, saudeSchema),
    listarEmpresas: (raiz: string, incluirInativas = true) =>
      json({ metodo: "GET", caminho: "/empresas", raiz, query: { incluir_inativas: incluirInativas } }, pagina(empresaMotorSchema)),
    atualizarEmpresa: (raiz: string, id: number, campos: Record<string, unknown>, escrita: Escrita) =>
      json({ metodo: "PUT", caminho: `/empresas/${idDe(id)}`, raiz, corpo: campos, escrita }, empresaMotorSchema),

    // §4
    listarExecucoes: (raiz: string, filtros: { estado?: string; acao?: string; competencia?: string; empresa_id?: number; limite?: number; cursor?: string | null } = {}) =>
      json({ metodo: "GET", caminho: "/execucoes", raiz, query: filtros }, pagina(execucaoMotorSchema)),
    obterExecucao: (raiz: string, id: number) => json({ metodo: "GET", caminho: `/execucoes/${idDe(id)}`, raiz }, execucaoMotorSchema),
    logDaExecucao: async (raiz: string, id: number, linhas = 200) => {
      const resposta = await chamar({ metodo: "GET", caminho: `/execucoes/${idDe(id)}/log`, raiz, query: { linhas: Math.min(Math.max(Math.trunc(linhas), 1), 5000) }, accept: "text/plain" });
      return {
        texto: await resposta.text(),
        truncado: resposta.headers.get("X-Log-Truncado") === "true",
        estado: resposta.headers.get("X-Execucao-Estado"),
      };
    },
    criarExecucao: (raiz: string, corpo: CorpoDeExecucao, escrita: Escrita) =>
      json({ metodo: "POST", caminho: "/execucoes", raiz, corpo, escrita, exigeChave: true }, execucaoMotorSchema),
    cancelarExecucao: (raiz: string, id: number, escrita: Escrita) =>
      json({ metodo: "POST", caminho: `/execucoes/${idDe(id)}/cancelar`, raiz, corpo: {}, escrita }, execucaoMotorSchema),
    destravarExecucao: (raiz: string, id: number, escrita: Escrita) =>
      json({ metodo: "POST", caminho: `/execucoes/${idDe(id)}/destravar`, raiz, corpo: {}, escrita }, execucaoMotorSchema),

    // §6
    listarArquivos: (raiz: string, filtros: { competencia?: string; obrigacao?: string; cnpj?: string; apenas_considerados?: boolean; limite?: number; cursor?: string | null } = {}) =>
      json({ metodo: "GET", caminho: "/arquivos", raiz, query: filtros }, pagina(arquivoMotorSchema)),
    obterArquivo: (raiz: string, id: number) => json({ metodo: "GET", caminho: `/arquivos/${idDe(id)}`, raiz }, arquivoDetalheSchema),
    /**
     * Os bytes do arquivo, **sem ler o corpo**: quem chama repassa
     * `resposta.body` como stream. Decodificar aqui trocaria acento do
     * ISO-8859-1 e o PVA recusaria o arquivo (§6.4).
     */
    baixarArquivo: (raiz: string, id: number) =>
      chamar({ metodo: "GET", caminho: `/arquivos/${idDe(id)}/download`, raiz, accept: "text/plain", timeoutMs: TIMEOUT_DOWNLOAD_MS }),
    obterValidacao: (raiz: string, id: number, validacaoId?: number) =>
      json({ metodo: "GET", caminho: `/arquivos/${idDe(id)}/validacao`, raiz, query: { validacao_id: validacaoId } }, validacaoSchema),
    relatorioDaValidacao: async (raiz: string, id: number, validacaoId?: number) =>
      (await chamar({ metodo: "GET", caminho: `/arquivos/${idDe(id)}/validacao/relatorio`, raiz, query: { validacao_id: validacaoId }, accept: "text/plain" })).text(),
    decisoesDoArquivo: (raiz: string, id: number, opcoes: { visao?: "ate" | "posteriores"; limite?: number; cursor?: string | null } = {}) =>
      json({ metodo: "GET", caminho: `/arquivos/${idDe(id)}/decisoes`, raiz, query: opcoes }, pagina(registroDecisaoSchema)),
    registroDeDecisoes: (raiz: string, filtros: { competencia?: string; tabela?: string; depois_de?: number; limite?: number; cursor?: string | null } = {}) =>
      json({ metodo: "GET", caminho: "/registro-decisoes", raiz, query: filtros }, pagina(registroDecisaoSchema)),
    regerarArquivo: (raiz: string, id: number, corpo: { tipo_sped: "0" | "1"; confirmar_duplicado?: boolean }, escrita: Escrita) =>
      json({ metodo: "POST", caminho: `/arquivos/${idDe(id)}/regerar`, raiz, corpo, escrita, exigeChave: true }, execucaoMotorSchema),
    validarArquivo: (raiz: string, id: number, escrita: Escrita) =>
      json({ metodo: "POST", caminho: `/arquivos/${idDe(id)}/validar`, raiz, corpo: {}, escrita, exigeChave: true }, validacaoIniciadaSchema),
    registrarEntrega: (raiz: string, id: number, corpo: { tipo: "original" | "retificadora"; recibo: string; data_entrega: string; observacao: string }, escrita: Escrita) =>
      json({ metodo: "POST", caminho: `/arquivos/${idDe(id)}/entrega`, raiz, corpo, escrita, exigeChave: true }, arquivoMotorSchema),

    // §5
    listarDecisoes: (raiz: string, tipo: TipoDeDecisao, filtros: { competencia?: string; cnpj?: string; limite?: number; cursor?: string | null } = {}) =>
      json({ metodo: "GET", caminho: `/decisoes/${tipo}`, raiz, query: filtros }, pagina(decisaoMotorSchema)),
    gravarDecisoes: (raiz: string, tipo: TipoDeDecisao, corpo: { chave?: Record<string, unknown>; chaves?: Record<string, unknown>[]; valor: Record<string, unknown> }, escrita: Escrita) =>
      json({ metodo: "PUT", caminho: `/decisoes/${tipo}`, raiz, corpo, escrita }, gravadasSchema),
    apagarDecisoes: (raiz: string, tipo: TipoDeDecisao, corpo: { chave?: Record<string, unknown>; chaves?: Record<string, unknown>[] }, escrita: Escrita) =>
      json({ metodo: "DELETE", caminho: `/decisoes/${tipo}`, raiz, corpo, escrita }, apagadasSchema),
    /**
     * Criação dos tipos com chave `id` (os ajustes). O §5.0 não fixa o corpo do
     * POST; vai no mesmo envelope do PUT, `{"valor": {...}}`, sem `chave`.
     */
    criarDecisoes: (raiz: string, tipo: TipoDeDecisao, valor: Record<string, unknown>, escrita: Escrita) =>
      json({ metodo: "POST", caminho: `/decisoes/${tipo}`, raiz, corpo: { valor }, escrita, exigeChave: true }, criadasSchema),
  };
}

export type ClienteDoMotor = ReturnType<typeof criarClienteDoMotor>;

/** O corpo de `POST /execucoes` (§4.4). */
export type CorpoDeExecucao = {
  acao: (typeof ACOES_DE_EXECUCAO)[number];
  empresa_id: number;
  competencia?: string | null;
  data_ini?: string | null;
  data_fim?: string | null;
  tipo_sped?: "0" | "1";
  parametros: Record<string, unknown>;
  confirmar_duplicado: boolean;
};
