import { Prisma } from "@/generated/prisma/client";
import { getPrisma } from "@/lib/prisma";
import { getAuthContext, type AuthContext } from "@/lib/auth/context";
import { podeNoModulo, type NivelNoModulo } from "@/lib/auth/modulo";
import { logAudit } from "@/lib/audit";
import { intervaloMes } from "./agenda";
import {
  MODULO_TECH_INTERNO, TAMANHO_PAGINA, TIPOS, SITUACOES, PRIORIDADES, EM_ABERTO,
  CONFLITO, SEM_VINCULO, itemSchema, comentarioSchema, versaoSchema, hojeEmSaoPaulo, diferencas,
  vinculoDoSistema, chaveDoSistema, nomeDoSistema, type DadosItem, type Filtros, type SistemaTech,
} from "./regras";

export class ErroTechInterno extends Error {}
type Tx = Prisma.TransactionClient;
export type ResultadoTech = { ok: true; id: string } | { error: string };
const doOps = { select: { name: true, isActive: true } } as const;
const incluir = { tool: { select: { name: true, active: true } }, opsWatcher: doOps, opsSite: doOps, opsApp: doOps, assignee: { select: { name: true, active: true } } } as const;
type ItemCompleto = Prisma.TechInternalItemGetPayload<{ include: typeof incluir }>;

async function conferirAcesso(ctx: AuthContext, nivel: NivelNoModulo) {
  if (!ctx.userId || !ctx.tenantId || !await podeNoModulo(ctx, MODULO_TECH_INTERNO, nivel)) {
    throw new ErroTechInterno("Controle interno indisponível para este acesso.");
  }
}
async function autor(tx: Tx, ctx: AuthContext) {
  const pessoa = await tx.user.findFirst({ where: { id: ctx.userId, tenantId: ctx.tenantId, active: true }, select: { name: true } });
  if (!pessoa) throw new ErroTechInterno("Sessão indisponível. Entre novamente.");
  return { authorId: ctx.userId, authorName: pessoa.name };
}
function erroDaOperacao(e: unknown): { error: string } {
  if (e instanceof ErroTechInterno) return { error: e.message };
  if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2034") return { error: CONFLITO };
  if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") return { error: "Já existe um sistema com esse nome." };
  // Não inclui dados livres, parâmetros ou credenciais no diagnóstico.
  console.error("[tech-interno] Falha na operação", e instanceof Prisma.PrismaClientKnownRequestError ? e.code : "indisponivel");
  return { error: "Não foi possível confirmar a operação. Atualize a página para conferir o que foi salvo antes de tentar novamente." };
}

// A trilha de Auditoria do Connect recebe cada ação, além do histórico do item
// (26/10/2026). Fora da transação: o registro é best-effort e não desfaz a ação.
function registrar(ctx: AuthContext, action: string, id: string, metadata: Record<string, string | number | null>) {
  return logAudit({ tenantId: ctx.tenantId, userId: ctx.userId, action, entityType: "TechInternalItem", entityId: id, metadata });
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
  return { sistemas, users };
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

export async function mudarSituacaoItem(id: string, raw: unknown, versao: unknown): Promise<ResultadoTech> {
  try {
    const ctx = await getAuthContext(); await conferirAcesso(ctx, "agir");
    const parsed = itemSchema.shape.status.safeParse(raw), version = versaoSchema.safeParse(versao);
    if (!parsed.success || !version.success || versao === null || versao === undefined || versao === "") return { error: CONFLITO };
    const result = await getPrisma().$transaction(async tx => {
      const item = await tx.techInternalItem.findFirst({ where: { id, tenantId: ctx.tenantId } });
      if (!item || item.version !== version.data) throw new ErroTechInterno(CONFLITO);
      if (item.status === parsed.data) return null;
      const atualizado = await tx.techInternalItem.updateMany({ where: { id, tenantId: ctx.tenantId, version: version.data }, data: { status: parsed.data, version: { increment: 1 } } });
      if (atualizado.count !== 1) throw new ErroTechInterno(CONFLITO);
      await tx.techInternalChange.create({ data: { tenantId: ctx.tenantId, itemId: id, version: version.data + 1, changes: [{ field: "Situação", before: SITUACOES[item.status], after: SITUACOES[parsed.data] }], ...await autor(tx, ctx) } });
      return { title: item.title, antes: SITUACOES[item.status], depois: SITUACOES[parsed.data] };
    });
    if (result) await registrar(ctx, "tech_interno.item.status", id, result);
    return { ok: true, id };
  } catch (e) { return erroDaOperacao(e); }
}
export async function detalheItem(ctx: AuthContext, id: string) {
  await conferirAcesso(ctx, "ver");
  return getPrisma().techInternalItem.findFirst({ where: { id, tenantId: ctx.tenantId }, include: {
    ...incluir, comments: { orderBy: [{ createdAt: "desc" }, { id: "desc" }] }, changes: { orderBy: { version: "desc" } },
  } });
}

function valoresLegiveis(item: ItemCompleto): Record<string, string | null> {
  return {
    "Título": item.title, "Descrição": item.description, "Tipo": TIPOS[item.type],
    "Prioridade": PRIORIDADES[item.priority], "Situação": SITUACOES[item.status],
    "Sistema": nomeDoSistema(item),
    "Responsável": item.assignee?.name ?? null, "Prazo": item.dueDate?.toISOString().slice(0, 10) ?? null,
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
    if (!existe) throw new ErroTechInterno("Escolha um sistema ativo do Ops Center.");
  }
  if (dados.assigneeId && dados.assigneeId !== anterior?.assigneeId) {
    const pessoa = await tx.user.findFirst({ where: {
      id: dados.assigneeId, tenantId: ctx.tenantId, active: true, role: { not: "READONLY" },
      OR: [{ role: { in: ["ADMIN", "SUPER_ADMIN"] } }, { sectors: { some: { sectorCode: "tech" } } }],
    } });
    if (!pessoa) throw new ErroTechInterno("Escolha um responsável ativo do Tech ou um administrador deste escritório.");
  }
}

export async function salvarItem(raw: unknown, id?: string, versao?: unknown): Promise<ResultadoTech> {
  try {
    const ctx = await getAuthContext(); await conferirAcesso(ctx, "agir");
    const parsed = itemSchema.safeParse(raw);
    if (!parsed.success) return { error: parsed.error.issues[0].message };
    const version = id ? versaoSchema.safeParse(versao) : null;
    if (id && (!version?.success || versao === null || versao === undefined || versao === "")) return { error: CONFLITO };
    const dados = parsed.data, { systemKey, ...campos } = dados;
    const result = await getPrisma().$transaction(async tx => {
      const anterior = id ? await tx.techInternalItem.findFirst({ where: { id, tenantId: ctx.tenantId }, include: incluir }) : null;
      if (id && !anterior) throw new ErroTechInterno("Item não encontrado.");
      if (anterior && anterior.version !== (version?.success ? version.data : -1)) throw new ErroTechInterno(CONFLITO);
      await conferirVinculos(tx, ctx, dados, anterior);
      const data = { ...campos, ...vinculoDoSistema(systemKey) ?? SEM_VINCULO, dueDate: dados.dueDate ? new Date(dados.dueDate) : null };
      let item: ItemCompleto;
      if (anterior) {
        const atualizado = await tx.techInternalItem.updateMany({ where: { id: anterior.id, tenantId: ctx.tenantId, version: anterior.version }, data: { ...data, version: { increment: 1 } } });
        if (atualizado.count !== 1) throw new ErroTechInterno(CONFLITO);
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

export async function comentarItem(id: string, body: unknown): Promise<ResultadoTech> {
  try {
    const ctx = await getAuthContext(); await conferirAcesso(ctx, "agir");
    const parsed = comentarioSchema.safeParse(body);
    if (!parsed.success) return { error: parsed.error.issues[0].message };
    return await getPrisma().$transaction(async tx => {
      const item = await tx.techInternalItem.findFirst({ where: { id, tenantId: ctx.tenantId }, select: { title: true } });
      if (!item) throw new ErroTechInterno("Item não encontrado.");
      await tx.techInternalComment.create({ data: { tenantId: ctx.tenantId, itemId: id, body: parsed.data, ...await autor(tx, ctx) } });
      return item;
    }).then(async item => { await registrar(ctx, "tech_interno.item.comment", id, { title: item.title }); return { ok: true as const, id }; });
  } catch (e) { return erroDaOperacao(e); }
}

// O histórico do Controle interno inteiro (29/10/2026): toda alteração de item,
// de qualquer pessoa, da mais recente para a mais antiga. Filtra pelo título do
// item e por quem fez; a lista de pessoas é a de quem já tem registro.
export async function historicoTech(ctx: AuthContext, filtros: { pagina: number; q?: string; autor?: string }) {
  await conferirAcesso(ctx, "ver");
  const where: Prisma.TechInternalChangeWhereInput = {
    tenantId: ctx.tenantId,
    ...(filtros.autor ? { authorId: filtros.autor } : {}),
    ...(filtros.q ? { item: { title: { contains: filtros.q } } } : {}),
  };
  return getPrisma().$transaction(async tx => {
    const total = await tx.techInternalChange.count({ where });
    const pages = Math.max(1, Math.ceil(total / TAMANHO_PAGINA)), page = Math.min(filtros.pagina, pages);
    const [changes, autores] = await Promise.all([
      tx.techInternalChange.findMany({ where, include: { item: { select: { title: true, type: true, status: true } } }, take: TAMANHO_PAGINA, skip: (page - 1) * TAMANHO_PAGINA,
        orderBy: [{ createdAt: "desc" }, { version: "desc" }, { id: "asc" }] }),
      tx.techInternalChange.findMany({ where: { tenantId: ctx.tenantId }, distinct: ["authorId"], select: { authorId: true, authorName: true }, orderBy: { authorName: "asc" } }),
    ]);
    return { total, pages, page, changes, autores };
  }, { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead });
}
