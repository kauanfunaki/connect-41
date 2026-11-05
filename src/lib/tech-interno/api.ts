import { z } from "zod";
import { getPrisma } from "@/lib/prisma";
import { ErroApi } from "@/lib/api-v1/erros";
import { anexarArquivo } from "./anexos";
import {
  ErroTechInterno, salvarItem, mudarSituacaoItem, comentarItem, listarItens, detalheItem, opcoesTech,
  type AtorTech, type FalhaTech,
} from "./servidor";
import {
  TIPOS, SITUACOES, PRIORIDADES, TAMANHOS, ROTA_TECH_INTERNO, lerFiltros, chaveDoSistema, nomeDoSistema,
} from "./regras";

// O Controle interno pela API e pelo MCP (05/11/2026, decisão D2). As duas
// portas chamam estas funções, e estas chamam as mesmas do servidor que as
// telas usam — salvarItem, mudarSituacaoItem, comentarItem, anexarArquivo —,
// com a pessoa do token no lugar da pessoa da sessão. Nenhuma regra nova de
// permissão ou de validação nasce aqui: este arquivo só traduz entrada e saída.
//
// O formato da resposta é contrato com scripts e IAs de fora: campo novo pode
// entrar; campo existente não muda de nome nem de tipo.

type Item = NonNullable<Awaited<ReturnType<typeof detalheItem>>>;
type ItemDaLista = Awaited<ReturnType<typeof listarItens>>["items"][number];

/** Um item como a API devolve: códigos estáveis e, ao lado, o rótulo em português. */
export function itemParaApi(item: ItemDaLista, base: string) {
  return {
    id: item.id,
    title: item.title,
    description: item.description,
    type: item.type, typeLabel: TIPOS[item.type],
    priority: item.priority, priorityLabel: PRIORIDADES[item.priority] ?? null,
    status: item.status, statusLabel: SITUACOES[item.status],
    system: { mode: item.systemMode, key: chaveDoSistema(item), name: nomeDoSistema(item) },
    assignee: item.assigneeId ? { id: item.assigneeId, name: item.assignee?.name ?? null } : null,
    dueDate: item.dueDate?.toISOString().slice(0, 10) ?? null,
    size: item.size, sizeLabel: item.size ? TAMANHOS[item.size] : null,
    origin: item.originItemId ? { id: item.originItemId, title: item.originItem?.title ?? null } : null,
    version: item.version,
    createdAt: item.createdAt.toISOString(),
    updatedAt: item.updatedAt.toISOString(),
    url: `${base}${ROTA_TECH_INTERNO}/${item.id}`,
  };
}
export type ItemApi = ReturnType<typeof itemParaApi>;

function detalheParaApi(item: Item, base: string) {
  return {
    ...itemParaApi(item, base),
    comments: item.comments.map(c => ({ id: c.id, author: c.authorName, body: c.body, createdAt: c.createdAt.toISOString() })),
    history: item.changes.map(h => ({ version: h.version, author: h.authorName, createdAt: h.createdAt.toISOString(), changes: h.changes })),
    attachments: item.attachments.map(a => ({
      id: a.id, fileName: a.fileName, mimeType: a.mimeType, sizeBytes: a.sizeBytes, uploadedBy: a.uploadedByName,
      createdAt: a.createdAt.toISOString(), url: `${base}/api/tech-interno/anexos/${a.id}`,
    })),
  };
}

/** Traduz a falha do servidor do Controle interno para o erro da API. */
export function erroDoServidor(falha: FalhaTech | ErroTechInterno): ErroApi {
  const message = falha instanceof ErroTechInterno ? falha.message : falha.error;
  return new ErroApi(falha.code, message);
}
async function comAcesso<T>(fn: () => Promise<T>): Promise<T> {
  try { return await fn(); } catch (e) { throw e instanceof ErroTechInterno ? erroDoServidor(e) : e; }
}
const ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function conferirId(id: string) {
  if (!ID.test(id)) throw new ErroApi("not_found", "Item não encontrado.");
}

// ── Listar ─────────────────────────────────────────────────────────────────

const SITUACOES_DO_FILTRO: [string, ...string[]] = ["OPEN", "ALL", ...Object.keys(SITUACOES)];
export const filtrosApiSchema = z.object({
  status: z.enum(SITUACOES_DO_FILTRO, { error: `Use uma destas situações: ${SITUACOES_DO_FILTRO.join(", ")}.` }).optional(),
  type: z.enum(Object.keys(TIPOS) as [string, ...string[]], { error: `Use um destes tipos: ${Object.keys(TIPOS).join(", ")}.` }).optional(),
  priority: z.coerce.number({ error: "Prioridade de 0 a 3." }).int().min(0, "Prioridade de 0 a 3.").max(3, "Prioridade de 0 a 3.").optional(),
  system: z.string().trim().min(1).max(191).optional(),
  assignee: z.string().trim().min(1).max(191).optional(),
  q: z.string().trim().max(200, "A busca aceita até 200 caracteres.").optional(),
  overdue: z.union([z.boolean(), z.enum(["true", "false", "1", "0"])]).optional().transform(v => v === true || v === "true" || v === "1"),
  page: z.coerce.number({ error: "Página inválida." }).int("Página inválida.").min(1, "Página inválida.").max(1_000_000).optional(),
}).strict();
export type FiltrosApi = z.input<typeof filtrosApiSchema>;

export async function listarParaApi(ator: AtorTech, raw: unknown, base: string) {
  const f = camposValidos(filtrosApiSchema, raw);
  // As mesmas regras de filtro da tela (lerFiltros/whereDosItens), com os nomes da API.
  const filtros = lerFiltros({
    situacao: f.status === "OPEN" ? undefined : f.status, tipo: f.type, prioridade: f.priority?.toString(),
    sistema: f.system, responsavel: f.assignee, q: f.q, atrasados: f.overdue ? "1" : undefined, pagina: f.page?.toString(), visao: "lista",
  });
  const r = await comAcesso(() => listarItens(ator, filtros));
  return { total: r.total, page: r.page, pages: r.pages, items: r.items.map(i => itemParaApi(i, base)) };
}

// ── Ver ────────────────────────────────────────────────────────────────────

export async function verParaApi(ator: AtorTech, id: string, base: string) {
  conferirId(id);
  const item = await comAcesso(() => detalheItem(ator, id));
  if (!item) throw new ErroApi("not_found", "Item não encontrado.");
  return detalheParaApi(item, base);
}

export async function opcoesParaApi(ator: AtorTech) {
  const o = await comAcesso(() => opcoesTech(ator));
  return {
    types: TIPOS, statuses: SITUACOES, priorities: Object.fromEntries(PRIORIDADES.map((p, i) => [i, p])), sizes: TAMANHOS,
    systems: o.sistemas.map(s => ({ key: s.chave, name: s.nome, origin: s.origem, active: s.ativo })),
    people: o.users.map(u => ({ id: u.id, name: u.name })),
    recentDeliveries: o.entregas.map(e => ({ id: e.id, title: e.title })),
  };
}

// ── Criar e atualizar ──────────────────────────────────────────────────────

const camposDoItem = {
  title: z.unknown().optional(), description: z.unknown().optional(), type: z.unknown().optional(), priority: z.unknown().optional(), status: z.unknown().optional(),
  systemMode: z.unknown().optional(), systemKey: z.unknown().optional(), assigneeId: z.unknown().optional(), dueDate: z.unknown().optional(), size: z.unknown().optional(), originItemId: z.unknown().optional(),
};
// Campo com nome errado vira erro, e não um campo ignorado em silêncio.
const criarSchema = z.object(camposDoItem).strict();
const atualizarSchema = z.object({ ...camposDoItem, version: z.unknown().optional() }).strict();
function camposValidos<T extends z.ZodType>(schema: T, raw: unknown): z.output<T> {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) throw new ErroApi("validation_error", "Envie um objeto JSON com os campos do item.");
  const parsed = schema.safeParse(raw);
  if (!parsed.success) {
    const desconhecidos = parsed.error.issues.flatMap(i => i.code === "unrecognized_keys" ? i.keys : []);
    throw new ErroApi("validation_error", desconhecidos.length ? `Campo desconhecido: ${desconhecidos.join(", ")}.` : parsed.error.issues[0].message);
  }
  return parsed.data;
}
/**
 * Atalhos para quem escreve à mão ou pela IA: "assigneeId": "me" é a própria
 * pessoa do token; "systemKey" sem "systemMode" é um sistema do Ops Center.
 */
function comAtalhos(ator: AtorTech, dados: Record<string, unknown>) {
  const r = { ...dados };
  if (r.assigneeId === "me") r.assigneeId = ator.userId;
  if (r.systemKey && r.systemMode === undefined) r.systemMode = "EXISTING";
  if (r.systemMode !== undefined && r.systemMode !== "EXISTING" && r.systemKey === undefined) r.systemKey = null;
  return r;
}

export async function criarParaApi(ator: AtorTech, raw: unknown, base: string) {
  const dados = comAtalhos(ator, camposValidos(criarSchema, raw));
  const r = await salvarItem(ator, dados);
  if ("error" in r) throw erroDoServidor(r);
  return verParaApi(ator, r.id, base);
}

/**
 * Atualiza só os campos enviados. `version` (a do item lido) protege contra
 * gravar por cima de uma alteração de outra pessoa; sem ela, vale a versão de
 * agora — a última escrita ganha.
 */
export async function atualizarParaApi(ator: AtorTech, id: string, raw: unknown, base: string) {
  conferirId(id);
  const { version, ...campos } = camposValidos(atualizarSchema, raw);
  const atual = await comAcesso(() => detalheItem(ator, id));
  if (!atual) throw new ErroApi("not_found", "Item não encontrado.");
  const mudancas: Record<string, unknown> = Object.fromEntries(Object.entries(campos).filter(([, v]) => v !== undefined));
  // Mandar a chave sem o modo é um sistema do Ops Center (ou nenhum, com null);
  // trocar o modo sem mandar a chave limpa a chave antiga.
  if (mudancas.systemKey !== undefined && mudancas.systemMode === undefined) mudancas.systemMode = mudancas.systemKey ? "EXISTING" : "NONE";
  if (mudancas.systemMode !== undefined && mudancas.systemMode !== "EXISTING" && mudancas.systemKey === undefined) mudancas.systemKey = null;
  const dados = comAtalhos(ator, {
    title: atual.title, description: atual.description, type: atual.type, priority: atual.priority, status: atual.status,
    systemMode: atual.systemMode, systemKey: chaveDoSistema(atual), assigneeId: atual.assigneeId,
    dueDate: atual.dueDate?.toISOString().slice(0, 10) ?? null, size: atual.size, originItemId: atual.originItemId,
    ...mudancas,
  });
  const r = await salvarItem(ator, dados, id, version ?? atual.version);
  if ("error" in r) throw erroDoServidor(r);
  return verParaApi(ator, id, base);
}

const situacaoSchema = z.object({ status: z.unknown().optional(), version: z.unknown().optional() }).strict();
export async function mudarSituacaoParaApi(ator: AtorTech, id: string, raw: unknown, base: string) {
  conferirId(id);
  const { status, version } = camposValidos(situacaoSchema, raw);
  if (status === undefined) throw new ErroApi("validation_error", `Informe a situação: ${Object.keys(SITUACOES).join(", ")}.`);
  let versao = version;
  if (versao === undefined) {
    const atual = await comAcesso(() => detalheItem(ator, id));
    if (!atual) throw new ErroApi("not_found", "Item não encontrado.");
    versao = atual.version;
  }
  const r = await mudarSituacaoItem(ator, id, status, versao);
  if ("error" in r) throw erroDoServidor(r);
  return verParaApi(ator, id, base);
}

// ── Comentar e anexar ──────────────────────────────────────────────────────

const comentarioSchema = z.object({ body: z.unknown().optional() }).strict();
export async function comentarParaApi(ator: AtorTech, id: string, raw: unknown) {
  conferirId(id);
  const { body } = camposValidos(comentarioSchema, raw);
  const r = await comentarItem(ator, id, body);
  if ("error" in r) throw erroDoServidor(r);
  const c = await getPrisma().techInternalComment.findFirstOrThrow({ where: { id: r.commentId, tenantId: ator.tenantId } });
  return { id: c.id, itemId: id, author: c.authorName, body: c.body, createdAt: c.createdAt.toISOString() };
}

const CODIGO_DO_STATUS = { 400: "validation_error", 401: "forbidden", 403: "forbidden", 404: "not_found" } as const;
export async function anexarParaApi(ator: AtorTech, id: string, arquivo: File, base: string) {
  conferirId(id);
  if (!arquivo.size) throw new ErroApi("validation_error", "O arquivo está vazio.");
  const r = await anexarArquivo(ator, id, arquivo);
  if (!r.ok) throw new ErroApi(CODIGO_DO_STATUS[r.status as keyof typeof CODIGO_DO_STATUS] ?? "validation_error", r.erro);
  return { id: r.valor.id, itemId: id, fileName: r.valor.nome, url: `${base}/api/tech-interno/anexos/${r.valor.id}` };
}

/** O anexo que chega em base64 (pelo MCP, que só fala JSON). Até 10 MB, como na tela. */
export function arquivoDoBase64(fileName: unknown, contentBase64: unknown, mimeType?: unknown): File {
  if (typeof fileName !== "string" || !fileName.trim() || fileName.length > 255) throw new ErroApi("validation_error", "Informe o nome do arquivo, com a extensão (até 255 caracteres).");
  if (typeof contentBase64 !== "string" || !contentBase64.trim()) throw new ErroApi("validation_error", "Informe o conteúdo do arquivo em base64.");
  const limpo = contentBase64.replace(/^data:[^;,]*;base64,/, "").replace(/\s+/g, "");
  if (!/^[A-Za-z0-9+/_-]*={0,2}$/.test(limpo)) throw new ErroApi("validation_error", "O conteúdo não é base64 válido.");
  if (limpo.length > Math.ceil((10 * 1024 * 1024) / 3) * 4 + 4) throw new ErroApi("payload_too_large", "O arquivo passa de 10 MB.");
  const bytes = Buffer.from(limpo, "base64");
  return new File([bytes], fileName.trim(), { type: typeof mimeType === "string" ? mimeType : "application/octet-stream" });
}
