import { Prisma } from "@/generated/prisma/client";
import { getPrisma } from "@/lib/prisma";
import { getAuthContext, type AuthContext } from "@/lib/auth/context";
import { podeNoModulo, type NivelNoModulo } from "@/lib/auth/modulo";
import {
  MODULO_TECH_INTERNO, TAMANHO_PAGINA, TIPOS, SITUACOES, PRIORIDADES, EM_ABERTO,
  CONFLITO, itemSchema, sistemaSchema, comentarioSchema, versaoSchema, hojeEmSaoPaulo, diferencas,
  type DadosItem, type Filtros,
} from "./regras";

export class ErroTechInterno extends Error {}
type Tx = Prisma.TransactionClient;
export type ResultadoTech = { ok: true; id: string } | { error: string };
const incluir = { tool: { select: { name: true, active: true } }, assignee: { select: { name: true, active: true } } } as const;
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

export async function opcoesTech(ctx: AuthContext) {
  await conferirAcesso(ctx, "ver");
  const db = getPrisma();
  const [tools, users] = await Promise.all([
    db.techInternalTool.findMany({ where: { tenantId: ctx.tenantId }, orderBy: [{ active: "desc" }, { name: "asc" }], select: { id: true, name: true, active: true, version: true } }),
    db.user.findMany({ where: { tenantId: ctx.tenantId, active: true, role: { not: "READONLY" }, OR: [{ role: { in: ["ADMIN", "SUPER_ADMIN"] } }, { sectors: { some: { sectorCode: "tech" } } }] }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
  ]);
  return { tools, users };
}

export function whereDosItens(tenantId: string, userId: string, filtros: Filtros): Prisma.TechInternalItemWhereInput {
  return {
    tenantId,
    status: filtros.status === "ALL" ? undefined : filtros.status ? filtros.status as keyof typeof SITUACOES : { in: [...EM_ABERTO] },
    ...(filtros.type ? { type: filtros.type } : {}),
    ...(filtros.priority ? { priority: Number(filtros.priority) } : {}),
    ...(filtros.system ? filtros.system === "NONE" || filtros.system === "NEW" ? { systemMode: filtros.system } : { systemMode: "EXISTING", toolId: filtros.system } : {}),
    ...(filtros.assignee ? { assigneeId: filtros.assignee === "me" ? userId : filtros.assignee === "none" ? null : filtros.assignee } : {}),
    ...(filtros.overdue ? { dueDate: { lt: new Date(hojeEmSaoPaulo()) }, AND: { status: { in: [...EM_ABERTO] } } } : {}),
    ...(filtros.q ? { OR: [{ title: { contains: filtros.q } }, { description: { contains: filtros.q } }] } : {}),
  };
}
export async function listarItens(ctx: AuthContext, filtros: Filtros) {
  await conferirAcesso(ctx, "ver");
  const db = getPrisma(), where = whereDosItens(ctx.tenantId, ctx.userId, filtros);
  // Uma mesma fotografia para contagem e página, inclusive com gravações simultâneas.
  return db.$transaction(async tx => {
    const total = await tx.techInternalItem.count({ where });
    const pages = Math.max(1, Math.ceil(total / TAMANHO_PAGINA)), page = Math.min(filtros.page, pages);
    const items = await tx.techInternalItem.findMany({ where, include: incluir, take: TAMANHO_PAGINA, skip: (page - 1) * TAMANHO_PAGINA,
      orderBy: [{ priority: "desc" }, { dueDate: { sort: "asc", nulls: "last" } }, { updatedAt: "desc" }, { id: "asc" }] });
    return { total, pages, page, items };
  }, { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead });
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
    "Sistema": item.systemMode === "NEW" ? "Novo sistema" : item.systemMode === "NONE" ? "Sem sistema" : item.tool?.name ?? "Sistema indisponível",
    "Responsável": item.assignee?.name ?? null, "Prazo": item.dueDate?.toISOString().slice(0, 10) ?? null,
  };
}
async function conferirVinculos(tx: Tx, ctx: AuthContext, dados: DadosItem, anterior: ItemCompleto | null) {
  if (dados.toolId) {
    const tool = await tx.techInternalTool.findFirst({ where: { id: dados.toolId, tenantId: ctx.tenantId } });
    if (!tool || (!tool.active && dados.toolId !== anterior?.toolId)) throw new ErroTechInterno("Escolha um sistema ativo deste escritório.");
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
    const dados = parsed.data;
    const result = await getPrisma().$transaction(async tx => {
      const anterior = id ? await tx.techInternalItem.findFirst({ where: { id, tenantId: ctx.tenantId }, include: incluir }) : null;
      if (id && !anterior) throw new ErroTechInterno("Item não encontrado.");
      if (anterior && anterior.version !== (version?.success ? version.data : -1)) throw new ErroTechInterno(CONFLITO);
      await conferirVinculos(tx, ctx, dados, anterior);
      const data = { ...dados, dueDate: dados.dueDate ? new Date(dados.dueDate) : null };
      let item: ItemCompleto;
      if (anterior) {
        const atualizado = await tx.techInternalItem.updateMany({ where: { id: anterior.id, tenantId: ctx.tenantId, version: anterior.version }, data: { ...data, version: { increment: 1 } } });
        if (atualizado.count !== 1) throw new ErroTechInterno(CONFLITO);
        item = await tx.techInternalItem.findUniqueOrThrow({ where: { id: anterior.id }, include: incluir });
      } else {
        item = await tx.techInternalItem.create({ data: { ...data, tenantId: ctx.tenantId }, include: incluir });
      }
      const changes = diferencas(anterior ? valoresLegiveis(anterior) : null, valoresLegiveis(item));
      // Guarda a identidade, inclusive com nomes iguais, sem expor IDs na tela.
      for (const [field, beforeId, afterId] of [
        ["Sistema", anterior?.toolId ?? null, item.toolId],
        ["Responsável", anterior?.assigneeId ?? null, item.assigneeId],
      ] as const) {
        if (anterior && beforeId !== afterId) {
          const change = changes.find(c => c.field === field);
          if (change) { change.beforeId = beforeId; change.afterId = afterId; }
          else changes.push({ field, before: valoresLegiveis(anterior)[field], after: valoresLegiveis(item)[field], beforeId, afterId });
        }
      }
      if (changes.length || !anterior) await tx.techInternalChange.create({ data: {
        tenantId: ctx.tenantId, itemId: item.id, version: item.version, changes, ...await autor(tx, ctx),
      } });
      return { ok: true as const, id: item.id };
    });
    return result;
  } catch (e) { return erroDaOperacao(e); }
}

export async function comentarItem(id: string, body: unknown): Promise<ResultadoTech> {
  try {
    const ctx = await getAuthContext(); await conferirAcesso(ctx, "agir");
    const parsed = comentarioSchema.safeParse(body);
    if (!parsed.success) return { error: parsed.error.issues[0].message };
    return await getPrisma().$transaction(async tx => {
      if (!await tx.techInternalItem.findFirst({ where: { id, tenantId: ctx.tenantId }, select: { id: true } })) throw new ErroTechInterno("Item não encontrado.");
      await tx.techInternalComment.create({ data: { tenantId: ctx.tenantId, itemId: id, body: parsed.data, ...await autor(tx, ctx) } });
      return { ok: true as const, id };
    });
  } catch (e) { return erroDaOperacao(e); }
}

export async function salvarSistema(raw: unknown, id?: string, versao?: unknown): Promise<ResultadoTech> {
  try {
    const ctx = await getAuthContext(); await conferirAcesso(ctx, "gerir");
    const parsed = sistemaSchema.safeParse(raw);
    if (!parsed.success) return { error: parsed.error.issues[0].message };
    const version = id ? versaoSchema.safeParse(versao) : null;
    if (id && (!version?.success || versao === null || versao === undefined || versao === "")) return { error: CONFLITO };
    return await getPrisma().$transaction(async tx => {
      let toolId = id;
      if (id) {
        const anterior = await tx.techInternalTool.findFirst({ where: { id, tenantId: ctx.tenantId } });
        if (!anterior) throw new ErroTechInterno("Sistema não encontrado.");
        const r = await tx.techInternalTool.updateMany({ where: { id, tenantId: ctx.tenantId, version: version?.success ? version.data : -1 }, data: { ...parsed.data, version: { increment: 1 } } });
        if (r.count !== 1) throw new ErroTechInterno(CONFLITO);
      } else {
        toolId = (await tx.techInternalTool.create({ data: { tenantId: ctx.tenantId, ...parsed.data } })).id;
      }
      return { ok: true as const, id: toolId! };
    });
  } catch (e) { return erroDaOperacao(e); }
}
