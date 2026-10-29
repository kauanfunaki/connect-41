import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { PrismaClient } from "@/generated/prisma/client";
import { PrismaMariaDb } from "@prisma/adapter-mariadb";
import type { AuthContext } from "@/lib/auth/context";
import { CONFLITO, lerFiltros } from "./regras";

const url = process.env.TECH_INTERNAL_TEST_DATABASE_URL;
const destino = url ? new URL(url) : null;
if (destino && (!["127.0.0.1", "localhost"].includes(destino.hostname) || destino.port !== "33379" || destino.pathname !== "/connect41")) throw new Error("Banco não isolado recusado.");
const db = destino ? new PrismaClient({ adapter: new PrismaMariaDb({ host: destino.hostname, port: 33379, user: decodeURIComponent(destino.username), password: decodeURIComponent(destino.password), database: "connect41", allowPublicKeyRetrieval: true }) }) : null;
const mocks = vi.hoisted(() => ({ auth: vi.fn() }));
vi.mock("@/lib/prisma", () => ({ getPrisma: () => { if (!db) throw new Error("Banco descartável não configurado."); return db; } }));
vi.mock("@/lib/auth/context", async original => ({ ...await original<typeof import("@/lib/auth/context")>(), getAuthContext: mocks.auth }));
vi.mock("next/navigation", () => ({ notFound: vi.fn() }));
import { salvarItem, comentarItem, listarItens, detalheItem, opcoesTech, mudarSituacaoItem, historicoTech } from "./servidor";

describe.skipIf(!url)("controle interno com MySQL descartável", () => {
  let tenantId: string, outroTenant: string, tech: string, gestor: string, fiscal: string, admin: string, externo: string, readonly: string;
  let ctx: AuthContext;
  const contexto = (userId = tech, role: AuthContext["role"] = "SECTOR_USER", sectors = ["tech"], tenant = tenantId): AuthContext => ({ userId, tenantId: tenant, homeTenantId: tenant, role, sectors, subscriptionReadOnly: false, canSelfRegularizeSubscription: false, activeSector: null });
  const assumir = (c: AuthContext) => { ctx = c; mocks.auth.mockResolvedValue(c); };
  const criar = (override: Record<string, unknown> = {}) => ({ title: `Pendência fictícia ${randomUUID()}`, type: "BUG", ...override });
  const id = (r: Awaited<ReturnType<typeof salvarItem>>) => { if ("error" in r) throw new Error(r.error); return r.id; };
  const novoUsuario = async (tenant: string, role: AuthContext["role"], sector: string) => {
    const userId = randomUUID();
    await db!.user.create({ data: { id: userId, tenantId: tenant, name: `Pessoa fictícia ${role}`, email: `${userId}@example.test`, passwordHash: "sem-login-real", role, sectors: { create: { sectorCode: sector } } } });
    return userId;
  };
  beforeAll(async () => {
    tenantId = randomUUID(); outroTenant = randomUUID();
    for (const t of [tenantId, outroTenant]) {
      await db!.tenant.create({ data: { id: t, name: "Escritório fictício Tech", slug: t } });
      for (const code of ["tech", "fiscal"]) await db!.sector.create({ data: { tenantId: t, code, label: code } });
      await db!.tenantModule.create({ data: { tenantId: t, moduleCode: "tech_controle_interno", enabled: true } });
    }
    tech = await novoUsuario(tenantId, "SECTOR_USER", "tech"); gestor = await novoUsuario(tenantId, "SECTOR_ADMIN", "tech");
    fiscal = await novoUsuario(tenantId, "SECTOR_USER", "fiscal"); admin = await novoUsuario(tenantId, "ADMIN", "fiscal");
    readonly = await novoUsuario(tenantId, "READONLY", "fiscal"); externo = await novoUsuario(outroTenant, "SECTOR_USER", "tech");
    assumir(contexto());
  });
  afterAll(async () => {
    if (!db) return;
    for (const t of [tenantId, outroTenant].filter(Boolean)) {
      await db.techInternalComment.deleteMany({ where: { tenantId: t } }); await db.techInternalChange.deleteMany({ where: { tenantId: t } });
      await db.techInternalItem.deleteMany({ where: { tenantId: t } }); await db.techInternalTool.deleteMany({ where: { tenantId: t } });
      await db.opsSite.deleteMany({ where: { tenantId: t } }); await db.opsApp.deleteMany({ where: { tenantId: t } }); await db.opsWatcher.deleteMany({ where: { tenantId: t } });
      await db.userSector.deleteMany({ where: { user: { tenantId: t } } }); await db.user.deleteMany({ where: { tenantId: t } });
      await db.auditLog.deleteMany({ where: { tenantId: t } }); await db.tenantModule.deleteMany({ where: { tenantId: t } }); await db.sector.deleteMany({ where: { tenantId: t } }); await db.tenant.delete({ where: { id: t } });
    }
    await db.$disconnect();
  });

  it("cria os cinco tipos, aceita opcionais vazios e cria histórico inicial", async () => {
    assumir(contexto());
    for (const type of ["BUG", "IMPROVEMENT", "FEATURE", "TEST", "MIGRATION"]) {
      const itemId = id(await salvarItem(criar({ type, dueDate: "", assigneeId: "" })));
      const item = await detalheItem(ctx, itemId);
      expect(item).toMatchObject({ type, priority: 1, status: "PENDING", systemMode: "NONE", dueDate: null, assigneeId: null, version: 0 });
      expect(item!.changes).toHaveLength(1); expect(item!.changes[0].authorId).toBe(tech);
    }
  });
  it("Kanban altera situação com histórico, conflito entre abas e bloqueio de somente leitura", async () => {
    assumir(contexto()); const itemId = id(await salvarItem(criar()));
    expect(await mudarSituacaoItem(itemId, "IN_PROGRESS", 0)).toMatchObject({ ok: true });
    expect(await mudarSituacaoItem(itemId, "DONE", 0)).toEqual({ error: CONFLITO });
    const item = await detalheItem(ctx, itemId);
    expect(item).toMatchObject({ status: "IN_PROGRESS", version: 1 }); expect(item!.changes[0].changes).toEqual([{ field: "Situação", before: "Pendente", after: "Em andamento" }]);
    assumir(contexto(readonly, "READONLY")); expect(await mudarSituacaoItem(itemId, "DONE", 1)).toHaveProperty("error");
    assumir(contexto(externo, "ADMIN", [], outroTenant)); expect(await mudarSituacaoItem(itemId, "DONE", 1)).toHaveProperty("error");
  });
  it("agenda respeita o mês, inclui itens sem prazo e conserva os filtros", async () => {
    assumir(contexto()); const prefixo = randomUUID();
    for (const [dueDate, type] of [["2026-10-01", "BUG"], ["2026-10-31", "BUG"], ["2026-11-01", "BUG"], ["", "BUG"], ["2026-10-15", "TEST"]]) await salvarItem(criar({ title: prefixo, dueDate, type }));
    const agenda = await listarItens(ctx, lerFiltros({ q: prefixo, visao: "agenda", mes: "2026-10", tipo: "BUG" }));
    expect(agenda.total).toBe(3); expect(agenda.items.map(i => i.dueDate?.toISOString().slice(0, 10) ?? null).sort()).toEqual(["2026-10-01", "2026-10-31", null].sort());
    expect((await listarItens(ctx, lerFiltros({ q: prefixo, visao: "kanban" }))).total).toBe(5);
  });
  it("reabre e registra valores anteriores e novos; preserva calendário", async () => {
    assumir(contexto()); const itemId = id(await salvarItem(criar({ title: "Antes", status: "DONE", dueDate: "2026-10-21" })));
    expect(await salvarItem(criar({ title: "Depois", status: "PENDING", dueDate: "2026-10-21", assigneeId: tech }), itemId, 0)).toMatchObject({ ok: true });
    const item = await detalheItem(ctx, itemId);
    expect(item!.dueDate!.toISOString().slice(0, 10)).toBe("2026-10-21");
    expect(item!.changes[0].changes).toEqual(expect.arrayContaining([{ field: "Título", before: "Antes", after: "Depois" }, { field: "Situação", before: "Concluído", after: "Pendente" }]));
  });
  it("recusa versão antiga e duas edições simultâneas não se sobrescrevem", async () => {
    assumir(contexto()); const itemId = id(await salvarItem(criar()));
    const results = await Promise.all([salvarItem(criar({ title: "A" }), itemId, 0), salvarItem(criar({ title: "B" }), itemId, 0)]);
    expect(results.filter(r => "ok" in r)).toHaveLength(1);
    expect(results.find(r => "error" in r)).toEqual({ error: CONFLITO });
    expect(await salvarItem(criar(), itemId, 0)).toEqual({ error: CONFLITO });
    expect(await salvarItem(criar(), itemId)).toEqual({ error: CONFLITO });
    expect(await detalheItem(ctx, itemId)).toMatchObject({ version: 1 });
    expect(await db!.techInternalChange.count({ where: { itemId } })).toBe(2);
  });
  it("gravação e histórico são atômicos quando o autor deixa de existir", async () => {
    assumir(contexto()); const itemId = id(await salvarItem(criar({ title: "Original" })));
    assumir({ ...ctx, userId: "autor-inexistente" });
    expect(await salvarItem(criar({ title: "Não deve persistir" }), itemId, 0)).toHaveProperty("error");
    expect(await db!.techInternalItem.findUnique({ where: { id: itemId } })).toMatchObject({ title: "Original", version: 0 });
    expect(await db!.techInternalChange.count({ where: { itemId } })).toBe(1);
  });
  it("comentários independentes são preservados e não mudam a versão do formulário", async () => {
    assumir(contexto()); const itemId = id(await salvarItem(criar()));
    await Promise.all([comentarItem(itemId, "Primeiro comentário"), comentarItem(itemId, "Segundo comentário")]);
    const item = await detalheItem(ctx, itemId); expect(item!.comments).toHaveLength(2); expect(item!.version).toBe(0);
    expect(item!.comments[0].authorName).toContain("Pessoa fictícia");
    expect(await comentarItem(itemId, " ")).toHaveProperty("error");
  });
  it("os sistemas vêm do Ops Center: robôs, sites e apps; inativos preservam vínculos", async () => {
    assumir(contexto()); const sufixo = randomUUID().slice(0, 8);
    const site = await db!.opsSite.create({ data: { tenantId, name: `Portal ${sufixo}`, url: "https://portal.example.test" } });
    const app = await db!.opsApp.create({ data: { tenantId, name: `App ${sufixo}` } });
    await db!.opsWatcher.create({ data: { tenantId, slug: `robo-${sufixo}`, name: `Robô ${sufixo}` } });
    const { sistemas } = await opcoesTech(ctx);
    expect(sistemas).toEqual(expect.arrayContaining([
      { chave: `site:${site.id}`, nome: site.name, origem: "site", ativo: true }, { chave: `app:${app.id}`, nome: app.name, origem: "app", ativo: true },
      { chave: `robo:robo-${sufixo}`, nome: `Robô ${sufixo}`, origem: "robo", ativo: true },
    ]));
    const title = `Com sistema ${sufixo}`, itemId = id(await salvarItem(criar({ title, systemMode: "EXISTING", systemKey: `site:${site.id}` })));
    expect(await detalheItem(ctx, itemId)).toMatchObject({ opsSiteId: site.id, opsSite: { name: site.name } });
    expect(await salvarItem(criar({ title, systemMode: "EXISTING", systemKey: `robo:robo-${sufixo}` }), itemId, 0)).toMatchObject({ ok: true });
    expect(await detalheItem(ctx, itemId)).toMatchObject({ opsSiteId: null, opsWatcherSlug: `robo-${sufixo}` });
    expect((await detalheItem(ctx, itemId))!.changes[0].changes).toEqual([{ field: "Sistema", before: site.name, after: `Robô ${sufixo}` }]);
    expect((await listarItens(ctx, lerFiltros({ sistema: `robo:robo-${sufixo}` }))).items.map(i => i.id)).toEqual([itemId]);
    await db!.opsWatcher.update({ where: { tenantId_slug: { tenantId, slug: `robo-${sufixo}` } }, data: { isActive: false } });
    expect(await salvarItem(criar({ systemMode: "EXISTING", systemKey: `robo:robo-${sufixo}` }))).toHaveProperty("error");
    expect(await salvarItem(criar({ title, systemMode: "EXISTING", systemKey: `robo:robo-${sufixo}` }), itemId, 1)).toMatchObject({ ok: true });
    expect(await salvarItem(criar({ systemMode: "EXISTING", systemKey: `app:${randomUUID()}` }))).toHaveProperty("error");
    // O cadastro anterior só mantém o vínculo que já existia.
    const tool = await db!.techInternalTool.create({ data: { tenantId, name: `Antigo ${sufixo}` } });
    expect(await salvarItem(criar({ systemMode: "EXISTING", systemKey: `tool:${tool.id}` }))).toHaveProperty("error");
  });
  it("o histórico geral traz cada alteração com autor, item e ordem mais recente", async () => {
    assumir(contexto()); const itemId = id(await salvarItem(criar({ title: "Histórico geral" })));
    expect(await mudarSituacaoItem(itemId, "VALIDATION", 0)).toMatchObject({ ok: true });
    const { changes, total } = await historicoTech(ctx, { pagina: 1 });
    expect(total).toBeGreaterThanOrEqual(2);
    expect(changes[0]).toMatchObject({ itemId, authorId: tech, version: 1, item: { title: "Histórico geral" }, changes: [{ field: "Situação", before: "Pendente", after: "Em validação" }] });
    expect(changes[1]).toMatchObject({ itemId, version: 0 });
    expect((await historicoTech(ctx, { pagina: 1, q: "Histórico geral" })).changes.every(c => c.itemId === itemId)).toBe(true);
    const porAutor = await historicoTech(ctx, { pagina: 1, autor: tech });
    expect(porAutor.changes.length).toBeGreaterThan(0); expect(porAutor.changes.every(c => c.authorId === tech)).toBe(true);
    expect(porAutor.autores).toEqual(expect.arrayContaining([{ authorId: tech, authorName: "Pessoa fictícia SECTOR_USER" }]));
    assumir(contexto(externo, "SECTOR_USER", ["tech"], outroTenant)); expect((await historicoTech(ctx, { pagina: 1 })).changes.some(c => c.itemId === itemId)).toBe(false);
    assumir(contexto(fiscal, "SECTOR_USER", ["fiscal"])); await expect(historicoTech(ctx, { pagina: 1 })).rejects.toThrow();
  });
  it("excluir a conta solta o responsável e preserva comentários e autoria do histórico", async () => {
    const temporario = await novoUsuario(tenantId, "SECTOR_USER", "tech"); assumir(contexto(temporario));
    const itemId = id(await salvarItem(criar({ assigneeId: temporario }))); await comentarItem(itemId, "Registro que deve permanecer.");
    await db!.user.delete({ where: { id: temporario } }); assumir(contexto());
    const item = await detalheItem(ctx, itemId);
    expect(item!.assigneeId).toBeNull(); expect(item!.comments[0]).toMatchObject({ authorId: temporario, authorName: "Pessoa fictícia SECTOR_USER", body: "Registro que deve permanecer." });
    expect(item!.changes[0].authorName).toBe("Pessoa fictícia SECTOR_USER");
  });
  it("recusa responsáveis de outros setores, inativos, somente leitura e outro escritório", async () => {
    assumir(contexto());
    for (const assigneeId of [fiscal, externo, readonly]) expect(await salvarItem(criar({ assigneeId }))).toHaveProperty("error");
    await db!.user.update({ where: { id: tech }, data: { active: false } });
    assumir(contexto(admin, "ADMIN", ["fiscal"])); expect(await salvarItem(criar({ assigneeId: tech }))).toHaveProperty("error");
    await db!.user.update({ where: { id: tech }, data: { active: true } });
    expect(await salvarItem(criar({ assigneeId: admin }))).toMatchObject({ ok: true });
  });
  it("isola leitura, comentários, atualizações, ferramentas e filtros entre escritórios", async () => {
    assumir(contexto(gestor, "SECTOR_ADMIN"));
    const site = await db!.opsSite.create({ data: { tenantId, name: `Privado ${randomUUID()}`, url: "https://privado.example.test" } }); const itemId = id(await salvarItem(criar()));
    assumir(contexto(externo, "SECTOR_USER", ["tech"], outroTenant));
    expect(await detalheItem(ctx, itemId)).toBeNull(); expect(await comentarItem(itemId, "Não autorizado")).toHaveProperty("error");
    expect(await salvarItem(criar(), itemId, 0)).toHaveProperty("error");
    expect(await salvarItem(criar({ systemMode: "EXISTING", systemKey: `site:${site.id}` }))).toHaveProperty("error");
    expect((await listarItens(ctx, lerFiltros({ situacao: "ALL" }))).total).toBe(0);
    expect((await opcoesTech(ctx)).sistemas).toHaveLength(0);
  });
  it("bloqueia outro setor, somente leitura, assinatura e módulo desativado", async () => {
    assumir(contexto()); const itemId = id(await salvarItem(criar()));
    assumir(contexto(fiscal, "SECTOR_USER", ["fiscal"]));
    await expect(detalheItem(ctx, itemId)).rejects.toThrow(); expect(await salvarItem(criar())).toHaveProperty("error");
    assumir(contexto(readonly, "READONLY", ["fiscal"])); expect(await detalheItem(ctx, itemId)).not.toBeNull();
    expect(await salvarItem(criar())).toHaveProperty("error"); expect(await comentarItem(itemId, "Não permitido")).toHaveProperty("error");
    assumir({ ...contexto(), subscriptionReadOnly: true }); expect(await salvarItem(criar())).toHaveProperty("error");
    expect(await comentarItem(itemId, "Não permitido")).toHaveProperty("error");
    await db!.tenantModule.update({ where: { tenantId_moduleCode: { tenantId, moduleCode: "tech_controle_interno" } }, data: { enabled: false } });
    assumir(contexto(admin, "ADMIN", [])); await expect(listarItens(ctx, lerFiltros({}))).rejects.toThrow(); expect(await salvarItem(criar())).toHaveProperty("error");
    await db!.tenantModule.update({ where: { tenantId_moduleCode: { tenantId, moduleCode: "tech_controle_interno" } }, data: { enabled: true } });
  });
  it("filtra combinações, atrasados e estados especiais; pagina 50 itens com ordem estável", async () => {
    assumir(contexto()); const prefixo = randomUUID();
    await db!.techInternalItem.createMany({ data: Array.from({ length: 53 }, (_, i) => ({ tenantId, title: `${prefixo} ${i}`, type: "TEST" as const, priority: 3, systemMode: "NEW" as const, assigneeId: tech, dueDate: new Date("2020-01-01") })) });
    const filtros = lerFiltros({ q: prefixo, tipo: "TEST", prioridade: "3", sistema: "NEW", responsavel: "me", atrasados: "1" });
    const primeira = await listarItens(ctx, filtros), segunda = await listarItens(ctx, { ...filtros, page: 2 });
    expect(primeira).toMatchObject({ total: 53, page: 1, pages: 2 }); expect(primeira.items).toHaveLength(50); expect(segunda.items).toHaveLength(3);
    expect(new Set([...primeira.items, ...segunda.items].map(i => i.id)).size).toBe(53);
    expect((await listarItens(ctx, { ...filtros, page: 999 })).page).toBe(2);
    expect((await listarItens(ctx, { ...filtros, assignee: "none" })).total).toBe(0);
    expect((await listarItens(ctx, { ...filtros, system: "NONE" })).total).toBe(0);
    expect((await listarItens(ctx, { ...filtros, status: "DONE" })).total).toBe(0);
    const urgent = id(await salvarItem(criar({ title: prefixo + " urgente", priority: 3, dueDate: "2019-01-01" })));
    const low = id(await salvarItem(criar({ title: prefixo + " baixa", priority: 0, dueDate: "2018-01-01" })));
    const todos = await listarItens(ctx, lerFiltros({ q: prefixo })); expect(todos.items[0].id).toBe(urgent); expect(todos.items.some(i => i.id === low)).toBe(false);
  });
});
