import { ZodError } from "zod";
import { Prisma } from "@/generated/prisma/client";
import { getPrisma } from "@/lib/prisma";
import { logAudit } from "@/lib/audit";
import { acessoOps, ErroOps, autenticarWatcher, receberEvento, gerarToken, gerarTokenCompartilhado, conferirChamado, conferirResponsavel, exigirAtualizacao, painelOps, validarTokenCompartilhado } from "./servidor";
import { criarChaveOps, alterarChaveOps, nomeChaveSchema } from "./chaves";
import { editarWatcherSchema, filtrosSchema, instabilidadeSchema, slugSchema, versaoSchema, watcherSchema } from "./regras";

export async function responderOps(fn: () => Promise<unknown>, duplicado = "Já existe uma automação com esse identificador.") {
  try { return Response.json(await fn(), { headers: { "Cache-Control": "no-store" } }); }
  catch (err) {
    if (err instanceof ErroOps) return Response.json({ error: err.message }, { status: err.status });
    if (err instanceof ZodError) return Response.json({ error: "Confira os dados informados.", details: err.issues.map(i => ({ path: i.path, message: i.message })) }, { status: 400 });
    if (err instanceof SyntaxError) return Response.json({ error: "JSON inválido." }, { status: 400 });
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") return Response.json({ error: duplicado }, { status: 409 });
    console.error("[ops] Falha na operação", err instanceof Error ? err.name : "erro");
    return Response.json({ error: "Ops Center indisponível. Confira a conexão e a migração do módulo." }, { status: 503 });
  }
}

// Limite aplicado também quando o cliente envia o corpo sem Content-Length.
export async function lerJsonOps(request: Request) {
  const reader = request.body?.getReader();
  if (!reader) throw new ErroOps("Informe o corpo JSON.");
  const chunks: Uint8Array[] = []; let total = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > 32_768) { await reader.cancel(); throw new ErroOps("Corpo maior que 32 KiB.", 413); }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  return JSON.parse(Buffer.concat(chunks).toString("utf8")) as unknown;
}

export function exigirOrigem(request: Request) {
  const origin = request.headers.get("origin");
  if (!origin) return;
  let origem: URL;
  try { origem = new URL(origin); } catch { throw new ErroOps("Origem inválida.", 403); }
  // No standalone, request.url pode usar o host interno (localhost). O host
  // recebido pelo proxy preserva o endereço público usado pelo navegador.
  const hosts = [new URL(request.url).host, request.headers.get("host"), request.headers.get("x-forwarded-host")?.split(",")[0].trim()];
  if (!["http:", "https:"].includes(origem.protocol) || !hosts.includes(origem.host)) throw new ErroOps("Origem inválida.", 403);
}
export async function obterPainel(request: Request) {
  const ctx = await acessoOps();
  return painelOps(ctx, filtrosSchema.parse(Object.fromEntries(new URL(request.url).searchParams)));
}
export async function criarWatcher(request: Request) {
  exigirOrigem(request); const ctx = await acessoOps("gerir");
  const dados = watcherSchema.parse(await lerJsonOps(request));
  await conferirResponsavel(ctx.tenantId, dados.ownerId);
  await getPrisma().opsWatcher.create({ data: { tenantId: ctx.tenantId, ...dados } });
  return { ok: true };
}
export async function editarWatcher(request: Request, slug: string) {
  exigirOrigem(request); const ctx = await acessoOps("gerir"); slugSchema.parse(slug);
  const { version, ...dados } = editarWatcherSchema.parse(await lerJsonOps(request));
  await conferirResponsavel(ctx.tenantId, dados.ownerId);
  const r = await getPrisma().opsWatcher.updateMany({ where: { tenantId: ctx.tenantId, slug, version },
    data: { ...dados, version: { increment: 1 }, ...(!dados.isActive ? { tokenHash: null, lastHeartbeatAt: null } : {}) } });
  exigirAtualizacao(r.count); return { ok: true };
}
export async function tokenWatcher(request: Request, slug: string, revogar = false) {
  exigirOrigem(request); const ctx = await acessoOps("gerir"); slugSchema.parse(slug);
  const { version } = versaoSchema.parse(await lerJsonOps(request));
  return gerarToken(ctx, slug, version, revogar);
}
export async function tokenCompartilhadoOps(request: Request, revogar = false) {
  exigirOrigem(request); const ctx = await acessoOps("gerir");
  const { version } = versaoSchema.parse(await lerJsonOps(request));
  return gerarTokenCompartilhado(ctx, version, revogar);
}
export async function novaChaveOps(request: Request) {
  exigirOrigem(request); const ctx = await acessoOps("gerir");
  const { name } = nomeChaveSchema.parse(await lerJsonOps(request));
  return criarChaveOps(ctx, name);
}
export async function atualizarChaveOps(request: Request, id: string, revogar = false) {
  exigirOrigem(request); const ctx = await acessoOps("gerir");
  const { version } = versaoSchema.parse(await lerJsonOps(request));
  return alterarChaveOps(ctx, id, version, revogar);
}
export async function sinalizarInstabilidade(request: Request, slug: string, resolver = false) {
  exigirOrigem(request); const ctx = await acessoOps("gerir"); slugSchema.parse(slug);
  const body = await lerJsonOps(request);
  const dados = resolver ? null : instabilidadeSchema.parse(body);
  const { version } = versaoSchema.parse(body);
  if (dados?.ticketId) await conferirChamado(ctx, dados.ticketId);
  const r = await getPrisma().opsWatcher.updateMany({ where: { tenantId: ctx.tenantId, slug, version }, data: {
    version: { increment: 1 }, instabilityReportedAt: resolver ? null : new Date(),
    instabilityReportedBy: resolver ? null : ctx.userId, instabilityNote: dados?.note ?? null, instabilityTicketId: dados?.ticketId ?? null,
  } });
  exigirAtualizacao(r.count); return { ok: true };
}
export async function heartbeatWatcher(request: Request, slug: string) {
  slugSchema.parse(slug); const w = await autenticarWatcher(request, slug);
  const r = await getPrisma().$transaction(async tx => {
    if (w.compartilhado) await validarTokenCompartilhado(tx, w);
    return tx.opsWatcher.updateMany({ where: { tenantId: w.tenantId, slug, isActive: true, ...(!w.compartilhado ? { tokenHash: w.tokenHash } : {}) }, data: { lastHeartbeatAt: new Date() } });
  });
  if (!r.count) throw new ErroOps("Token revogado.", 401);
  return { ok: true };
}
export async function eventoWatcher(request: Request) {
  const w = await autenticarWatcher(request);
  return receberEvento(w, await lerJsonOps(request));
}

// Fecha o aviso de erro do card do robô para toda a equipe (28/10/2026). Só
// erro e aviso; o evento fica no histórico com quem fechou. Repetir não muda nada.
export async function fecharAviso(request: Request, id: string) {
  exigirOrigem(request); const ctx = await acessoOps("agir");
  if (!/^[0-9a-f-]{36}$/i.test(id)) throw new ErroOps("Aviso não encontrado.", 404);
  const db = getPrisma();
  const evento = await db.opsEvent.findFirst({ where: { tenantId: ctx.tenantId, id }, select: { status: true, dismissedAt: true, watcherSlug: true } });
  if (!evento || evento.status === "SUCCESS") throw new ErroOps("Aviso não encontrado.", 404);
  if (evento.dismissedAt) return { ok: true };
  await db.opsEvent.updateMany({ where: { tenantId: ctx.tenantId, id, dismissedAt: null }, data: { dismissedAt: new Date(), dismissedBy: ctx.userId } });
  await logAudit({ tenantId: ctx.tenantId, userId: ctx.userId, action: "ops.aviso_fechado", entityType: "OpsEvent", entityId: id, metadata: { robo: evento.watcherSlug } });
  return { ok: true };
}
