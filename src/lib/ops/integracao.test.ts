import { randomBytes, randomUUID } from "node:crypto";
import { beforeAll, afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { PrismaClient } from "@/generated/prisma/client";
import { PrismaMariaDb } from "@prisma/adapter-mariadb";
import type { AuthContext } from "@/lib/auth/context";

const url = process.env.OPS_TEST_DATABASE_URL;
const destino = url ? new URL(url) : null;
if (destino && (!["127.0.0.1", "localhost"].includes(destino.hostname) || destino.port !== "33379" || destino.pathname !== "/connect41")) throw new Error("Banco não isolado recusado.");
const db = destino ? new PrismaClient({ adapter: new PrismaMariaDb({ host: destino.hostname, port: 33379, user: decodeURIComponent(destino.username), password: decodeURIComponent(destino.password), database: "connect41", allowPublicKeyRetrieval: true }) }) : null;
const mocks = vi.hoisted(() => ({ auth: vi.fn(), push: vi.fn() }));
vi.mock("@/lib/prisma", () => ({ getPrisma: () => { if (!db) throw new Error("Banco descartável não configurado."); return db; } }));
vi.mock("@/lib/auth/context", async original => ({ ...await original<typeof import("@/lib/auth/context")>(), getAuthContext: mocks.auth }));
vi.mock("@/lib/webPush", () => ({ sendWebPushToUser: mocks.push }));

import { acessoOps, autenticarWatcher, conferirResponsavel, gerarToken, gerarTokenCompartilhado, hashToken, painelOps, receberEvento } from "./servidor";
import { criarWatcher, editarWatcher, eventoWatcher, heartbeatWatcher, lerJsonOps, obterPainel, responderOps, sinalizarInstabilidade, tokenWatcher } from "./http";
import { filtrosSchema } from "./regras";
import { criarChaveOps, alterarChaveOps, listarChavesOps } from "./chaves";

describe.skipIf(!url)("Ops Center com MySQL descartável", () => {
  let tenantId: string, outroTenant: string, dono: string, colega: string, externo: string, fiscal: string;
  let ctx: AuthContext;
  const token = `ops_${randomBytes(32).toString("hex")}`, slug = "bot_teste";
  const evento = (status = "ERROR", id = randomUUID()) => ({ eventId: id, watcherSlug: slug, filename: "arquivo_ficticio.xml", status });
  const req = (path: string, body?: unknown, chave?: string) => new Request(`http://localhost${path}`, { method: "POST", headers: { "Content-Type": "application/json", ...(chave ? { Authorization: `Bearer ${chave}` } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) });
  const autenticado = () => ({ tenantId, slug, tokenHash: hashToken(token), compartilhado: false });
  const usuario = async (tenant: string, name: string, role: "ADMIN" | "SECTOR_USER" = "SECTOR_USER", setor = "tech") => {
    const id = randomUUID(); await db!.user.create({ data: { id, tenantId: tenant, name, email: `${id}@example.test`, passwordHash: "teste-sem-login", role, sectors: { create: { sectorCode: setor } } } }); return id;
  };
  beforeAll(async () => {
    tenantId = randomUUID(); outroTenant = randomUUID();
    for (const id of [tenantId, outroTenant]) {
      await db!.tenant.create({ data: { id, name: "Escritório fictício Ops", slug: `ops-${id}` } });
      await db!.tenantModule.create({ data: { tenantId: id, moduleCode: "tech_ops_center", enabled: true } });
    }
    dono = await usuario(tenantId, "Dono teste", "ADMIN"); colega = await usuario(tenantId, "Colega teste");
    fiscal = await usuario(tenantId, "Fiscal teste", "SECTOR_USER", "fiscal"); externo = await usuario(outroTenant, "Outro escritório");
  });
  beforeEach(async () => {
    mocks.push.mockReset(); mocks.push.mockResolvedValue(undefined);
    ctx = { userId: dono, tenantId, homeTenantId: tenantId, role: "ADMIN", sectors: ["tech"], subscriptionReadOnly: false, canSelfRegularizeSubscription: false, activeSector: null };
    mocks.auth.mockImplementation(() => Promise.resolve(ctx));
    // Limpa exclusivamente os registros das fixtures criadas por esta suíte.
    await db!.notification.deleteMany({ where: { tenantId } });
    await db!.opsApiKey.deleteMany({ where: { tenantId: { in: [tenantId, outroTenant] } } });
    await db!.opsApiCredential.deleteMany({ where: { tenantId: { in: [tenantId, outroTenant] } } });
    await db!.opsEvent.deleteMany({ where: { tenantId: { in: [tenantId, outroTenant] } } });
    await db!.opsWatcher.deleteMany({ where: { tenantId: { in: [tenantId, outroTenant] } } });
    await db!.tenantModule.updateMany({ where: { tenantId, moduleCode: "tech_ops_center" }, data: { enabled: true, sectorCode: null } });
    await db!.opsWatcher.create({ data: { tenantId, slug, name: "Bot de teste", ownerId: dono, tokenHash: hashToken(token) } });
  });
  afterAll(async () => { await db?.$disconnect(); });

  it("grava erro e aviso ao dono juntos, sem duplicar na retransmissão", async () => {
    const payload = evento();
    const a = await receberEvento(autenticado(), payload), b = await receberEvento(autenticado(), payload);
    expect(a.duplicate).toBe(false); expect(b).toEqual({ id: a.id, duplicate: true });
    const avisos = await db!.notification.findMany({ where: { tenantId } });
    expect(avisos).toHaveLength(1); expect(avisos[0]).toMatchObject({ userId: dono, type: "OPS_AUTOMACAO_ERRO", entityId: slug });
    expect(mocks.push).toHaveBeenCalledTimes(1);
  });
  it("rejeita reaproveitar a identidade com resultado diferente", async () => {
    const payload = evento(); await receberEvento(autenticado(), payload);
    await expect(receberEvento(autenticado(), { ...payload, status: "SUCCESS" })).rejects.toMatchObject({ status: 409 });
    expect(await db!.opsEvent.count({ where: { tenantId } })).toBe(1);
  });
  it("concorrência do mesmo evento não duplica resultados ou avisos", async () => {
    const payload = evento();
    const r = await Promise.all([receberEvento(autenticado(), payload), receberEvento(autenticado(), payload)]);
    expect(r.filter(e => !e.duplicate)).toHaveLength(1);
    expect(await db!.notification.count({ where: { tenantId } })).toBe(1);
  });
  it("sucesso e aviso não disparam erro; falha no push preserva o sino", async () => {
    await receberEvento(autenticado(), evento("SUCCESS")); await receberEvento(autenticado(), evento("WARNING"));
    expect(mocks.push).not.toHaveBeenCalled();
    mocks.push.mockRejectedValueOnce(new Error("push indisponível"));
    await receberEvento(autenticado(), evento());
    expect(await db!.notification.count({ where: { tenantId } })).toBe(1);
  });
  it("aplica preferências de notificação e não alerta automação sem dono", async () => {
    await db!.notificationHiddenType.create({ data: { tenantId, userId: dono, type: "OPS_AUTOMACAO_ERRO" } });
    await receberEvento(autenticado(), evento()); expect(mocks.push).not.toHaveBeenCalled();
    await db!.notificationHiddenType.deleteMany({ where: { tenantId } });
    await db!.opsWatcher.update({ where: { tenantId_slug: { tenantId, slug } }, data: { ownerId: null } });
    await receberEvento(autenticado(), evento());
    expect(await db!.notification.count({ where: { tenantId } })).toBe(1);
  });
  it("troca de dono direciona novos erros à pessoa atual", async () => {
    await receberEvento(autenticado(), evento());
    await editarWatcher(req("/", { name: "Bot de teste", ownerId: colega, isActive: true, version: 0 }), slug);
    await receberEvento(autenticado(), evento());
    expect(await db!.notification.count({ where: { tenantId, userId: dono } })).toBe(1);
    expect(await db!.notification.count({ where: { tenantId, userId: colega } })).toBe(1);
  });
  it("minhas filtra cartões, resumo e eventos pelo usuário autenticado", async () => {
    await receberEvento(autenticado(), evento("SUCCESS"));
    await db!.opsWatcher.create({ data: { tenantId, slug: "outro_bot", name: "Outro bot", ownerId: colega } });
    await db!.opsEvent.create({ data: { tenantId, watcherSlug: "outro_bot", eventId: "outro", payloadHash: "0".repeat(64), filename: "outro.xml", status: "ERROR", processedAt: new Date() } });
    const meu = await painelOps(ctx, filtrosSchema.parse({ mine: "1" }));
    expect(meu.watchers.map(w => w.slug)).toEqual([slug]); expect(meu.summary).toMatchObject({ total: 1, success: 1, error: 0, successRate: 100 }); expect(meu.total).toBe(1);
    ctx = { ...ctx, userId: colega }; const dele = await painelOps(ctx, filtrosSchema.parse({ mine: "1" }));
    expect(dele.watchers[0].slug).toBe("outro_bot"); expect(dele.summary.error).toBe(1);
  });
  it("não mistura escritórios, mesmo com identificadores iguais", async () => {
    await db!.opsWatcher.create({ data: { tenantId: outroTenant, slug, name: "Bot externo", ownerId: externo } });
    await db!.opsEvent.create({ data: { tenantId: outroTenant, watcherSlug: slug, eventId: "externo", payloadHash: "0".repeat(64), filename: "externo.xml", status: "ERROR", processedAt: new Date() } });
    const painel = await painelOps(ctx, filtrosSchema.parse({})); expect(painel.total).toBe(0); expect(painel.summary.total).toBe(0); expect(painel.watchers[0].name).toBe("Bot de teste");
    await expect(conferirResponsavel(tenantId, externo)).rejects.toThrow("responsável ativo");
    await expect(conferirResponsavel(tenantId, fiscal)).rejects.toThrow("responsável ativo");
    expect(JSON.stringify(painel)).not.toContain("tokenHash"); expect(JSON.stringify(painel)).not.toContain(hashToken(token));
  });
  it("página e escrita respeitam setor, assinatura e módulo ligado", async () => {
    ctx = { ...ctx, role: "SECTOR_USER", sectors: ["fiscal"], userId: fiscal };
    await expect(acessoOps()).rejects.toMatchObject({ status: 403 });
    ctx = { ...ctx, role: "READONLY", sectors: [] }; await expect(acessoOps()).resolves.toBeTruthy();
    await expect(criarWatcher(req("/", { slug: "novo", name: "Novo" }))).rejects.toMatchObject({ status: 403 });
    ctx = { ...ctx, role: "ADMIN", subscriptionReadOnly: true }; await expect(acessoOps("gerir")).rejects.toMatchObject({ status: 403 });
    await db!.tenantModule.updateMany({ where: { tenantId, moduleCode: "tech_ops_center" }, data: { enabled: false } });
    await expect(acessoOps()).rejects.toMatchObject({ status: 403 });
    await expect(autenticarWatcher(req("/", undefined, token))).rejects.toMatchObject({ status: 403 });
  });
  it("chave é individual, revogável e não vale após desativação", async () => {
    await expect(autenticarWatcher(req("/", undefined, token), "outro_bot")).rejects.toMatchObject({ status: 401 });
    const nova = await gerarToken(ctx, slug, 0); expect(nova.token).toMatch(/^ops_[a-f0-9]{64}$/);
    await expect(autenticarWatcher(req("/", undefined, token))).rejects.toMatchObject({ status: 401 });
    await expect(receberEvento(autenticado(), evento())).rejects.toMatchObject({ status: 401 });
    await editarWatcher(req("/", { name: "Bot", isActive: false, ownerId: dono, version: 1 }), slug);
    await expect(autenticarWatcher(req("/", undefined, nova.token!))).rejects.toMatchObject({ status: 401 });
  });
  it("uma chave compartilhada recebe dados e heartbeat de mais de uma automação", async () => {
    await db!.opsWatcher.create({ data: { tenantId, slug: "outro_bot", name: "Outro bot", ownerId: dono } });
    const nova = await gerarTokenCompartilhado(ctx, 0);
    expect(nova.token).toMatch(/^ops_[a-f0-9]{64}$/);
    const credencial = await autenticarWatcher(req("/", undefined, nova.token!), slug);
    expect(credencial).toMatchObject({ tenantId, slug, compartilhado: true });
    const segundoBot = await autenticarWatcher(req("/", undefined, nova.token!), "outro_bot");
    await receberEvento(segundoBot, { ...evento("SUCCESS"), watcherSlug: "outro_bot" });
    await heartbeatWatcher(req("/", undefined, nova.token!), slug);
    await heartbeatWatcher(req("/", undefined, nova.token!), "outro_bot");
    expect(await db!.opsEvent.count({ where: { tenantId } })).toBe(1);
    expect(await gerarTokenCompartilhado(ctx, 1, true)).toMatchObject({ token: null, hasToken: false, version: 2 });
    await expect(autenticarWatcher(req("/", undefined, nova.token!))).rejects.toMatchObject({ status: 401 });
  });
  it("heartbeat confirma recebimento sem declarar processamento", async () => {
    await heartbeatWatcher(req("/", undefined, token), slug);
    expect((await db!.opsWatcher.findUnique({ where: { tenantId_slug: { tenantId, slug } } }))?.lastHeartbeatAt).toBeInstanceOf(Date);
    expect(await db!.opsEvent.count({ where: { tenantId } })).toBe(0);
  });
  it("duas chaves adicionais coexistem com a principal e são revogadas separadamente", async () => {
    const principal = await gerarTokenCompartilhado(ctx, 0);
    const a = await criarChaveOps(ctx, "Servidor A"), b = await criarChaveOps(ctx, "Servidor B");
    const authA = await autenticarWatcher(req("/", undefined, a.token), slug);
    const authB = await autenticarWatcher(req("/", undefined, b.token), slug);
    await receberEvento(authA, evento("SUCCESS"));
    await heartbeatWatcher(req("/", undefined, b.token), slug);
    const lista = await listarChavesOps(tenantId);
    expect(lista).toHaveLength(2); expect(JSON.stringify(lista)).not.toContain("tokenHash"); expect(JSON.stringify(lista)).not.toContain(a.token);
    await alterarChaveOps(ctx, a.id, 0, true);
    await expect(autenticarWatcher(req("/", undefined, a.token))).rejects.toMatchObject({ status: 401 });
    await expect(receberEvento(authA, evento())).rejects.toMatchObject({ status: 401 });
    await expect(autenticarWatcher(req("/", undefined, principal.token!))).resolves.toMatchObject({ compartilhado: true });
    await expect(receberEvento(authB, evento("SUCCESS"))).resolves.toMatchObject({ duplicate: false });
    const nova = await alterarChaveOps(ctx, b.id, 0);
    await expect(heartbeatWatcher(req("/", undefined, b.token), slug)).rejects.toMatchObject({ status: 401 });
    await expect(heartbeatWatcher(req("/", undefined, nova.token!), slug)).resolves.toEqual({ ok: true });
    await expect(alterarChaveOps(ctx, b.id, 0)).rejects.toMatchObject({ status: 409 });
    await expect(alterarChaveOps({ ...ctx, tenantId: outroTenant }, b.id, 1, true)).rejects.toMatchObject({ status: 409 });
  });
  it("edição concorrente e origens externas são recusadas", async () => {
    await editarWatcher(req("/", { name: "Bot atualizado", version: 0 }), slug);
    await expect(editarWatcher(req("/", { name: "Bot antigo", version: 0 }), slug)).rejects.toMatchObject({ status: 409 });
    const r = new Request("http://localhost/api/ops/watchers", { method: "POST", headers: { origin: "https://outro.test" }, body: "{}" });
    await expect(criarWatcher(r)).rejects.toMatchObject({ status: 403 });
    const proxy = new Request("http://localhost/api/ops/watchers", { method: "POST", headers: { origin: "https://connect.example.test", "x-forwarded-host": "connect.example.test" }, body: JSON.stringify({ slug: "bot_proxy", name: "Bot pelo proxy" }) });
    await expect(criarWatcher(proxy)).resolves.toEqual({ ok: true });
  });
  it("sinaliza e resolve instabilidade sem apagar eventos", async () => {
    await receberEvento(autenticado(), evento());
    await sinalizarInstabilidade(req("/", { version: 0, note: "Falha de teste" }), slug);
    expect((await painelOps(ctx, filtrosSchema.parse({}))).watchers[0].instabilityNote).toBe("Falha de teste");
    await sinalizarInstabilidade(req("/", { version: 1 }), slug, true);
    expect((await painelOps(ctx, filtrosSchema.parse({}))).watchers[0].instabilityNote).toBeNull(); expect(await db!.opsEvent.count({ where: { tenantId } })).toBe(1);
  });
  it("valida corpo, paginação e token antes de aceitar eventos", async () => {
    const response = await responderOps(() => eventoWatcher(req("/", evento()))); expect(response.status).toBe(401);
    const grande = new Request("http://localhost/", { method: "POST", body: "x".repeat(33000) }); await expect(lerJsonOps(grande)).rejects.toMatchObject({ status: 413 });
    expect((await responderOps(() => obterPainel(new Request("http://localhost/api/ops?page=-1")))).status).toBe(400);
    expect((await responderOps(() => tokenWatcher(req("/", { version: -1 }), slug))).status).toBe(400);
  });
});
