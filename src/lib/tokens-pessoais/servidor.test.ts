import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AuthContext } from "@/lib/auth/context";

// A autenticação e o ciclo do token pessoal com um banco de mentira: o que
// importa aqui é a régua (vencido, revogado, de outro escritório, sem escopo,
// módulo desligado), não o SQL.

const m = vi.hoisted(() => ({
  findUnique: vi.fn(), updateMany: vi.fn(), count: vi.fn(), create: vi.fn(), findFirst: vi.fn(), findMany: vi.fn(),
  moduloLigado: vi.fn(), podeNoModulo: vi.fn(), audit: vi.fn(),
}));
vi.mock("@/lib/prisma", () => ({
  getPrisma: () => ({ personalApiToken: { findUnique: m.findUnique, updateMany: m.updateMany, count: m.count, create: m.create, findFirst: m.findFirst, findMany: m.findMany } }),
}));
vi.mock("@/lib/modules", () => ({ isModuleEnabled: m.moduloLigado }));
vi.mock("@/lib/auth/modulo", () => ({ podeNoModulo: m.podeNoModulo }));
vi.mock("@/lib/audit", () => ({ logAudit: m.audit }));

import { autenticarTokenPessoal, criarTokenPessoal, hashDoToken, revogarTokenPessoal } from "./servidor";
import { ErroApi } from "@/lib/api-v1/erros";

const TOKEN = `c41_${"cd".repeat(32)}`;
const AGORA = Date.now();
const pedido = (authorization?: string) => new Request("http://localhost/api/v1/controle-interno", { headers: authorization ? { authorization } : {} });
function registro(sobre: Record<string, unknown> = {}) {
  return {
    id: "tok-1", tenantId: "esc-a", name: "Claude Code", scopes: "controle-interno:ler,controle-interno:escrever",
    expiresAt: new Date(AGORA + 30 * 864e5), revokedAt: null, lastUsedAt: null,
    tenant: { active: true, subscription: { status: "ACTIVE" } },
    user: { id: "pessoa-1", tenantId: "esc-a", active: true, role: "SECTOR_USER", sectors: [{ sectorCode: "tech" }] },
    ...sobre,
  };
}
async function codigo(p: Promise<unknown>) {
  try { await p; return "ok"; } catch (e) { return e instanceof ErroApi ? `${e.status} ${e.code}` : String(e); }
}

beforeEach(() => {
  vi.clearAllMocks();
  m.moduloLigado.mockResolvedValue(true);
  m.podeNoModulo.mockResolvedValue(true);
  m.updateMany.mockResolvedValue({ count: 1 });
  m.findUnique.mockResolvedValue(registro());
});

describe("autenticar pelo token pessoal", () => {
  it("procura pelo hash, nunca pelo token, e devolve a pessoa com o papel e os setores de hoje", async () => {
    const ator = await autenticarTokenPessoal(pedido(`Bearer ${TOKEN}`), "controle-interno:escrever");
    expect(m.findUnique.mock.calls[0][0].where).toEqual({ tokenHash: hashDoToken(TOKEN) });
    expect(JSON.stringify(m.findUnique.mock.calls)).not.toContain(TOKEN);
    expect(ator).toMatchObject({
      userId: "pessoa-1", tenantId: "esc-a", homeTenantId: "esc-a", role: "SECTOR_USER", sectors: ["tech"],
      subscriptionReadOnly: false, activeSector: null, via: { tokenId: "tok-1", tokenName: "Claude Code" },
      escopos: ["controle-interno:ler", "controle-interno:escrever"],
    });
    expect(m.updateMany).toHaveBeenCalledWith({ where: { id: "tok-1" }, data: { lastUsedAt: expect.any(Date) } });
  });

  it("sem cabeçalho, ou fora do formato, nem consulta o banco", async () => {
    expect(await codigo(autenticarTokenPessoal(pedido()))).toBe("401 unauthenticated");
    expect(await codigo(autenticarTokenPessoal(pedido(`Bearer ops_${"cd".repeat(32)}`)))).toBe("401 unauthenticated");
    expect(await codigo(autenticarTokenPessoal(pedido(`Basic ${TOKEN}`)))).toBe("401 unauthenticated");
    expect(m.findUnique).not.toHaveBeenCalled();
  });

  it("token desconhecido", async () => {
    m.findUnique.mockResolvedValue(null);
    expect(await codigo(autenticarTokenPessoal(pedido(`Bearer ${TOKEN}`)))).toBe("401 invalid_token");
  });

  it("token vencido", async () => {
    m.findUnique.mockResolvedValue(registro({ expiresAt: new Date(AGORA - 1000) }));
    const e = await autenticarTokenPessoal(pedido(`Bearer ${TOKEN}`)).catch(x => x as ErroApi);
    expect(e).toMatchObject({ status: 401, code: "expired_token" });
    expect((e as ErroApi).message).toMatch(/venceu em \d{2}\/\d{2}\/\d{4}/);
  });

  it("token revogado, mesmo dentro da validade", async () => {
    m.findUnique.mockResolvedValue(registro({ revokedAt: new Date(AGORA - 864e5) }));
    expect(await codigo(autenticarTokenPessoal(pedido(`Bearer ${TOKEN}`)))).toBe("401 revoked_token");
  });

  it("pessoa inativa, ou que hoje é de outro escritório, não age pelo token", async () => {
    m.findUnique.mockResolvedValue(registro({ user: { ...registro().user, active: false } }));
    expect(await codigo(autenticarTokenPessoal(pedido(`Bearer ${TOKEN}`)))).toBe("401 invalid_token");
    m.findUnique.mockResolvedValue(registro({ user: { ...registro().user, tenantId: "esc-b" } }));
    expect(await codigo(autenticarTokenPessoal(pedido(`Bearer ${TOKEN}`)))).toBe("401 invalid_token");
  });

  it("o escritório vem do token: o ator de um token do escritório B só enxerga o B", async () => {
    m.findUnique.mockResolvedValue(registro({ tenantId: "esc-b", user: { ...registro().user, tenantId: "esc-b" } }));
    const ator = await autenticarTokenPessoal(pedido(`Bearer ${TOKEN}`));
    expect(ator.tenantId).toBe("esc-b");
    expect(m.moduloLigado).toHaveBeenCalledWith("esc-b", "tech_controle_interno");
  });

  it("escritório inativo ou assinatura somente leitura", async () => {
    m.findUnique.mockResolvedValue(registro({ tenant: { active: false, subscription: { status: "ACTIVE" } } }));
    expect(await codigo(autenticarTokenPessoal(pedido(`Bearer ${TOKEN}`)))).toBe("403 office_unavailable");
    for (const status of ["PAST_DUE", "CANCELED"]) {
      m.findUnique.mockResolvedValue(registro({ tenant: { active: true, subscription: { status } } }));
      expect(await codigo(autenticarTokenPessoal(pedido(`Bearer ${TOKEN}`))), status).toBe("403 office_unavailable");
    }
  });

  it("módulo desligado", async () => {
    m.moduloLigado.mockResolvedValue(false);
    expect(await codigo(autenticarTokenPessoal(pedido(`Bearer ${TOKEN}`)))).toBe("403 module_disabled");
  });

  it("sem o escopo pedido", async () => {
    m.findUnique.mockResolvedValue(registro({ scopes: "controle-interno:ler" }));
    expect(await codigo(autenticarTokenPessoal(pedido(`Bearer ${TOKEN}`), "controle-interno:escrever"))).toBe("403 insufficient_scope");
    expect(await codigo(autenticarTokenPessoal(pedido(`Bearer ${TOKEN}`), "controle-interno:ler"))).toBe("ok");
  });

  // O ranking da Academia (10/11/2026): o escopo próprio, e o módulo que vale é
  // o da Academia — não o do Controle interno.
  it("o ranking da Academia pede o escopo academia:ler e a Academia ligada", async () => {
    m.findUnique.mockResolvedValue(registro({ scopes: "academia:ler" }));
    expect(await codigo(autenticarTokenPessoal(pedido(`Bearer ${TOKEN}`), "academia:ler"))).toBe("ok");
    expect(m.moduloLigado).toHaveBeenLastCalledWith("esc-a", "academia");
    // O token só da Academia não abre o Controle interno.
    expect(await codigo(autenticarTokenPessoal(pedido(`Bearer ${TOKEN}`), "controle-interno:ler"))).toBe("403 insufficient_scope");
    // Academia desligada derruba; o Controle interno desligado não importa aqui.
    m.moduloLigado.mockImplementation((_t: string, modulo: string) => Promise.resolve(modulo !== "academia"));
    expect(await codigo(autenticarTokenPessoal(pedido(`Bearer ${TOKEN}`), "academia:ler"))).toBe("403 module_disabled");
    m.moduloLigado.mockImplementation((_t: string, modulo: string) => Promise.resolve(modulo === "academia"));
    expect(await codigo(autenticarTokenPessoal(pedido(`Bearer ${TOKEN}`), "academia:ler"))).toBe("ok");
  });

  it("o token do Controle interno não lê o ranking da Academia", async () => {
    expect(await codigo(autenticarTokenPessoal(pedido(`Bearer ${TOKEN}`), "academia:ler"))).toBe("403 insufficient_scope");
  });

  it("o último uso grava no máximo uma vez por minuto, e falhar ao gravar não barra a chamada", async () => {
    m.findUnique.mockResolvedValue(registro({ lastUsedAt: new Date(AGORA - 5_000) }));
    await autenticarTokenPessoal(pedido(`Bearer ${TOKEN}`));
    expect(m.updateMany).not.toHaveBeenCalled();
    m.findUnique.mockResolvedValue(registro({ lastUsedAt: new Date(AGORA - 120_000) }));
    m.updateMany.mockRejectedValue(new Error("banco ocupado"));
    expect(await codigo(autenticarTokenPessoal(pedido(`Bearer ${TOKEN}`)))).toBe("ok");
  });
});

describe("criar e revogar", () => {
  const ctx = (sobre: Partial<AuthContext> = {}): AuthContext => ({
    userId: "pessoa-1", tenantId: "esc-a", homeTenantId: "esc-a", role: "SECTOR_USER", sectors: ["tech"],
    subscriptionReadOnly: false, canSelfRegularizeSubscription: false, activeSector: null, ...sobre,
  });
  const salvo = (dados: Record<string, unknown>) => ({
    id: "tok-novo", name: dados.name, hint: dados.hint, scopes: dados.scopes, expiresAt: dados.expiresAt, lastUsedAt: null,
    createdAt: new Date(AGORA), revokedAt: null, userId: dados.userId, user: { name: "Pessoa fictícia" },
  });

  it("devolve o token uma vez e grava só o hash e a pista", async () => {
    m.count.mockResolvedValue(0);
    m.create.mockImplementation(({ data }) => Promise.resolve(salvo(data)));
    const r = await criarTokenPessoal(ctx(), { name: "Claude Code", scopes: ["controle-interno:escrever"], days: 30 });
    expect(r.token).toMatch(/^c41_[a-f0-9]{64}$/);
    const data = m.create.mock.calls[0][0].data;
    expect(data.tokenHash).toBe(hashDoToken(r.token));
    expect(JSON.stringify(data)).not.toContain(r.token);
    expect(data.scopes).toBe("controle-interno:ler,controle-interno:escrever");
    expect(Math.round((data.expiresAt.getTime() - Date.now()) / 864e5)).toBe(30);
    expect(r.registro).toMatchObject({ situacao: "ativo", proprio: true });
    expect(JSON.stringify(m.audit.mock.calls)).not.toContain(r.token);
  });

  it("não cria escopo que a pessoa não alcança, nem no escritório de outra pessoa", async () => {
    m.podeNoModulo.mockImplementation((_c, _m, nivel) => Promise.resolve(nivel === "ver"));
    expect(await codigo(criarTokenPessoal(ctx(), { name: "x", scopes: ["controle-interno:escrever"], days: 30 }))).toBe("403 forbidden");
    expect(await codigo(criarTokenPessoal(ctx({ tenantId: "esc-b" }), { name: "x", scopes: ["controle-interno:ler"], days: 30 }))).toBe("403 forbidden");
    expect(m.create).not.toHaveBeenCalled();
  });

  it("o token do ranking da Academia só nasce com a Academia ligada", async () => {
    m.count.mockResolvedValue(0);
    m.create.mockImplementation(({ data }) => Promise.resolve(salvo(data)));
    m.moduloLigado.mockResolvedValue(false);
    expect(await codigo(criarTokenPessoal(ctx(), { name: "n8n", scopes: ["academia:ler"], days: 90 }))).toBe("403 forbidden");
    m.moduloLigado.mockResolvedValue(true);
    const r = await criarTokenPessoal(ctx(), { name: "n8n", scopes: ["academia:ler"], days: 90 });
    expect(r.registro.scopes).toEqual(["academia:ler"]);
  });

  it("para no teto de tokens ativos", async () => {
    m.count.mockResolvedValue(20);
    expect(await codigo(criarTokenPessoal(ctx(), { name: "x", scopes: ["controle-interno:ler"], days: 30 }))).toBe("422 validation_error");
  });

  it("a pessoa revoga o próprio; o de outra só o administrador", async () => {
    const atual = { id: "tok-1", name: "Cursor", hint: "c41_…", scopes: "controle-interno:ler", expiresAt: new Date(AGORA + 864e5), lastUsedAt: null, createdAt: new Date(AGORA), revokedAt: null, userId: "pessoa-2", user: { name: "Outra pessoa" } };
    m.findFirst.mockResolvedValue(atual);
    expect(await codigo(revogarTokenPessoal(ctx(), "tok-1"))).toBe("404 not_found");
    expect(m.updateMany).not.toHaveBeenCalled();
    const r = await revogarTokenPessoal(ctx({ role: "ADMIN" }), "tok-1");
    expect(r.situacao).toBe("revogado");
    expect(m.updateMany).toHaveBeenCalledWith({ where: { id: "tok-1", tenantId: "esc-a", revokedAt: null }, data: { revokedAt: expect.any(Date), revokedById: "pessoa-1" } });
    expect(m.findFirst.mock.calls[0][0].where).toEqual({ id: "tok-1", tenantId: "esc-a" });
  });
});
