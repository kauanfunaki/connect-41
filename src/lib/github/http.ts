import { timingSafeEqual } from "node:crypto";
import { z, ZodError } from "zod";
import { githubAccess } from "./access";
import { GithubError, filtersSchema } from "./rules";
import { integrationView, changeIntegration } from "./service";
import { dashboard, dayEvents } from "./queries";
import { getConnection } from "./store";
import { processConnection, scheduleSync } from "./sync";

export async function githubResponse(fn: () => Promise<unknown>) {
  try { return Response.json(await fn(), { headers: { "Cache-Control": "no-store" } }); }
  catch (error) {
    if (error instanceof GithubError) return Response.json({ error: error.message, ...(error.retryAt ? { retryAt: error.retryAt.toISOString() } : {}) }, { status: error.status >= 400 && error.status <= 599 ? error.status : 503, headers: { "Cache-Control": "no-store" } });
    if (error instanceof ZodError || error instanceof SyntaxError) return Response.json({ error: "Confira os dados informados." }, { status: 400, headers: { "Cache-Control": "no-store" } });
    console.error("[github] Operação indisponível", error instanceof Error ? error.name : "erro");
    return Response.json({ error: "Módulo GitHub indisponível. Confira a configuração e a migration do módulo." }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
}
export function requireOrigin(request: Request) {
  const raw = request.headers.get("origin"); if (!raw) return;
  let origin: URL; try { origin = new URL(raw); } catch { throw new GithubError("Origem inválida.", 403); }
  const hosts = [new URL(request.url).host, request.headers.get("host"), request.headers.get("x-forwarded-host")?.split(",")[0]?.trim()];
  if (!["https:", "http:"].includes(origin.protocol) || !hosts.includes(origin.host)) throw new GithubError("Origem inválida.", 403);
}
export async function readJson(request: Request) {
  const reader = request.body?.getReader(); if (!reader) throw new GithubError("Informe os dados da operação.");
  let total = 0; const chunks: Uint8Array[] = [];
  try { while (true) { const result = await reader.read(); if (result.done) break; total += result.value.byteLength;
    if (total > 65536) { await reader.cancel(); throw new GithubError("Dados acima do limite de 64 KiB.", 413); } chunks.push(result.value); }
  } finally { reader.releaseLock(); }
  return JSON.parse(Buffer.concat(chunks).toString("utf8")) as unknown;
}
export async function getIntegration() { const ctx = await githubAccess("configurar"); return integrationView(ctx.tenantId); }
export async function postIntegration(request: Request) { requireOrigin(request); const ctx = await githubAccess("configurar"); return changeIntegration(ctx, await readJson(request)); }
export async function getDashboard(request: Request) {
  const ctx = await githubAccess();
  return dashboard(ctx.tenantId, filtersSchema.parse(Object.fromEntries(new URL(request.url).searchParams)));
}
export async function getDayEvents(request: Request) {
  const ctx = await githubAccess(), params = Object.fromEntries(new URL(request.url).searchParams), filters = filtersSchema.parse(params);
  const userId = z.string().uuid().parse(params.userId), date = filtersSchema.parse({ from: params.day, to: params.day }).from;
  if (!date) throw new GithubError("Informe o dia.");
  return dayEvents(ctx.tenantId, filters, userId, date, filters.page);
}
export async function postSync(request: Request) {
  requireOrigin(request); const ctx = await githubAccess("gerir");
  const { action } = z.object({ action: z.enum(["queue", "process"]) }).parse(await readJson(request));
  const connection = await getConnection(ctx.tenantId);
  if (!connection || connection.status !== "connected") throw new GithubError("Conecte a conta GitHub em Integrações.");
  if (action === "queue" && !connection.integration.enabled) throw new GithubError("A sincronização está pausada. Retome em Integrações para atualizar as contribuições.");
  if (action === "queue") { await scheduleSync(connection, true); return { ok: true, queued: true }; }
  try { return await processConnection(ctx.tenantId, { milliseconds: 12000, steps: 8 }); }
  catch (error) { if (error instanceof GithubError && error.status === 409) return { steps: 0, waiting: true }; throw error; }
}
export function validCronToken(request: Request): boolean {
  const expected = process.env.CRON_SERVICE_TOKEN, received = request.headers.get("authorization");
  if (!expected || !received?.startsWith("Bearer ")) return false;
  const a = Buffer.from(expected), b = Buffer.from(received.slice(7));
  return a.length === b.length && timingSafeEqual(a, b);
}
