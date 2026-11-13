import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import crypto from "crypto";
import jwt from "jsonwebtoken";
import { NextRequest } from "next/server";

// A renovação da sessão (13/11/2026, bug-693): rotação do refresh token com
// tolerância a pedidos simultâneos. O banco é um mapa em memória com o que a
// rotação depende dele: chave primária (o segundo `create` com o mesmo id
// recebe P2002) e as datas guardadas como vieram.

type Registro = { id: string; userId: string; tokenHash: string; expiresAt: Date; createdAt: Date; revokedAt: Date | null };

const m = vi.hoisted(() => ({
  tokens: new Map<string, Registro>(),
  usuarioAtivo: true,
}));

const copia = (r: Registro | undefined) => (r ? { ...r } : null);
const casa = (r: Registro, where: { id: string | { in: string[] }; revokedAt?: null; userId?: string }) =>
  (typeof where.id === "string" ? r.id === where.id : where.id.in.includes(r.id)) &&
  (where.revokedAt !== null || r.revokedAt === null) &&
  (where.userId === undefined || r.userId === where.userId);

const db = {
  refreshToken: {
    findUnique: async ({ where }: { where: { id: string } }) => copia(m.tokens.get(where.id)),
    create: async ({ data }: { data: Omit<Registro, "revokedAt" | "createdAt"> & { createdAt?: Date } }) => {
      if (m.tokens.has(data.id)) throw Object.assign(new Error("Unique constraint failed"), { code: "P2002" });
      const r: Registro = { createdAt: new Date(), ...data, revokedAt: null };
      m.tokens.set(r.id, r);
      return copia(r);
    },
    updateMany: async ({ where, data }: { where: Parameters<typeof casa>[1]; data: { revokedAt: Date } }) => {
      let count = 0;
      for (const r of m.tokens.values()) {
        if (casa(r, where)) {
          r.revokedAt = data.revokedAt;
          count++;
        }
      }
      return { count };
    },
  },
  user: {
    findUnique: async ({ where }: { where: { id: string; active: boolean } }) =>
      where.id === "u1" && m.usuarioAtivo
        ? { id: "u1", tenantId: "t1", role: "SECTOR_USER", sectors: [{ sectorCode: "bpo" }, { sectorCode: "fiscal" }] }
        : null,
  },
};

vi.mock("@/lib/prisma", () => ({ getPrisma: () => db }));
vi.mock("@/lib/auth/tenantAccess", () => ({ getAccessibleTenantIds: async () => [] }));

import { TOLERANCIA_MS, idDoSucessor, renovarSessao } from "./renovacao";
import { REFRESH_MAX_AGE } from "./cookies";
import { POST as sair } from "@/app/api/auth/logout/route";

const ACCESS = "segredo-do-access";
const REFRESH = "segredo-do-refresh";

beforeAll(() => {
  process.env.JWT_ACCESS_SECRET = ACCESS;
  process.env.JWT_REFRESH_SECRET = REFRESH;
});

beforeEach(() => {
  m.tokens.clear();
  m.usuarioAtivo = true;
});

const hash = (raw: string) => crypto.createHash("sha256").update(raw).digest("hex");

/** Um refresh token como o login grava: 7 dias, no banco pelo hash. */
function entrar(agora = new Date()): { jti: string; raw: string } {
  const jti = crypto.randomUUID();
  const raw = jwt.sign({ sub: "u1", jti }, REFRESH, { expiresIn: "7d" });
  m.tokens.set(jti, { id: jti, userId: "u1", tokenHash: hash(raw), createdAt: agora, expiresAt: new Date(agora.getTime() + 7 * 86_400_000), revokedAt: null });
  return { jti, raw };
}

const depois = (base: Date, ms: number) => new Date(base.getTime() + ms);

describe("renovar a sessão", () => {
  it("devolve o access token da pessoa e o sucessor, e revoga o usado", async () => {
    const agora = new Date();
    const { jti, raw } = entrar(agora);
    const r = await renovarSessao(raw, agora);
    if (!r.ok) throw new Error("não renovou");

    expect(jwt.verify(r.accessToken, ACCESS)).toMatchObject({ sub: "u1", tenantId: "t1", role: "SECTOR_USER", sectors: ["bpo", "fiscal"] });
    expect(jwt.verify(r.refresh.token, REFRESH)).toMatchObject({ sub: "u1", jti: idDoSucessor(jti) });
    expect(r.refresh.maxAge).toBe(REFRESH_MAX_AGE);
    expect(m.tokens.get(jti)!.revokedAt).not.toBeNull();
    expect(m.tokens.get(idDoSucessor(jti))).toMatchObject({ tokenHash: hash(r.refresh.token), revokedAt: null });
  });

  it("o sucessor renova de novo, e assim por diante", async () => {
    const agora = new Date();
    const r1 = await renovarSessao(entrar(agora).raw, agora);
    if (!r1.ok) throw new Error("não renovou");
    const daqui10min = depois(agora, 10 * 60_000);
    const r2 = await renovarSessao(r1.refresh.token, daqui10min);
    expect(r2.ok).toBe(true);
    expect(m.tokens.size).toBe(3);
  });

  it("recusa sem token, com assinatura de outra chave, fora do banco, com hash diferente, vencido ou com a conta inativa", async () => {
    const agora = new Date();
    expect(await renovarSessao(undefined, agora)).toEqual({ ok: false });
    expect(await renovarSessao(jwt.sign({ sub: "u1", jti: "x" }, "outra-chave"), agora)).toEqual({ ok: false });
    expect(await renovarSessao(jwt.sign({ sub: "u1", jti: "fora-do-banco" }, REFRESH), agora)).toEqual({ ok: false });

    const trocado = entrar(agora);
    m.tokens.get(trocado.jti)!.tokenHash = "outro";
    expect(await renovarSessao(trocado.raw, agora)).toEqual({ ok: false });

    const vencido = entrar(agora);
    m.tokens.get(vencido.jti)!.expiresAt = depois(agora, -1000);
    expect(await renovarSessao(vencido.raw, agora)).toEqual({ ok: false });

    m.usuarioAtivo = false;
    expect(await renovarSessao(entrar(agora).raw, agora)).toEqual({ ok: false });
  });
});

describe("o mesmo refresh token em mais de um pedido (página e prefetchs, duas abas)", () => {
  it("seis ao mesmo tempo: todos renovam, com o MESMO sucessor, e só um é gravado", async () => {
    const agora = new Date();
    const { jti, raw } = entrar(agora);
    const rs = await Promise.all(Array.from({ length: 6 }, () => renovarSessao(raw, agora)));

    expect(rs.every((r) => r.ok)).toBe(true);
    expect(new Set(rs.map((r) => (r.ok ? r.refresh.token : null))).size).toBe(1);
    expect([...m.tokens.keys()].sort()).toEqual([jti, idDoSucessor(jti)].sort());
    expect(m.tokens.get(jti)!.revokedAt).not.toBeNull();
  });

  it("o usado logo depois (dentro da tolerância) ainda renova, com o mesmo sucessor e sem gravar nada", async () => {
    const agora = new Date();
    const { raw } = entrar(agora);
    const primeiro = await renovarSessao(raw, agora);
    const segundo = await renovarSessao(raw, depois(agora, TOLERANCIA_MS - 1000));

    expect(segundo.ok).toBe(true);
    expect(segundo.ok && primeiro.ok && segundo.refresh.token).toBe(primeiro.ok && primeiro.refresh.token);
    expect(m.tokens.size).toBe(2);
  });

  it("depois da tolerância, o usado não renova mais", async () => {
    const agora = new Date();
    const { raw } = entrar(agora);
    await renovarSessao(raw, agora);
    expect(await renovarSessao(raw, depois(agora, TOLERANCIA_MS + 1000))).toEqual({ ok: false });
  });

  it("nem dentro da tolerância se o sucessor já foi renovado (só um passo para trás)", async () => {
    const agora = new Date();
    const { raw } = entrar(agora);
    const r1 = await renovarSessao(raw, agora);
    if (!r1.ok) throw new Error("não renovou");
    await renovarSessao(r1.refresh.token, depois(agora, 1000));
    expect(await renovarSessao(raw, depois(agora, 2000))).toEqual({ ok: false });
  });

  it("revogado sem sucessor (troca de senha, desativação, sair) não renova", async () => {
    const agora = new Date();
    const { jti, raw } = entrar(agora);
    m.tokens.get(jti)!.revokedAt = agora;
    expect(await renovarSessao(raw, depois(agora, 1000))).toEqual({ ok: false });
  });

  it("trocar a senha (todos os tokens revogados) acaba com a tolerância", async () => {
    const agora = new Date();
    const { raw } = entrar(agora);
    await renovarSessao(raw, agora);
    await db.refreshToken.updateMany({ where: { id: { in: [...m.tokens.keys()] }, revokedAt: null }, data: { revokedAt: agora } });
    expect(await renovarSessao(raw, depois(agora, 1000))).toEqual({ ok: false });
  });
});

describe("sair (logout) com um token que outro pedido acabou de renovar", () => {
  function sairCom(raw: string) {
    return sair(new NextRequest("http://localhost/api/auth/logout", { method: "POST", headers: { cookie: `refresh_token=${raw}` } }));
  }

  it("revoga o sucessor junto: nem o usado nem o sucessor renovam depois", async () => {
    const { jti, raw } = entrar();
    const r = await renovarSessao(raw);
    if (!r.ok) throw new Error("não renovou");

    expect((await sairCom(raw)).status).toBe(200);
    expect(m.tokens.get(idDoSucessor(jti))!.revokedAt).not.toBeNull();
    expect(await renovarSessao(raw)).toEqual({ ok: false });
    expect(await renovarSessao(r.refresh.token)).toEqual({ ok: false });
  });

  it("sair com o sucessor também derruba a tolerância do usado", async () => {
    const { raw } = entrar();
    const r = await renovarSessao(raw);
    if (!r.ok) throw new Error("não renovou");
    await sairCom(r.refresh.token);
    expect(await renovarSessao(raw)).toEqual({ ok: false });
  });
});
