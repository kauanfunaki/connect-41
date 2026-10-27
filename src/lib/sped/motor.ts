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
import * as T from "./telasDoMotor";
import * as E from "./escritasDoMotor";

export type CredenciaisDoMotorV1 = { baseUrl: string; token: string; tokenEscrita: string | null };

/** Quem age, sempre da sessão do servidor (§1.4). */
export type AtorDoMotor = { id: string; nome: string; email: string; tenant?: string };

const PREFIXO = "/api/connect/v1";
const TIMEOUT_LEITURA_MS = 15_000;
const TIMEOUT_ESCRITA_MS = 30_000;
const TIMEOUT_DOWNLOAD_MS = 120_000;
/** Leituras `pesada` (§11.0.7): 60 s, o teto do gunicorn do motor, e nenhuma nova tentativa automática. */
export const TIMEOUT_PESADA_MS = 60_000;
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
    /** Segundos do `Retry-After` (503 `motor_ocupado`, 409 em andamento), quando o motor mandou. */
    readonly retryAfter: number | null = null,
  ) {
    super(status, codigo, mensagem);
    this.name = "ErroDoMotor";
  }

  get campos(): Record<string, string> | null {
    const c = this.corpo.campos;
    return c && typeof c === "object" ? (c as Record<string, string>) : null;
  }

  /** 4xx — a mesma chave não adianta: a próxima ação usa outra. */
  /** O semáforo das leituras pesadas está cheio (§11.0.7): a tela oferece "tentar de novo". */
  get ocupado(): boolean {
    return this.codigo === "motor_ocupado";
  }

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
  motor_ocupado: "O motor está ocupado com outra leitura pesada; tente em alguns segundos.",
  tamanho_ausente: "O envio chegou ao motor sem o tamanho declarado. Tente de novo; se persistir, avise o responsável pela integração.",
  multipart_invalido: "O motor SPED não conseguiu ler o envio do arquivo. Tente de novo.",
  tempo_esgotado_pesada: "O motor SPED não terminou esta leitura em um minuto. Tente de novo em instantes; se persistir, avise o responsável pelo motor.",
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
  obrigacao_incompativel: "Este arquivo é de outra obrigação: a leitura pedida não se aplica a ele.",
  uf_nao_suportada: "DCIP e DIME só existem para estabelecimento de Santa Catarina.",
  sem_arquivo: "Não há SPED gerado considerado para esta competência.",
  cobertura_em_andamento: "Esta competência já está sendo apurada. Acompanhe o pedido na fila.",
  pagamento_nao_aceitavel: "O motor não aceitou este pagamento: falta informação para o aceite.",
  arquivo_invalido: "O motor SPED não conseguiu ler o arquivo enviado.",
  // §14.0.7
  reprocessamento_em_andamento: "Já há um reprocessamento da quarentena aberto nesta raiz. Acompanhe o pedido na fila.",
  importacao_existente: "Esta planilha já tem faturas no motor. Para trocá-las, envie de novo marcando “substituir”.",
  uploads_em_aberto: "Já há 4 envios em partes abertos nesta raiz. Conclua ou cancele um deles antes de começar outro.",
  upload_encerrado: "Este envio em partes já foi concluído.",
  upload_em_andamento: "A conclusão deste envio ainda está rodando no motor. Aguarde alguns segundos.",
  ocr_indisponivel: "O motor SPED não tem leitura por OCR. Envie sem OCR (os PDF sem texto ficam como inválidos) ou importe pelo painel.",
  parte_invalida: "Uma parte do envio chegou com o tamanho errado. Tente de novo.",
  parte_corrompida: "Uma parte do envio chegou corrompida ao motor. Tente de novo.",
  upload_incompleto: "Faltam partes do envio no motor.",
  sha256_divergente: "O arquivo montado no motor não confere com o do seu computador. As partes serão reenviadas.",
};

/** O `Retry-After` em segundos, quando é um número (o motor não manda data). */
function lerRetryAfter(resposta: Response): number | null {
  const n = Number(resposta.headers.get("Retry-After"));
  return Number.isFinite(n) && n > 0 ? n : null;
}

/** A mensagem em português de um erro do motor (§2.1). */
export function mensagemDoErro(status: number, codigo: string | null, erroDoMotor: string | null): string {
  if (codigo === "motor_ocupado") return MENSAGENS.motor_ocupado;
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
  const retryAfter = lerRetryAfter(resposta);
  let mensagem = mensagemDoErro(resposta.status, codigo, frase);
  if (codigo === "motor_ocupado" && retryAfter) mensagem = `${mensagem.replace(/\.$/, "")} (cerca de ${retryAfter} s).`;
  return new ErroDoMotor(resposta.status, codigo, mensagem, corpo, retryAfter);
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
  /**
   * A classe da rota (§11.0.7). `pesada` lê o LONGBLOB de um SPED gerado:
   * 60 s de timeout e **nenhuma** nova tentativa — nem em 502/504 —, porque
   * repetir dobraria a carga de quem já está ocupando o motor.
   */
  custo?: "leve" | "pesada";
  /** Parâmetros que vão mesmo vazios, porque o vazio quer dizer algo. */
  vazios?: string[];
  /**
   * Envio de arquivo (§13.0.9): o corpo é este multipart, serializado aqui
   * para mandar o `Content-Length` exato, que o motor exige e confere antes
   * de ler. `teto` é o limite do corpo inteiro na rota do motor.
   */
  multipart?: { form: FormData; teto: number; mensagemDeTamanho: string };
  /**
   * Corpo cru (§14.4, a parte de um upload): `application/octet-stream` com o
   * `Content-Length` declarado. Um stream não se relê: uma tentativa só, e
   * quem chama repete a parte (o PUT é idempotente).
   */
  cru?: { corpo: ReadableStream<Uint8Array> | Uint8Array<ArrayBuffer>; tamanho: number; sha256?: string };
};

const RETRY_LEITURA = new Set([502, 503, 504]);

export function criarClienteDoMotor(creds: CredenciaisDoMotorV1, deps: DependenciasDoMotor = {}) {
  const fazer = deps.fetch ?? globalThis.fetch;
  const esperar = deps.esperar ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
  const base = creds.baseUrl.replace(/\/+$/, "");

  function url(caminho: string, raiz: string, query: Query = {}, vazios: readonly string[] = []): string {
    const p = new URLSearchParams({ cnpj_raiz: raiz });
    for (const [k, v] of Object.entries(query)) if (v !== undefined && v !== null && v !== "") p.set(k, String(v));
    // Parâmetro vazio com sentido próprio (`classe=` = todas, §11.1.3).
    for (const k of vazios) if (!p.has(k)) p.set(k, "");
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
      if (pedido.corpo !== undefined && !pedido.multipart && !pedido.cru) headers["Content-Type"] = "application/json";
    } else {
      headers.Authorization = `Bearer ${creds.token}`;
    }

    const endereco = url(pedido.caminho, pedido.raiz, pedido.query, pedido.vazios);
    // `pesada` (§11.0.7 e §13.0.8), leitura ou escrita: 60 s e nenhuma nova
    // tentativa automática, nem em 5xx — repetir dobraria a carga de quem já
    // ocupa o motor, e `503 motor_ocupado` é a tela que oferece de novo.
    const pesada = pedido.custo === "pesada";
    const timeout = pedido.timeoutMs ?? (pesada ? TIMEOUT_PESADA_MS : escrita ? TIMEOUT_ESCRITA_MS : TIMEOUT_LEITURA_MS);
    // Leitura leve: uma nova tentativa. Pesada: nenhuma. Escrita leve: até
    // duas, e só com a mesma chave — sem chave, repetir um POST poderia criar duas vezes.
    const maxTentativas = pesada || pedido.cru ? 1 : escrita ? (pedido.escrita?.chave ? 3 : 1) : 2;
    let corpo: string | Uint8Array<ArrayBuffer> | ReadableStream<Uint8Array> | undefined = pedido.corpo === undefined ? undefined : JSON.stringify(pedido.corpo);
    if (pedido.cru) {
      headers["Content-Type"] = "application/octet-stream";
      headers["Content-Length"] = String(pedido.cru.tamanho);
      if (pedido.cru.sha256) headers["X-Parte-SHA256"] = pedido.cru.sha256;
      corpo = pedido.cru.corpo;
    }
    if (pedido.multipart) {
      // O multipart como o `fetch` o montaria, mas em bytes: assim o
      // `Content-Length` vai declarado e o teto é conferido antes de sair.
      const serializado = new Response(pedido.multipart.form);
      const bytes = new Uint8Array(await serializado.arrayBuffer());
      if (bytes.byteLength > pedido.multipart.teto) throw new ErroDoMotor(0, "corpo_grande", pedido.multipart.mensagemDeTamanho);
      headers["Content-Type"] = serializado.headers.get("Content-Type") ?? "multipart/form-data";
      headers["Content-Length"] = String(bytes.byteLength);
      corpo = bytes;
    }

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
          // Corpo em stream (a parte do upload): o `fetch` do Node exige `duplex`.
          ...(corpo instanceof ReadableStream ? { duplex: "half" } : {}),
        } as RequestInit);
      } catch (err) {
        const nome = err instanceof Error ? err.name : "";
        const codigo = nome === "TimeoutError" || nome === "AbortError" ? "tempo_esgotado" : "falha_de_rede";
        if (!ultima) { await esperar(500 * tentativa); continue; }
        throw new ErroDoMotor(0, codigo, pesada && codigo === "tempo_esgotado" ? MENSAGENS.tempo_esgotado_pesada : MENSAGENS[codigo]);
      }
      if (resposta.ok) return resposta;

      const erro = await erroDaResposta(resposta);
      if (!ultima) {
        // `motor_ocupado` não se repete sozinho: o motor não enfileira, e a tela oferece "tentar de novo".
        if (!escrita && RETRY_LEITURA.has(resposta.status) && !erro.ocupado) { await esperar(500); continue; }
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
    const custo = resposta.headers.get("X-Custo");
    if (custo === "pesada" && pedido.custo !== "pesada") {
      console.warn(`[sped/motor] ${pedido.caminho} veio com X-Custo: pesada, mas o Connect a trata como leve`);
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

  /** Leitura de §11: `custo` decide timeout e nova tentativa. */
  const ler = <S extends z.ZodTypeAny>(caminho: string, raiz: string, schema: S, query: Query = {}, custo: "leve" | "pesada" = "leve") =>
    json({ metodo: "GET", caminho, raiz, query, custo }, schema);
  const competenciaValida = (c: string, aceitaAno = false) => {
    if (/^\d{4}-(0[1-9]|1[0-2])$/.test(c) || (aceitaAno && /^\d{4}$/.test(c))) return c;
    throw new ErroDoMotor(0, "parametro_invalido", "Competência inválida.");
  };

  const telas = {
    // §11.1 Documentos e importações — leves
    listarImportacoes: async (raiz: string, opcoes: { limite?: number; cursor?: string | null } = {}) =>
      ler("/importacoes", raiz, T.importacoesSchema, opcoes),
    obterImportacao: async (raiz: string, id: number) => ler(`/importacoes/${idDe(id)}`, raiz, T.importacaoSchema),
    resumoDaQuarentena: async (raiz: string) => ler("/quarentena/resumo", raiz, T.resumoQuarentenaSchema),
    listarQuarentena: async (raiz: string, filtros: { importacao_id?: number; classe?: string; apenas_pendentes?: boolean; limite?: number; cursor?: string | null } = {}) =>
      // `classe=` vazio traz todas; ausente, o motor usa `desconhecido`.
      json({ metodo: "GET", caminho: "/quarentena", raiz, query: filtros, vazios: filtros.classe === "" ? ["classe"] : [], custo: "leve" }, T.quarentenaSchema),
    /** O XML de um rejeitado, sem ler o corpo: quem chama repassa como stream. */
    xmlDaQuarentena: async (raiz: string, id: number) =>
      chamar({ metodo: "GET", caminho: `/quarentena/${idDe(id)}/xml`, raiz, accept: "application/xml" }),
    obterCobertura: async (raiz: string, empresaId: number, competencia: string) =>
      ler("/cobertura", raiz, T.coberturaRespostaSchema, { empresa_id: idDe(empresaId), competencia: competenciaValida(competencia) }),
    listarCoberturas: async (raiz: string, opcoes: { empresa_id?: number; limite?: number } = {}) =>
      ler("/cobertura/lista", raiz, T.listaDeCoberturaSchema, { ...opcoes, limite: opcoes.limite === undefined ? undefined : Math.min(Math.max(Math.trunc(opcoes.limite), 1), 300) }),
    errosDeExtracao: async (raiz: string, periodo: { data_ini?: string; data_fim?: string } = {}) =>
      ler("/erros-extracao", raiz, T.errosExtracaoSchema, periodo),
    resumoNfse: async (raiz: string) => ler("/nfse/resumo", raiz, T.resumoNfseSchema),

    // §11.2 ICMS e IPI
    apuracaoDoArquivo: async (raiz: string, id: number) => ler(`/arquivos/${idDe(id)}/apuracao`, raiz, T.apuracaoIcmsSchema, {}, "pesada"),
    documentosDoCfop: async (raiz: string, id: number, filtro: { grupo: T.GrupoCfop; cfop: string; cst?: string; aliquota?: string | null; limite?: number }) => {
      if (!T.GRUPOS_CFOP.includes(filtro.grupo)) throw new ErroDoMotor(0, "parametro_invalido", "Grupo de CFOP inválido.");
      const limite = Math.min(Math.max(Math.trunc(filtro.limite ?? 200), 1), 2000);
      return ler(`/arquivos/${idDe(id)}/apuracao/documentos`, raiz, T.documentosDoCfopSchema, { ...filtro, limite }, "pesada");
    },
    demonstrativoDoArquivo: async (raiz: string, id: number) => ler(`/arquivos/${idDe(id)}/demonstrativo`, raiz, T.demonstrativoIcmsSchema, {}, "pesada"),
    saldosIcms: async (raiz: string, empresaId: number) => ler("/saldos-icms", raiz, T.saldosIcmsSchema, { empresa_id: idDe(empresaId) }),
    dcipDime: async (raiz: string, empresaId: number, competencia: string) =>
      ler("/dcip-dime", raiz, T.dcipDimeSchema, { empresa_id: idDe(empresaId), competencia: competenciaValida(competencia) }),
    tabelasIcms: async (raiz: string) => ler("/tabelas/icms", raiz, T.tabelasIcmsSchema),

    // §11.3 PIS e COFINS
    competenciasDoDemonstrativoContrib: async (raiz: string) => ler("/demonstrativo-contribuicoes/competencias", raiz, T.competenciasEAnosSchema),
    demonstrativoContribuicoes: async (raiz: string, filtro: { ano?: string; competencia?: string; filial?: "todas" | number; relatorio?: "entradas" | "saidas"; ordenar?: "cst" | "cfop" | "valor" }) => {
      // Um dos dois é obrigatório; vindo os dois, vale `competencia` — então só ela vai.
      const periodo = filtro.competencia ? { competencia: competenciaValida(filtro.competencia) } : filtro.ano && /^\d{4}$/.test(filtro.ano) ? { ano: filtro.ano } : null;
      if (!periodo) throw new ErroDoMotor(0, "parametro_invalido", "Informe o ano ou a competência do demonstrativo.");
      return ler("/demonstrativo-contribuicoes", raiz, T.demonstrativoContribSchema, { ...periodo, filial: filtro.filial ?? "todas", relatorio: filtro.relatorio ?? "entradas", ordenar: filtro.ordenar ?? "cst" }, "pesada");
    },
    fechamento: async (raiz: string, competencia: string) => ler("/fechamento", raiz, T.fechamentoSchema, { competencia: competenciaValida(competencia, true) }),
    competenciasDoFechamento: async (raiz: string) => ler("/fechamento/competencias", raiz, T.competenciasSchema),
    faturamento: async (raiz: string, competencia: string) => ler("/fechamento/faturamento", raiz, T.faturamentoSchema, { competencia: competenciaValida(competencia, true) }),
    conferenciaDoFechamento: async (raiz: string, filtro: { competencia?: string; sem_credito?: boolean } = {}) =>
      ler("/fechamento/conferencia", raiz, T.conferenciaDoFechamentoSchema, { competencia: filtro.competencia ? competenciaValida(filtro.competencia, true) : undefined, sem_credito: filtro.sem_credito ?? false }),
    duplicatas: async (raiz: string, filtro: { competencia?: string; tipo?: string; limite?: number; cursor?: string | null } = {}) =>
      ler("/fechamento/duplicatas", raiz, T.duplicatasSchema, { ...filtro, competencia: filtro.competencia ? competenciaValida(filtro.competencia, true) : undefined }),
    alugueisDeImoveis: async (raiz: string) => ler("/fechamento/alugueis-imoveis", raiz, T.alugueisSchema),

    // §11.4 Conferência fiscal — só mês (o ano e o mês 13 são recusados)
    competenciasDaConferencia: async (raiz: string) => ler("/conferencia/competencias", raiz, T.competenciasSchema),
    previaDaConferencia: async (raiz: string, competencia: string) => ler("/conferencia/previa", raiz, T.previaFinanceiraSchema, { competencia: competenciaValida(competencia) }),
    prestadores: async (raiz: string, competencia: string) => ler("/conferencia/prestadores", raiz, T.prestadoresSchema, { competencia: competenciaValida(competencia) }),
    confronto: async (raiz: string, filtro: { competencia: string; situacao?: string; limite?: number; cursor?: string | null }) =>
      // `situacao=` vazio = todas (§11.4.4); ausente, o motor usa `sem_nota`.
      json({ metodo: "GET", caminho: "/conferencia/confronto", raiz, query: { ...filtro, competencia: competenciaValida(filtro.competencia) }, vazios: filtro.situacao === "" ? ["situacao"] : [], custo: "leve" }, T.confrontoSchema),
    documentosDaConferencia: async (raiz: string, filtro: { competencia: string; situacao?: string; pendentes?: boolean; limite?: number; cursor?: string | null }) =>
      ler("/conferencia/documentos", raiz, T.documentosDaConferenciaSchema, { ...filtro, competencia: competenciaValida(filtro.competencia) }),
  };

  /**
   * Um envio de arquivo (§13.3, §13.10, §13.11, §14.3): o multipart com os
   * campos primeiro e os arquivos como vieram, sem converter; `extras` vão na
   * segunda parte da regra (os `pdfs` das faturas do BPO).
   */
  const enviar = <S extends z.ZodTypeAny>(destino: E.DestinoDeEnvio, raiz: string, arquivos: readonly File[], campos: Record<string, string>, escrita: Escrita, schema: S, extras: readonly File[] = []) => {
    const regra = E.ENVIOS[destino];
    const form = new FormData();
    for (const [k, v] of Object.entries(campos)) if (v !== "") form.append(k, v);
    for (const a of arquivos) form.append(regra.parte, a, a.name);
    if (extras.length && !regra.extra) throw new ErroDoMotor(0, "arquivo_invalido", "Este envio não aceita arquivos a mais.");
    for (const a of extras) form.append(regra.extra!.parte, a, a.name);
    return json({ metodo: "POST", caminho: regra.caminho, raiz, escrita, exigeChave: true, custo: "pesada", multipart: { form, teto: regra.teto, mensagemDeTamanho: E.mensagemDeTamanho(destino) } }, schema);
  };
  const idDoUpload = (id: string) => {
    if (!E.ID_DO_UPLOAD.test(id)) throw new ErroDoMotor(0, "nao_encontrado", MENSAGENS.nao_encontrado);
    return id;
  };
  /** Escrita sem corpo na resposta (204). */
  const semCorpo = async (pedido: Pedido): Promise<void> => {
    await chamar(pedido);
  };
  const competenciaOpcional = (c: string | undefined): Record<string, string> => (c ? { competencia: competenciaValida(c) } : {});

  /** As escritas das telas fiscais (§13). Todas com o ator; a chave vem do gesto do usuário. */
  const escritas = {
    // §13.1 — fila: vira a ação `cobertura`, 202 com a `Execucao`.
    // `confirmar_duplicado` só vai quando é `true` (o padrão do motor é `false`).
    apurarCobertura: (raiz: string, corpo: { empresa_id: number; competencia: string; confirmar_duplicado?: boolean }, escrita: Escrita) =>
      json({ metodo: "POST", caminho: "/cobertura/apurar", raiz, corpo: { empresa_id: idDe(corpo.empresa_id), competencia: competenciaValida(corpo.competencia), ...(corpo.confirmar_duplicado ? { confirmar_duplicado: true } : {}) }, escrita, exigeChave: true }, execucaoMotorSchema),
    // §13.2
    resolverRejeitado: (raiz: string, id: number, corpo: { resolvido: boolean; observacao?: string }, escrita: Escrita) =>
      json({ metodo: "POST", caminho: `/quarentena/${idDe(id)}/resolver`, raiz, corpo, escrita }, E.rejeitadoResolvidoSchema),
    // §13.3 — pesada, até 25 MiB.
    enviarDocumentos: (raiz: string, arquivos: readonly File[], escrita: Escrita) =>
      enviar("documentos", raiz, arquivos, {}, escrita, E.envioDeDocumentosSchema),
    // §13.4 e §13.5
    decidirPagamento: (raiz: string, corpo: E.ChaveDoPagamento & { decisao: E.DecisaoDePagamento; motivo?: string }, escrita: Escrita) =>
      json({ metodo: "POST", caminho: "/fechamento/pagamentos/decidir", raiz, corpo, escrita }, E.pagamentoGravadoSchema),
    corrigirPagamento: (raiz: string, corpo: E.CorrecaoDePagamento, escrita: Escrita) =>
      json({ metodo: "POST", caminho: "/fechamento/pagamentos/corrigir", raiz, corpo, escrita }, E.pagamentoGravadoSchema),
    // §13.6
    informarContrato: (raiz: string, corpo: E.CorpoDoContrato, escrita: Escrita) =>
      json({ metodo: "POST", caminho: "/fechamento/alugueis-imoveis/informar", raiz, corpo, escrita }, E.contratoInformadoSchema),
    // §13.7 — pesada, sem corpo.
    apurarCteDoArquivo: (raiz: string, id: number, escrita: Escrita) =>
      json({ metodo: "POST", caminho: `/arquivos/${idDe(id)}/apurar-cte`, raiz, escrita, custo: "pesada" }, E.cteApuradoSchema),
    // §13.8 — devolve a prévia inteira.
    gravarSimulacao: (raiz: string, corpo: E.CorpoDaSimulacao, escrita: Escrita) =>
      json({ metodo: "PUT", caminho: "/conferencia/simulacoes", raiz, corpo: { ...corpo, competencia: competenciaValida(corpo.competencia) }, escrita }, E.simulacaoGravadaSchema),
    // §13.9 — pesada.
    apurarCombustivel: (raiz: string, corpo: { empresa_id: number; competencia: string }, escrita: Escrita) =>
      json({ metodo: "POST", caminho: "/conferencia/combustivel/apurar", raiz, corpo: { empresa_id: idDe(corpo.empresa_id), competencia: competenciaValida(corpo.competencia) }, escrita, custo: "pesada" }, E.combustivelApuradoSchema),
    // §13.10 — pesada, até 20 MiB; a decisão é leve.
    conferirRelatorioOmie: (raiz: string, arquivo: File, competencia: string | undefined, escrita: Escrita) =>
      enviar("omie", raiz, [arquivo], competenciaOpcional(competencia), escrita, E.relatorioOmieConferidoSchema),
    decidirDocumentoDaConferencia: (raiz: string, id: number, corpo: E.CorpoDaDecisaoDoDocumento, escrita: Escrita) =>
      json({ metodo: "POST", caminho: `/conferencia/documentos/${idDe(id)}/decidir`, raiz, corpo, escrita }, E.documentoDecididoSchema),
    // §13.11 — pesada, .xlsx até 20 MiB.
    confrontarPlanilha: (raiz: string, arquivo: File, competencia: string | undefined, escrita: Escrita) =>
      enviar("confronto", raiz, [arquivo], competenciaOpcional(competencia), escrita, E.confrontoEnviadoSchema),
  };

  /** As escritas de §14 (lacunas fechadas). */
  const lacunas = {
    // §14.1 — leve. `regime: null` apaga a correção do cliente; `competencia`, quando vem, traz a lista de volta.
    definirRegimeDoPrestador: async (raiz: string, corpo: { cnpj: string; regime: E.Regime | null; nome?: string; competencia?: string }, escrita: Escrita) => {
      if (!/^\d{14}$/.test(corpo.cnpj)) throw new ErroDoMotor(0, "parametro_invalido", "CNPJ do prestador inválido.");
      return json({ metodo: "PUT", caminho: "/conferencia/prestadores/regime", raiz, corpo: { cnpj: corpo.cnpj, regime: corpo.regime, ...(corpo.nome ? { nome: corpo.nome } : {}), ...competenciaOpcional(corpo.competencia) }, escrita }, E.regimeGravadoSchema);
    },
    // §14.2 — fila: vira a ação `quarentena`, 202 com a `Execucao`.
    reprocessarQuarentena: async (raiz: string, corpo: { classe: string }, escrita: Escrita) => {
      if (!/^[a-z_]{1,30}$/.test(corpo.classe)) throw new ErroDoMotor(0, "parametro_invalido", "Classe da quarentena inválida.");
      return json({ metodo: "POST", caminho: "/quarentena/reprocessar", raiz, corpo: { classe: corpo.classe }, escrita, exigeChave: true }, execucaoMotorSchema);
    },
    // §14.3 — pesadas, multipart até 25 MiB.
    importarPagamentosApoio: async (raiz: string, arquivos: readonly File[], campos: { tipo: E.TipoDePagamentoApoio; pasta?: string; ocr?: boolean }, escrita: Escrita) =>
      enviar("pagamentos_apoio", raiz, arquivos, { tipo: campos.tipo, ...(campos.pasta ? { pasta: campos.pasta } : {}), ...(campos.ocr ? { ocr: "true" } : {}) }, escrita, E.pagamentosApoioImportadosSchema),
    importarFaturasBpo: async (raiz: string, planilha: File, pdfs: readonly File[], campos: { substituir?: boolean }, escrita: Escrita) =>
      enviar("faturas_bpo", raiz, [planilha], campos.substituir ? { substituir: "true" } : {}, escrita, E.faturasBpoImportadasSchema, pdfs),
    // §14.4 — sessões de upload.
    criarUpload: (raiz: string, corpo: { nome: string; tamanho: number }, escrita: Escrita) =>
      json({ metodo: "POST", caminho: "/uploads", raiz, corpo, escrita, exigeChave: true }, E.uploadSchema),
    obterUpload: async (raiz: string, id: string) => json({ metodo: "GET", caminho: `/uploads/${idDoUpload(id)}`, raiz }, E.uploadSchema),
    /**
     * Uma parte, com o corpo **em stream** (do navegador ao motor sem ficar
     * inteiro na memória do Connect). Sem `Idempotency-Key`: o motor a ignora
     * nas partes (§14.0.3). Uma tentativa só: quem chama repete a parte.
     */
    enviarParteDoUpload: async (raiz: string, id: string, numero: number, corpo: ReadableStream<Uint8Array> | Uint8Array<ArrayBuffer>, info: { tamanho: number; sha256?: string }, escrita: Escrita) => {
      if (!Number.isSafeInteger(numero) || numero < 1) throw new ErroDoMotor(0, "parte_invalida", "Número de parte inválido.");
      return json({ metodo: "PUT", caminho: `/uploads/${idDoUpload(id)}/partes/${numero}`, raiz, escrita, timeoutMs: TIMEOUT_PESADA_MS, cru: { corpo, tamanho: info.tamanho, sha256: info.sha256 } }, E.parteRecebidaSchema);
    },
    /** Pesada; idempotente por conta própria (a mesma `sha256` devolve o mesmo relatório), por isso sem chave. */
    concluirUpload: async (raiz: string, id: string, sha256: string, escrita: Escrita) => {
      if (!/^[0-9a-f]{64}$/.test(sha256)) throw new ErroDoMotor(0, "parametro_invalido", "SHA-256 do arquivo inválido.");
      return json({ metodo: "POST", caminho: `/uploads/${idDoUpload(id)}/concluir`, raiz, corpo: { sha256 }, escrita, custo: "pesada" }, E.uploadConcluidoSchema);
    },
    apagarUpload: async (raiz: string, id: string, escrita: Escrita) =>
      semCorpo({ metodo: "DELETE", caminho: `/uploads/${idDoUpload(id)}`, raiz, escrita }),
  };

  return {
    ...telas,
    ...escritas,
    ...lacunas,
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
