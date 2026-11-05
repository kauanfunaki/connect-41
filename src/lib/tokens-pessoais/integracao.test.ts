import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { PrismaClient } from "@/generated/prisma/client";
import { PrismaMariaDb } from "@prisma/adapter-mariadb";
import type { AuthContext } from "@/lib/auth/context";

// De ponta a ponta num MySQL descartável (05/11/2026): o token criado como na
// tela, a API e o MCP gravando pelo servidor do Controle interno de verdade,
// com o histórico e a Auditoria no nome da pessoa do token. Só roda com
// TOKENS_TEST_DATABASE_URL apontando para um banco local de teste.

const url = process.env.TOKENS_TEST_DATABASE_URL;
const destino = url ? new URL(url) : null;
const banco = destino?.pathname.slice(1);
if (destino && (!["127.0.0.1", "localhost"].includes(destino.hostname) || !(banco === "connect41" || banco?.startsWith("connect41_verificacao")) || (banco === "connect41" && destino.port !== "33379"))) {
  throw new Error("Banco não isolado recusado.");
}
const db = destino ? new PrismaClient({ adapter: new PrismaMariaDb({
  host: destino.hostname, port: Number(destino.port), user: decodeURIComponent(destino.username), password: decodeURIComponent(destino.password),
  database: banco, allowPublicKeyRetrieval: true,
}) }) : null;
vi.mock("@/lib/prisma", () => ({ getPrisma: () => { if (!db) throw new Error("Banco descartável não configurado."); return db; } }));

import { criarTokenPessoal, revogarTokenPessoal, listarMeusTokens, listarTokensDoEscritorio } from "./servidor";
import * as colecao from "@/app/api/v1/controle-interno/route";
import * as umItem from "@/app/api/v1/controle-interno/[id]/route";
import * as situacao from "@/app/api/v1/controle-interno/[id]/situacao/route";
import * as comentarios from "@/app/api/v1/controle-interno/[id]/comentarios/route";
import { POST as mcp } from "@/app/api/mcp/route";

describe.skipIf(!url)("token pessoal com MySQL descartável", () => {
  const tenantId = randomUUID(), outroTenant = randomUUID();
  let tech: string, leitor: string, externo: string;
  const contexto = (userId: string, role: AuthContext["role"] = "SECTOR_USER", tenant = tenantId): AuthContext => ({ userId, tenantId: tenant, homeTenantId: tenant, role, sectors: ["tech"], subscriptionReadOnly: false, canSelfRegularizeSubscription: false, activeSector: null });
  const novoUsuario = async (tenant: string, role: AuthContext["role"], name: string) => {
    const id = randomUUID();
    await db!.user.create({ data: { id, tenantId: tenant, name, email: `${id}@example.test`, passwordHash: "sem-login-real", role, sectors: { create: { sectorCode: "tech" } } } });
    return id;
  };
  const chamada = (caminho: string, token: string, metodo = "GET", corpo?: unknown) => new Request(`https://connect.example.test/api/v1/controle-interno${caminho}`, {
    method: metodo, headers: { authorization: `Bearer ${token}`, ...(corpo ? { "content-type": "application/json" } : {}) }, ...(corpo ? { body: JSON.stringify(corpo) } : {}),
  });
  const params = (id: string) => ({ params: Promise.resolve({ id }) });

  beforeAll(async () => {
    for (const t of [tenantId, outroTenant]) {
      await db!.tenant.create({ data: { id: t, name: "Escritório fictício", slug: t } });
      await db!.sector.create({ data: { tenantId: t, code: "tech", label: "Tech" } });
      await db!.tenantModule.create({ data: { tenantId: t, moduleCode: "tech_controle_interno", enabled: true } });
    }
    tech = await novoUsuario(tenantId, "SECTOR_USER", "Pessoa fictícia da Tech");
    leitor = await novoUsuario(tenantId, "READONLY", "Pessoa fictícia só leitura");
    externo = await novoUsuario(outroTenant, "SECTOR_USER", "Pessoa fictícia de fora");
  });
  afterAll(async () => {
    if (!db) return;
    for (const t of [tenantId, outroTenant]) {
      await db.techInternalComment.deleteMany({ where: { tenantId: t } }); await db.techInternalChange.deleteMany({ where: { tenantId: t } });
      await db.techInternalItem.deleteMany({ where: { tenantId: t } }); await db.personalApiToken.deleteMany({ where: { tenantId: t } });
      await db.userSector.deleteMany({ where: { user: { tenantId: t } } }); await db.auditLog.deleteMany({ where: { tenantId: t } });
      await db.user.deleteMany({ where: { tenantId: t } }); await db.tenantModule.deleteMany({ where: { tenantId: t } });
      await db.sector.deleteMany({ where: { tenantId: t } }); await db.tenant.delete({ where: { id: t } });
    }
    await db.$disconnect();
  });

  it("cria pelo token, com histórico e Auditoria no nome da pessoa, e respeita a version", async () => {
    const { token } = await criarTokenPessoal(contexto(tech), { name: "Claude Code", scopes: ["controle-interno:escrever"], days: 30 });
    const criado = await colecao.POST(chamada("", token, "POST", { title: "Item fictício pela API", type: "BUG", assigneeId: "me", priority: 2 }));
    expect(criado.status).toBe(201);
    const item = await criado.json();
    expect(item).toMatchObject({ title: "Item fictício pela API", assignee: { id: tech }, priority: 2, version: 0, history: [{ author: "Pessoa fictícia da Tech" }] });

    const auditoria = await db!.auditLog.findFirst({ where: { tenantId, action: "tech_interno.item.create", entityId: item.id } });
    expect(auditoria?.metadata).toMatchObject({ via: "token pessoal", token: "Claude Code" });
    expect(auditoria?.userId).toBe(tech);

    const editado = await umItem.PATCH(chamada(`/${item.id}`, token, "PATCH", { description: "Descrição fictícia.", version: 0 }), params(item.id));
    expect(await editado.json()).toMatchObject({ description: "Descrição fictícia.", version: 1, priority: 2, assignee: { id: tech } });
    const conflito = await umItem.PATCH(chamada(`/${item.id}`, token, "PATCH", { title: "Por cima", version: 0 }), params(item.id));
    expect(conflito.status).toBe(409);

    const movido = await situacao.POST(chamada(`/${item.id}/situacao`, token, "POST", { status: "IN_PROGRESS" }), params(item.id));
    expect(await movido.json()).toMatchObject({ status: "IN_PROGRESS", version: 2, history: [{ version: 2, author: "Pessoa fictícia da Tech" }, {}, {}] });

    const comentario = await comentarios.POST(chamada(`/${item.id}/comentarios`, token, "POST", { body: "Comentário fictício pela API." }), params(item.id));
    expect(comentario.status).toBe(201);
    expect(await comentario.json()).toMatchObject({ author: "Pessoa fictícia da Tech", body: "Comentário fictício pela API." });

    const lista = await (await colecao.GET(chamada("?assignee=me&q=fictício pela API", token))).json();
    expect(lista.items.map((i: { id: string }) => i.id)).toContain(item.id);

    const pelaIa = await mcp(new Request("https://connect.example.test/api/mcp", {
      method: "POST",
      headers: { authorization: `Bearer ${token}`, "content-type": "application/json", accept: "application/json, text/event-stream" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/call", params: { name: "ver_item", arguments: { id: item.id } } }),
    }));
    const { result } = await pelaIa.json();
    expect(JSON.parse(result.content[0].text)).toMatchObject({ id: item.id, version: 2, comments: [{ body: "Comentário fictício pela API." }] });

    const [meus] = await listarMeusTokens(contexto(tech));
    expect(meus.lastUsedAt).not.toBeNull();
  });

  it("o token de outro escritório não acha o item; revogado e sem escopo param na hora", async () => {
    const { token } = await criarTokenPessoal(contexto(tech), { name: "Script", scopes: ["controle-interno:escrever"], days: 30 });
    const item = await (await colecao.POST(chamada("", token, "POST", { title: "Outro item fictício", type: "FEATURE" }))).json();

    const deFora = await criarTokenPessoal(contexto(externo, "SECTOR_USER", outroTenant), { name: "De fora", scopes: ["controle-interno:escrever"], days: 30 });
    expect((await umItem.GET(chamada(`/${item.id}`, deFora.token), params(item.id))).status).toBe(404);
    expect((await umItem.PATCH(chamada(`/${item.id}`, deFora.token, "PATCH", { title: "Invasão" }), params(item.id))).status).toBe(404);

    const soLer = await criarTokenPessoal(contexto(tech), { name: "Só ler", scopes: ["controle-interno:ler"], days: 30 });
    expect((await colecao.POST(chamada("", soLer.token, "POST", { title: "x", type: "BUG" }))).status).toBe(403);

    // READONLY lê, mas não cria token de escrita.
    await expect(criarTokenPessoal(contexto(leitor, "READONLY"), { name: "x", scopes: ["controle-interno:escrever"], days: 30 })).rejects.toMatchObject({ code: "forbidden" });

    // O administrador vê os ativos do escritório e revoga o de outra pessoa.
    const admin = await novoUsuario(tenantId, "ADMIN", "Administrador fictício");
    const doEscritorio = await listarTokensDoEscritorio(contexto(admin, "ADMIN"));
    const alvo = doEscritorio!.find(t => t.name === "Script")!;
    await revogarTokenPessoal(contexto(admin, "ADMIN"), alvo.id);
    const depois = await colecao.GET(chamada("", token));
    expect(depois.status).toBe(401);
    expect((await depois.json()).error.code).toBe("revoked_token");

    // Vencido.
    await db!.personalApiToken.updateMany({ where: { tenantId, name: "Só ler" }, data: { expiresAt: new Date(Date.now() - 1000) } });
    expect((await (await colecao.GET(chamada("", soLer.token))).json()).error.code).toBe("expired_token");

    // Módulo desligado.
    await db!.tenantModule.updateMany({ where: { tenantId: outroTenant }, data: { enabled: false } });
    expect((await (await colecao.GET(chamada("", deFora.token))).json()).error.code).toBe("module_disabled");
  });
});
