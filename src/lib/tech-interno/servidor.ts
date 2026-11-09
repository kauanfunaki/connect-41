import { Prisma } from "@/generated/prisma/client";
import { getPrisma } from "@/lib/prisma";
import type { AuthContext } from "@/lib/auth/context";
import { podeNoModulo, type NivelNoModulo } from "@/lib/auth/modulo";
import { logAudit } from "@/lib/audit";
import { intervaloMes } from "./agenda";
import {
  MODULO_TECH_INTERNO, TAMANHO_PAGINA, TIPOS, SITUACOES, PRIORIDADES, EM_ABERTO, TAMANHOS,
  CONFLITO, SEM_VINCULO, itemSchema, comentarioSchema, versaoSchema, hojeEmSaoPaulo, diferencas,
  vinculoDoSistema, chaveDoSistema, nomeDoSistema, entregaSchema, type DadosItem, type Filtros, type SistemaTech, type Alteracao,
} from "./regras";
import { intervaloDoResumo, montarResumo, type PeriodoDoResumo } from "./resumo";

/** O tipo do erro, para a API responder com o código e o status certos; as telas usam só a mensagem. */
export type CodigoTech = "forbidden" | "not_found" | "conflict" | "validation_error" | "internal_error";
export class ErroTechInterno extends Error {
  constructor(message: string, public code: CodigoTech = "validation_error") { super(message); }
}
type Tx = Prisma.TransactionClient;
export type FalhaTech = { error: string; code: CodigoTech };
export type ResultadoTech = { ok: true; id: string } | FalhaTech;
/**
 * Quem age (05/11/2026): a pessoa da sessão, nas telas, ou a pessoa dona do
 * token pessoal, na API e no MCP — a mesma regra para os dois. `via` marca na
 * Auditoria que a ação veio pelo token; o histórico do item fica com o nome da
 * pessoa, como se ela tivesse feito pela tela.
 */
export type AtorTech = AuthContext & { via?: { tokenId: string; tokenName: string } };
const conflito = (): FalhaTech => ({ error: CONFLITO, code: "conflict" });
const doOps = { select: { name: true, isActive: true } } as const;
const incluir = { tool: { select: { name: true, active: true } }, opsWatcher: doOps, opsSite: doOps, opsApp: doOps, assignee: { select: { name: true, active: true } }, originItem: { select: { title: true } } } as const;
type ItemCompleto = Prisma.TechInternalItemGetPayload<{ include: typeof incluir }>;

async function conferirAcesso(ctx: AuthContext, nivel: NivelNoModulo) {
  if (!ctx.userId || !ctx.tenantId || !await podeNoModulo(ctx, MODULO_TECH_INTERNO, nivel)) {
    throw new ErroTechInterno("Controle interno indisponível para este acesso.", "forbidden");
  }
}
async function autor(tx: Tx, ctx: AuthContext) {
  const pessoa = await tx.user.findFirst({ where: { id: ctx.userId, tenantId: ctx.tenantId, active: true }, select: { name: true } });
  if (!pessoa) throw new ErroTechInterno("Sessão indisponível. Entre novamente.", "forbidden");
  return { authorId: ctx.userId, authorName: pessoa.name };
}
function erroDaOperacao(e: unknown): FalhaTech {
  if (e instanceof ErroTechInterno) return { error: e.message, code: e.code };
  if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2034") return conflito();
  if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") return { error: "Já existe um sistema com esse nome.", code: "conflict" };
  // Não inclui dados livres, parâmetros ou credenciais no diagnóstico.
  console.error("[tech-interno] Falha na operação", e instanceof Prisma.PrismaClientKnownRequestError ? e.code : "indisponivel");
  return { error: "Não foi possível confirmar a operação. Atualize a página para conferir o que foi salvo antes de tentar novamente.", code: "internal_error" };
}

// A trilha de Auditoria do Connect recebe cada ação, além do histórico do item
// (26/10/2026). Fora da transação: o registro é best-effort e não desfaz a ação.
export function metadadosDoAtor(ctx: AtorTech): Record<string, string> {
  return ctx.via ? { via: "token pessoal", token: ctx.via.tokenName } : {};
}
function registrar(ctx: AtorTech, action: string, id: string, metadata: Record<string, string | number | null>) {
  return logAudit({ tenantId: ctx.tenantId, userId: ctx.userId, action, entityType: "TechInternalItem", entityId: id, metadata: { ...metadata, ...metadadosDoAtor(ctx) } });
}

export async function opcoesTech(ctx: AuthContext) {
  await conferirAcesso(ctx, "ver");
  const db = getPrisma(), tenantId = ctx.tenantId, ordem = [{ isActive: "desc" as const }, { name: "asc" as const }];
  const [robos, sites, apps, anteriores, users] = await Promise.all([
    db.opsWatcher.findMany({ where: { tenantId }, select: { slug: true, name: true, isActive: true }, orderBy: ordem }),
    db.opsSite.findMany({ where: { tenantId }, select: { id: true, name: true, isActive: true }, orderBy: ordem }),
    db.opsApp.findMany({ where: { tenantId }, select: { id: true, name: true, isActive: true }, orderBy: ordem }),
    // Do cadastro anterior, só os que ainda têm itens: o filtro e o item já vinculado.
    db.techInternalTool.findMany({ where: { tenantId, items: { some: {} } }, select: { id: true, name: true, active: true }, orderBy: { name: "asc" } }),
    db.user.findMany({ where: { tenantId: ctx.tenantId, active: true, role: { not: "READONLY" }, OR: [{ role: { in: ["ADMIN", "SUPER_ADMIN"] } }, { sectors: { some: { sectorCode: "tech" } } }] }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
  ]);
  const sistemas: SistemaTech[] = [
    ...robos.map(r => ({ chave: `robo:${r.slug}`, nome: r.name, origem: "robo" as const, ativo: r.isActive })),
    ...sites.map(s => ({ chave: `site:${s.id}`, nome: s.name, origem: "site" as const, ativo: s.isActive })),
    ...apps.map(a => ({ chave: `app:${a.id}`, nome: a.name, origem: "app" as const, ativo: a.isActive })),
    ...anteriores.map(t => ({ chave: `tool:${t.id}`, nome: t.name, origem: "tool" as const, ativo: false })),
  ];
  // As entregas recentes, para o "Veio de" do bug (04/11/2026).
  const entregas = await db.techInternalItem.findMany({
    where: { tenantId, status: "DONE" }, select: { id: true, title: true }, orderBy: { updatedAt: "desc" }, take: 200,
  });
  return { sistemas, users, entregas };
}

export function whereDosItens(tenantId: string, userId: string, filtros: Filtros): Prisma.TechInternalItemWhereInput {
  return {
    tenantId,
    // No Kanban, sem filtro, todas as situações: as colunas Concluído e Cancelado
    // ficavam sempre vazias e o cartão sumia ao ser movido para lá (26/10/2026).
    status: filtros.status === "ALL" || (!filtros.status && filtros.view === "kanban") ? undefined : filtros.status ? filtros.status as keyof typeof SITUACOES : { in: [...EM_ABERTO] },
    ...(filtros.type ? { type: filtros.type } : {}),
    ...(filtros.priority ? { priority: Number(filtros.priority) } : {}),
    // Um endereço salvo antes de 29/10/2026 traz só o id do cadastro anterior.
    ...(filtros.system ? filtros.system === "NONE" || filtros.system === "NEW" ? { systemMode: filtros.system } : { systemMode: "EXISTING", ...vinculoDoSistema(filtros.system) ?? { ...SEM_VINCULO, toolId: filtros.system } } : {}),
    ...(filtros.assignee ? { assigneeId: filtros.assignee === "me" ? userId : filtros.assignee === "none" ? null : filtros.assignee } : {}),
    ...(filtros.overdue ? { dueDate: { lt: new Date(hojeEmSaoPaulo()) }, AND: { status: { in: [...EM_ABERTO] } } } : {}),
    ...(filtros.q ? { OR: [{ title: { contains: filtros.q } }, { description: { contains: filtros.q } }] } : {}),
  };
}
export async function listarItens(ctx: AuthContext, filtros: Filtros) {
  await conferirAcesso(ctx, "ver");
  const db = getPrisma(), base = whereDosItens(ctx.tenantId, ctx.userId, filtros);
  const mes = intervaloMes(filtros.month);
  const where: Prisma.TechInternalItemWhereInput = filtros.view === "agenda"
    ? { AND: [base, { OR: [{ dueDate: null }, { dueDate: { gte: mes.inicio, lt: mes.fim } }] }] } : base;
  // Uma mesma fotografia para contagem e página, inclusive com gravações simultâneas.
  return db.$transaction(async tx => {
    const total = await tx.techInternalItem.count({ where });
    const tamanho = filtros.view === "lista" ? TAMANHO_PAGINA : 500;
    const pages = Math.max(1, Math.ceil(total / tamanho)), page = Math.min(filtros.page, pages);
    const items = await tx.techInternalItem.findMany({ where, include: incluir, take: tamanho, skip: (page - 1) * tamanho,
      orderBy: [{ priority: "desc" }, { dueDate: { sort: "asc", nulls: "last" } }, { updatedAt: "desc" }, { id: "asc" }] });
    return { total, pages, page, items };
  }, { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead });
}

/**
 * Muda a situação. `entrega` (06/11/2026): o PR e o commit, informados ao
 * concluir — só os campos enviados mudam; os outros ficam como estão.
 */
export async function mudarSituacaoItem(ctx: AtorTech, id: string, raw: unknown, versao: unknown, entrega?: unknown): Promise<ResultadoTech> {
  try {
    await conferirAcesso(ctx, "agir");
    const parsed = itemSchema.shape.status.safeParse(raw), version = versaoSchema.safeParse(versao);
    if (!parsed.success) return { error: "Situação inválida.", code: "validation_error" };
    const doCodigo = entregaSchema.partial().safeParse(entrega ?? {});
    if (!doCodigo.success) return { error: doCodigo.error.issues[0].message, code: "validation_error" };
    const codigo = Object.fromEntries(Object.entries(doCodigo.data).filter(([, v]) => v !== undefined)) as { prUrl?: string | null; commitSha?: string | null };
    if (!version.success || versao === null || versao === undefined || versao === "") return conflito();
    const result = await getPrisma().$transaction(async tx => {
      const item = await tx.techInternalItem.findFirst({ where: { id, tenantId: ctx.tenantId } });
      if (!item) throw new ErroTechInterno("Item não encontrado.", "not_found");
      if (item.version !== version.data) throw new ErroTechInterno(CONFLITO, "conflict");
      const changes = [
        ...(item.status !== parsed.data ? [{ field: "Situação", before: SITUACOES[item.status], after: SITUACOES[parsed.data] }] : []),
        ...("prUrl" in codigo && codigo.prUrl !== item.prUrl ? [{ field: "PR", before: item.prUrl, after: codigo.prUrl ?? null }] : []),
        ...("commitSha" in codigo && codigo.commitSha !== item.commitSha ? [{ field: "Commit", before: item.commitSha, after: codigo.commitSha ?? null }] : []),
      ];
      if (!changes.length) return null;
      const atualizado = await tx.techInternalItem.updateMany({ where: { id, tenantId: ctx.tenantId, version: version.data }, data: { status: parsed.data, ...codigo, version: { increment: 1 } } });
      if (atualizado.count !== 1) throw new ErroTechInterno(CONFLITO, "conflict");
      await tx.techInternalChange.create({ data: { tenantId: ctx.tenantId, itemId: id, version: version.data + 1, changes, ...await autor(tx, ctx) } });
      return { title: item.title, antes: SITUACOES[item.status], depois: SITUACOES[parsed.data] };
    });
    if (result) await registrar(ctx, "tech_interno.item.status", id, result);
    return { ok: true, id };
  } catch (e) { return erroDaOperacao(e); }
}
export async function detalheItem(ctx: AuthContext, id: string) {
  await conferirAcesso(ctx, "ver");
  return getPrisma().techInternalItem.findFirst({ where: { id, tenantId: ctx.tenantId }, include: {
    ...incluir, comments: { orderBy: [{ createdAt: "desc" }, { id: "desc" }] }, changes: { orderBy: { version: "desc" } }, attachments: { orderBy: [{ createdAt: "desc" }, { id: "desc" }] },
  } });
}

function valoresLegiveis(item: ItemCompleto): Record<string, string | null> {
  return {
    "Título": item.title, "Descrição": item.description, "Tipo": TIPOS[item.type],
    "Prioridade": PRIORIDADES[item.priority], "Situação": SITUACOES[item.status],
    "Sistema": nomeDoSistema(item),
    "Responsável": item.assignee?.name ?? null, "Prazo": item.dueDate?.toISOString().slice(0, 10) ?? null,
    "Tamanho": item.size ? TAMANHOS[item.size] : null, "Veio de": item.originItem?.title ?? null,
    "PR": item.prUrl, "Commit": item.commitSha,
  };
}
async function conferirVinculos(tx: Tx, ctx: AuthContext, dados: DadosItem, anterior: ItemCompleto | null) {
  // Um vínculo que já estava no item continua, mesmo inativo ou do cadastro anterior.
  const vinculo = vinculoDoSistema(dados.systemKey);
  if (vinculo && dados.systemKey !== (anterior && chaveDoSistema(anterior))) {
    const where = { tenantId: ctx.tenantId, isActive: true };
    const existe = vinculo.opsWatcherSlug ? await tx.opsWatcher.count({ where: { ...where, slug: vinculo.opsWatcherSlug } })
      : vinculo.opsSiteId ? await tx.opsSite.count({ where: { ...where, id: vinculo.opsSiteId } })
      : vinculo.opsAppId ? await tx.opsApp.count({ where: { ...where, id: vinculo.opsAppId } }) : 0;
    if (!existe) throw new ErroTechInterno("Escolha um sistema ativo do Orquestrador.");
  }
  if (dados.assigneeId && dados.assigneeId !== anterior?.assigneeId) {
    const pessoa = await tx.user.findFirst({ where: {
      id: dados.assigneeId, tenantId: ctx.tenantId, active: true, role: { not: "READONLY" },
      OR: [{ role: { in: ["ADMIN", "SUPER_ADMIN"] } }, { sectors: { some: { sectorCode: "tech" } } }],
    } });
    if (!pessoa) throw new ErroTechInterno("Escolha um responsável ativo do Tech ou um administrador deste escritório.");
  }
}

export async function salvarItem(ctx: AtorTech, raw: unknown, id?: string, versao?: unknown): Promise<ResultadoTech> {
  try {
    await conferirAcesso(ctx, "agir");
    const parsed = itemSchema.safeParse(raw);
    if (!parsed.success) return { error: parsed.error.issues[0].message, code: "validation_error" };
    const version = id ? versaoSchema.safeParse(versao) : null;
    if (id && (!version?.success || versao === null || versao === undefined || versao === "")) return conflito();
    const dados = parsed.data, { systemKey, ...campos } = dados;
    const result = await getPrisma().$transaction(async tx => {
      const anterior = id ? await tx.techInternalItem.findFirst({ where: { id, tenantId: ctx.tenantId }, include: incluir }) : null;
      if (id && !anterior) throw new ErroTechInterno("Item não encontrado.", "not_found");
      if (anterior && anterior.version !== (version?.success ? version.data : -1)) throw new ErroTechInterno(CONFLITO, "conflict");
      await conferirVinculos(tx, ctx, dados, anterior);
      // O tamanho (04/11/2026): só quem coordena a Tech define, e trava quando
      // o item sai de Pendente.
      if (dados.size !== (anterior?.size ?? null)) {
        if (!(await podeNoModulo(ctx, MODULO_TECH_INTERNO, "gerir"))) throw new ErroTechInterno("Só quem coordena a Tech define o tamanho do item.", "forbidden");
        if (anterior && anterior.status !== "PENDING") throw new ErroTechInterno("O tamanho trava quando o item começa: ele já saiu de Pendente.");
      }
      // "Veio de": uma entrega concluída deste escritório, que não é o próprio item.
      if (dados.originItemId && dados.originItemId !== (anterior?.originItemId ?? null)) {
        if (dados.originItemId === anterior?.id) throw new ErroTechInterno("Um item não vem dele mesmo.");
        const origem = await tx.techInternalItem.count({ where: { id: dados.originItemId, tenantId: ctx.tenantId, status: "DONE" } });
        if (!origem) throw new ErroTechInterno("Escolha uma entrega concluída em \"Veio de\".");
      }
      const data = { ...campos, ...vinculoDoSistema(systemKey) ?? SEM_VINCULO, dueDate: dados.dueDate ? new Date(dados.dueDate) : null };
      let item: ItemCompleto;
      if (anterior) {
        const atualizado = await tx.techInternalItem.updateMany({ where: { id: anterior.id, tenantId: ctx.tenantId, version: anterior.version }, data: { ...data, version: { increment: 1 } } });
        if (atualizado.count !== 1) throw new ErroTechInterno(CONFLITO, "conflict");
        item = await tx.techInternalItem.findUniqueOrThrow({ where: { id: anterior.id }, include: incluir });
      } else {
        item = await tx.techInternalItem.create({ data: { ...data, tenantId: ctx.tenantId }, include: incluir });
      }
      const changes = diferencas(anterior ? valoresLegiveis(anterior) : null, valoresLegiveis(item));
      // Uma mudança de vínculo com o mesmo nome continua sendo mudança real.
      for (const [field, before, after] of [
        ["Vínculo do sistema", anterior && chaveDoSistema(anterior), chaveDoSistema(item)],
        ["Vínculo do responsável", anterior?.assigneeId ?? null, item.assigneeId],
      ] as const) {
        const nome = field === "Vínculo do sistema" ? "Sistema" : "Responsável";
        if (anterior && before !== after && !changes.some(c => c.field === nome)) changes.push({ field, before, after });
      }
      if (changes.length || !anterior) await tx.techInternalChange.create({ data: {
        tenantId: ctx.tenantId, itemId: item.id, version: item.version, changes, ...await autor(tx, ctx),
      } });
      return { ok: true as const, id: item.id, title: item.title, campos: changes.map(c => c.field).join(", ") };
    });
    if (!id || result.campos) await registrar(ctx, id ? "tech_interno.item.update" : "tech_interno.item.create", result.id, { title: result.title, ...(id ? { campos: result.campos } : {}) });
    return { ok: true, id: result.id };
  } catch (e) { return erroDaOperacao(e); }
}

export async function comentarItem(ctx: AtorTech, id: string, body: unknown): Promise<{ ok: true; id: string; commentId: string } | FalhaTech> {
  try {
    await conferirAcesso(ctx, "agir");
    const parsed = comentarioSchema.safeParse(body);
    if (!parsed.success) return { error: parsed.error.issues[0].message, code: "validation_error" };
    return await getPrisma().$transaction(async tx => {
      const item = await tx.techInternalItem.findFirst({ where: { id, tenantId: ctx.tenantId }, select: { title: true } });
      if (!item) throw new ErroTechInterno("Item não encontrado.", "not_found");
      const comentario = await tx.techInternalComment.create({ data: { tenantId: ctx.tenantId, itemId: id, body: parsed.data, ...await autor(tx, ctx) }, select: { id: true } });
      return { title: item.title, commentId: comentario.id };
    }).then(async r => { await registrar(ctx, "tech_interno.item.comment", id, { title: r.title }); return { ok: true as const, id, commentId: r.commentId }; });
  } catch (e) { return erroDaOperacao(e); }
}

// O histórico do Controle interno inteiro (29/10/2026): toda alteração de item encerrado,
// de qualquer pessoa, da mais recente para a mais antiga. Filtra pelo título do
// item e por quem fez; a lista de pessoas é a de quem já tem registro.
export async function historicoTech(ctx: AuthContext, filtros: { pagina: number; q?: string; autor?: string }) {
  await conferirAcesso(ctx, "ver");
  const where: Prisma.TechInternalChangeWhereInput = {
    tenantId: ctx.tenantId,
    ...(filtros.autor ? { authorId: filtros.autor } : {}),
    // Só os itens encerrados — Concluído ou Cancelado (06/11/2026): o que está
    // em aberto fica na Lista e no Kanban.
    item: { status: { in: ["DONE", "CANCELED"] }, ...(filtros.q ? { title: { contains: filtros.q } } : {}) },
  };
  return getPrisma().$transaction(async tx => {
    const total = await tx.techInternalChange.count({ where });
    const pages = Math.max(1, Math.ceil(total / TAMANHO_PAGINA)), page = Math.min(filtros.pagina, pages);
    const [changes, autores] = await Promise.all([
      tx.techInternalChange.findMany({ where, include: { item: { include: incluir } }, take: TAMANHO_PAGINA, skip: (page - 1) * TAMANHO_PAGINA,
        orderBy: [{ createdAt: "desc" }, { version: "desc" }, { id: "asc" }] }),
      tx.techInternalChange.findMany({ where: { tenantId: ctx.tenantId }, distinct: ["authorId"], select: { authorId: true, authorName: true }, orderBy: { authorName: "asc" } }),
    ]);
    return { total, pages, page, changes, autores };
  }, { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead });
}

/**
 * O resumo do período (06/11/2026): concluídos, em andamento, planejados e
 * cancelados no dia, na semana, no mês ou no ano que contém `dataIso`. A
 * regra é `montarResumo` (`resumo.ts`); aqui só a busca, com o mesmo acesso de
 * ver da lista. Lê os itens mexidos no período, os em andamento e os pendentes
 * que entraram ou vencem nele, e o histórico de "Situação" de cada um.
 */
export async function resumoTech(ctx: AuthContext, periodo: PeriodoDoResumo, dataIso: string) {
  await conferirAcesso(ctx, "ver");
  const intervalo = intervaloDoResumo(periodo, dataIso);
  const db = getPrisma(), tenantId = ctx.tenantId;
  const mexidos = await db.techInternalChange.findMany({
    where: { tenantId, createdAt: { gte: intervalo.inicio, lt: intervalo.fim } }, distinct: ["itemId"], select: { itemId: true }, take: 5000,
  });
  const itens = await db.techInternalItem.findMany({
    where: { tenantId, OR: [
      { id: { in: mexidos.map(m => m.itemId) } },
      { status: { in: ["IN_PROGRESS", "VALIDATION"] } },
      { status: "PENDING", OR: [
        { createdAt: { gte: intervalo.inicio, lt: intervalo.fim } },
        { dueDate: { gte: new Date(`${intervalo.primeiroDia}T00:00:00Z`), lte: new Date(`${intervalo.ultimoDia}T00:00:00Z`) } },
      ] },
    ] },
    include: incluir, take: 5000,
  });
  const mudancas = itens.length ? await db.techInternalChange.findMany({
    where: { tenantId, itemId: { in: itens.map(i => i.id) } }, select: { itemId: true, createdAt: true, changes: true },
  }) : [];
  const resumo = montarResumo(
    itens.map(i => ({
      id: i.id, title: i.title, type: i.type, status: i.status, priority: i.priority, systemName: nomeDoSistema(i),
      assigneeName: i.assignee?.name ?? null, dueDate: i.dueDate?.toISOString().slice(0, 10) ?? null, prUrl: i.prUrl, createdAt: i.createdAt,
    })),
    mudancas.map(m => ({ itemId: m.itemId, createdAt: m.createdAt, changes: (Array.isArray(m.changes) ? m.changes : []) as unknown as Alteracao[] })),
    intervalo,
  );
  return { periodo, ...intervalo, ...resumo };
}
