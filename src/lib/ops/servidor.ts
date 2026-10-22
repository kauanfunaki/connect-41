import { createHash, randomBytes } from "node:crypto";
import { Prisma } from "@/generated/prisma/client";
import { getPrisma } from "@/lib/prisma";
import { getAuthContext, type AuthContext } from "@/lib/auth/context";
import { podeNoModulo, type NivelNoModulo } from "@/lib/auth/modulo";
import { isModuleEnabled, setoresDoModulo } from "@/lib/modules";
import { mensagemQueCabe } from "@/lib/notifications";
import { sendWebPushToUser } from "@/lib/webPush";
import { isSubscriptionReadOnly } from "@/lib/subscription-policy";
import { configDoHelpdesk } from "@/lib/chamados/contexto";
import { whereVisivel } from "@/lib/chamados/consultas";
import { MODULO_OPS, diaEmSaoPaulo, periodoDoDia, type FiltrosOps, eventoSchema } from "./regras";
import type { PainelOps } from "./tipos";

export class ErroOps extends Error {
  constructor(message: string, public status = 400) { super(message); }
}
export const hashToken = (token: string) => createHash("sha256").update(token).digest("hex");
export async function acessoOps(nivel: NivelNoModulo = "ver") {
  const ctx = await getAuthContext();
  if (!ctx.userId || !ctx.tenantId) throw new ErroOps("Entre novamente para continuar.", 401);
  if (!await podeNoModulo(ctx, MODULO_OPS, nivel)) throw new ErroOps("Ops Center indisponível para este acesso.", 403);
  return ctx;
}

// Nunca devolve tokenHash ao navegador; a chave aparece só ao ser gerada.
const camposWatcher = {
  ownerId: true, owner: { select: { name: true } },
  slug: true, name: true, description: true, client: true, folderInput: true, folderOutput: true,
  isActive: true, version: true, lastHeartbeatAt: true, instabilityReportedAt: true,
  instabilityReportedBy: true, instabilityNote: true, instabilityTicketId: true,
  tokenHash: true,
} satisfies Prisma.OpsWatcherSelect;

export async function painelOps(ctx: AuthContext, filtros: FiltrosOps): Promise<PainelOps> {
  const db = getPrisma(), tenantId = ctx.tenantId, pageSize = 50;
  const agora = new Date(), hoje = periodoDoDia(diaEmSaoPaulo(agora));
  const dono = filtros.mine ? { ownerId: ctx.userId } : {};
  const where: Prisma.OpsEventWhereInput = {
    tenantId, ...(filtros.watcher ? { watcherSlug: filtros.watcher } : {}),
    ...(filtros.mine ? { watcher: dono } : {}),
    ...(filtros.status ? { status: filtros.status } : {}),
    ...(filtros.date ? { processedAt: periodoDoDia(filtros.date) } : {}),
  };
  const [watchers, contagens, total] = await Promise.all([
    db.opsWatcher.findMany({ where: { tenantId, ...dono }, select: { ...camposWatcher,
      events: { orderBy: [{ processedAt: "desc" }, { id: "desc" }], take: 1 },
    }, orderBy: [{ isActive: "desc" }, { name: "asc" }] }),
    db.opsEvent.groupBy({ by: ["watcherSlug", "status"], where: { tenantId, processedAt: hoje, ...(filtros.mine ? { watcher: dono } : {}) }, _count: { _all: true } }),
    db.opsEvent.count({ where }),
  ]);
  const page = Math.min(filtros.page, Math.max(1, Math.ceil(total / pageSize)));
  const events = await db.opsEvent.findMany({ where, include: { watcher: { select: { name: true } } },
    orderBy: [{ processedAt: "desc" }, { id: "desc" }], take: pageSize, skip: (page - 1) * pageSize });
  const nomes = new Map(watchers.map(w => [w.slug, w.name]));
  const autores = [...new Set(watchers.flatMap(w => w.instabilityReportedBy ? [w.instabilityReportedBy] : []))];
  const usuarios = autores.length ? await db.user.findMany({ where: { tenantId, id: { in: autores } }, select: { id: true, name: true } }) : [];
  const nomesDeUsuarios = new Map(usuarios.map(u => [u.id, u.name]));
  const serializarEvento = (e: (typeof events)[number] | (typeof watchers)[number]["events"][number]) => ({
    id: e.id, watcherSlug: e.watcherSlug, watcherName: nomes.get(e.watcherSlug) ?? e.watcherSlug,
    filename: e.filename, filenameRenamed: e.filenameRenamed, status: e.status as "SUCCESS" | "ERROR" | "WARNING",
    errorMessage: e.errorMessage, client: e.client, processedAt: e.processedAt.toISOString(),
  });
  const counts = new Map<string, { total: number; success: number; error: number }>();
  const summary = { total: 0, success: 0, error: 0, warning: 0, successRate: null as number | null };
  for (const c of contagens) {
    const n = c._count._all, w = counts.get(c.watcherSlug) ?? { total: 0, success: 0, error: 0 };
    w.total += n; summary.total += n;
    if (c.status === "SUCCESS") { w.success += n; summary.success += n; }
    if (c.status === "ERROR") { w.error += n; summary.error += n; }
    if (c.status === "WARNING") summary.warning += n;
    counts.set(c.watcherSlug, w);
  }
  summary.successRate = summary.total ? Math.round(summary.success / summary.total * 1000) / 10 : null;
  return {
    summary, total, page, pageSize, serverTime: agora.toISOString(), events: events.map(serializarEvento),
    owners: await podeNoModulo(ctx, MODULO_OPS, "gerir") ? await responsaveisOps(ctx.tenantId) : [],
    watchers: watchers.map(w => ({
      ownerId: w.ownerId, ownerName: w.owner?.name ?? null,
      slug: w.slug, name: w.name, description: w.description, client: w.client, folderInput: w.folderInput, folderOutput: w.folderOutput,
      isActive: w.isActive, version: w.version, hasToken: !!w.tokenHash, lastHeartbeatAt: w.lastHeartbeatAt?.toISOString() ?? null,
      lastEvent: w.events[0] ? serializarEvento(w.events[0]) : null,
      totalToday: counts.get(w.slug)?.total ?? 0, successToday: counts.get(w.slug)?.success ?? 0, errorToday: counts.get(w.slug)?.error ?? 0,
      instabilityReportedAt: w.instabilityReportedAt?.toISOString() ?? null, instabilityNote: w.instabilityNote,
      instabilityReportedByName: w.instabilityReportedBy ? nomesDeUsuarios.get(w.instabilityReportedBy) ?? "Equipe Tech" : null,
      instabilityTicketId: w.instabilityTicketId,
    })),
  };
}

export type CredencialAutenticadaOps = { tenantId: string; slug: string | null; tokenHash: string; compartilhado: boolean; chaveId?: string };

export async function autenticarWatcher(request: Request, slug?: string): Promise<CredencialAutenticadaOps> {
  const token = request.headers.get("authorization")?.match(/^Bearer (ops_[a-f0-9]{64})$/)?.[1];
  if (!token) throw new ErroOps("Token da automação inválido.", 401);
  const db = getPrisma();
  const tokenHash = hashToken(token);
  const credencial = await db.opsApiCredential.findUnique({ where: { tokenHash },
    include: { tenant: { select: { active: true, subscription: { select: { status: true } } } } } });
  if (credencial) {
    if (!credencial.tenant.active || isSubscriptionReadOnly(credencial.tenant.subscription?.status) || !await isModuleEnabled(credencial.tenantId, MODULO_OPS)) {
      throw new ErroOps("Recebimento indisponível neste escritório.", 403);
    }
    if (slug) {
      const watcher = await db.opsWatcher.findUnique({ where: { tenantId_slug: { tenantId: credencial.tenantId, slug } }, select: { isActive: true } });
      if (!watcher?.isActive) throw new ErroOps("Token da automação inválido.", 401);
    }
    return { tenantId: credencial.tenantId, slug: slug ?? null, tokenHash, compartilhado: true };
  }
  const w = await db.opsWatcher.findUnique({ where: { tokenHash: hashToken(token) },
    include: { tenant: { select: { active: true, subscription: { select: { status: true } } } } } });
  if (w) {
    if (!w.isActive || (slug && w.slug !== slug)) throw new ErroOps("Token da automação inválido.", 401);
    if (!w.tenant.active || isSubscriptionReadOnly(w.tenant.subscription?.status) || !await isModuleEnabled(w.tenantId, MODULO_OPS)) {
      throw new ErroOps("Recebimento indisponível neste escritório.", 403);
    }
    return { tenantId: w.tenantId, slug: w.slug, tokenHash, compartilhado: false };
  }
  const key = await db.opsApiKey.findUnique({ where: { tokenHash },
    include: { tenant: { select: { active: true, subscription: { select: { status: true } } } } } });
  if (!key || key.revokedAt) throw new ErroOps("Token da automação inválido.", 401);
  if (!key.tenant.active || isSubscriptionReadOnly(key.tenant.subscription?.status) || !await isModuleEnabled(key.tenantId, MODULO_OPS)) {
    throw new ErroOps("Recebimento indisponível neste escritório.", 403);
  }
  if (slug) {
    const watcher = await db.opsWatcher.findUnique({ where: { tenantId_slug: { tenantId: key.tenantId, slug } }, select: { isActive: true } });
    if (!watcher?.isActive) throw new ErroOps("Token da automação inválido.", 401);
  }
  return { tenantId: key.tenantId, slug: slug ?? null, tokenHash, compartilhado: true, chaveId: key.id };
}

// A verificação e o recebimento usam a mesma transação e a mesma trava da revogação.
export async function conferirCredencialOps(tx: Prisma.TransactionClient, w: CredencialAutenticadaOps) {
  if (!w.compartilhado) return;
  if (w.chaveId) {
    await tx.$queryRaw`SELECT id FROM ops_api_keys WHERE id = ${w.chaveId} AND tenantId = ${w.tenantId} FOR UPDATE`;
    const key = await tx.opsApiKey.findFirst({ where: { id: w.chaveId, tenantId: w.tenantId, tokenHash: w.tokenHash, revokedAt: null }, select: { id: true } });
    if (!key) throw new ErroOps("Token revogado.", 401);
  } else {
    await tx.$queryRaw`SELECT tenantId FROM ops_api_credentials WHERE tenantId = ${w.tenantId} FOR UPDATE`;
    const credential = await tx.opsApiCredential.findUnique({ where: { tenantId: w.tenantId }, select: { tokenHash: true } });
    if (credential?.tokenHash !== w.tokenHash) throw new ErroOps("Token revogado.", 401);
  }
}

export function exigirAtualizacao(count: number) {
  if (count !== 1) throw new ErroOps("A automação mudou em outra aba. Atualize e tente novamente.", 409);
}

export async function gerarToken(ctx: AuthContext, slug: string, version: number, revogar = false) {
  const token = revogar ? null : `ops_${randomBytes(32).toString("hex")}`;
  const r = await getPrisma().opsWatcher.updateMany({ where: { tenantId: ctx.tenantId, slug, version },
    data: { tokenHash: token ? hashToken(token) : null, version: { increment: 1 }, lastHeartbeatAt: null } });
  exigirAtualizacao(r.count);
  return { token };
}

export async function gerarTokenCompartilhado(ctx: AuthContext, name = "Chave dos bots") {
  if (!ctx.tenantId) throw new ErroOps("Entre novamente para continuar.", 401);
  const token = `ops_${randomBytes(32).toString("hex")}`;
  const key = await getPrisma().opsApiKey.create({ data: { tenantId: ctx.tenantId, name, tokenHash: hashToken(token) },
    select: { id: true, name: true, createdAt: true } });
  return { token, key: { ...key, createdAt: key.createdAt.toISOString(), legacy: false } };
}

export async function revogarTokenCompartilhado(ctx: AuthContext, id: string, version?: number) {
  if (!ctx.tenantId) throw new ErroOps("Entre novamente para continuar.", 401);
  const db = getPrisma();
  if (id === "legacy") {
    if (version === undefined) throw new ErroOps("Atualize a lista antes de revogar a chave anterior.", 409);
    const result = await db.opsApiCredential.updateMany({ where: { tenantId: ctx.tenantId, version, tokenHash: { not: null } }, data: { tokenHash: null, version: { increment: 1 } } });
    if (result.count !== 1) throw new ErroOps("A chave mudou em outra aba. Atualize e tente novamente.", 409);
  } else {
    const result = await db.opsApiKey.updateMany({ where: { id, tenantId: ctx.tenantId, revokedAt: null }, data: { revokedAt: new Date() } });
    if (result.count !== 1) throw new ErroOps("Chave não encontrada ou já revogada. Atualize a lista.", 404);
  }
  return { ok: true };
}

export async function conferirChamado(ctx: AuthContext, ticketId: string) {
  const config = await configDoHelpdesk(ctx.tenantId);
  const chamado = await getPrisma().helpdeskTicket.findFirst({ where: { AND: [whereVisivel({ ctx, config }), { id: ticketId }] }, select: { id: true } });
  if (!chamado) throw new ErroOps("Chamado não encontrado ou indisponível para seu acesso.", 404);
}

export async function responsaveisOps(tenantId: string) {
  const setores = (await setoresDoModulo(tenantId, MODULO_OPS)) ?? ["tech"];
  return getPrisma().user.findMany({ where: { tenantId, active: true, OR: [
    { role: { in: ["ADMIN", "SUPER_ADMIN", "READONLY"] } }, { sectors: { some: { sectorCode: { in: setores } } } },
  ] }, select: { id: true, name: true }, orderBy: { name: "asc" } });
}

export async function conferirResponsavel(tenantId: string, ownerId: string | null) {
  if (ownerId && !(await responsaveisOps(tenantId)).some(u => u.id === ownerId)) {
    throw new ErroOps("Escolha um responsável ativo com acesso ao setor do Ops Center.");
  }
}

export async function receberEvento(w: CredencialAutenticadaOps, input: unknown) {
  const dados = eventoSchema.parse(input);
  if (w.slug && dados.watcherSlug !== w.slug) throw new ErroOps("O token pertence a outra automação.", 403);
  const db = getPrisma(), { eventId, watcherSlug, processedAt, ...campos } = dados;
  const payloadHash = hashToken(JSON.stringify(dados));
  const chave = { tenantId: w.tenantId, watcherSlug, eventId };
  try {
    const resultado = await db.$transaction(async tx => {
      // Serializa com troca do dono, desativação e revogação da chave usada.
      await tx.$queryRaw`SELECT slug FROM ops_watchers WHERE tenantId = ${w.tenantId} AND slug = ${watcherSlug} FOR UPDATE`;
      const atual = await tx.opsWatcher.findUnique({ where: { tenantId_slug: { tenantId: w.tenantId, slug: watcherSlug } } });
      await conferirCredencialOps(tx, w);
      if (!atual?.isActive || (!w.compartilhado && atual.tokenHash !== w.tokenHash)) throw new ErroOps("Token revogado.", 401);
      const evento = await tx.opsEvent.create({ data: { ...chave, ...campos, payloadHash, processedAt: processedAt ? new Date(processedAt) : new Date() } });
      const owner = atual.ownerId && campos.status === "ERROR" ? await tx.user.findFirst({ where: { tenantId: w.tenantId, id: atual.ownerId, active: true }, select: { id: true } }) : null;
      const message = `Erro na automação ${atual.name}. Confira o Ops Center.`;
      // Evento e aviso no sino são confirmados juntos. Retransmissões não criam outro aviso.
      if (owner) await tx.notification.create({ data: { tenantId: w.tenantId, userId: owner.id, type: "OPS_AUTOMACAO_ERRO", entityId: watcherSlug, message: mensagemQueCabe(message) } });
      return { id: evento.id, ownerId: owner?.id, message };
    });
    if (resultado.ownerId) {
      try {
        const oculto = await db.notificationHiddenType.findUnique({ where: { userId_tenantId_type: { tenantId: w.tenantId, userId: resultado.ownerId, type: "OPS_AUTOMACAO_ERRO" } } });
        if (!oculto) await sendWebPushToUser(w.tenantId, resultado.ownerId, { title: "Connect", body: resultado.message, url: `/ops?watcher=${encodeURIComponent(watcherSlug)}&status=ERROR` });
      } catch { console.warn("[ops] Aviso salvo no sino; push indisponível."); }
    }
    return { id: resultado.id, duplicate: false };
  } catch (err) {
    if (!(err instanceof Prisma.PrismaClientKnownRequestError) || err.code !== "P2002") throw err;
    const existente = await db.opsEvent.findUnique({ where: { tenantId_watcherSlug_eventId: chave } });
    if (!existente || existente.payloadHash !== payloadHash) throw new ErroOps("eventId já recebido com conteúdo diferente. Preserve o identificador apenas nas retransmissões da mesma tentativa.", 409);
    return { id: existente.id, duplicate: true };
  }
}
