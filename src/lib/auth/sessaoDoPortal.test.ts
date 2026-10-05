import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import jwt from "jsonwebtoken";
import { verifyAccess, verifyPortalAccess } from "./jwt";
import { PORTAL_COOKIE } from "./portal";
import {
  cookieDaSessaoDoPortal,
  duracaoDaSessaoDoPortal,
  querLembrar,
  SESSAO_LEMBRADA_SEGUNDOS,
  SESSAO_PADRAO_SEGUNDOS,
} from "./sessaoDoPortal";

const CONTA = { id: "pu1", tenantId: "t1", clientGroupId: "g1" };
const ENTROU = new Date("2026-10-05T12:00:00Z");
const HORA = 60 * 60 * 1000;
const DIA = 24 * HORA;

beforeAll(() => {
  process.env.JWT_ACCESS_SECRET = "segredo-de-teste";
  delete process.env.PORTAL_ACCESS_TTL;
});

afterEach(() => {
  vi.useRealTimers();
});

function entrarEm(quando: Date, lembrar: boolean) {
  vi.useFakeTimers();
  vi.setSystemTime(quando);
  return cookieDaSessaoDoPortal(CONTA, lembrar);
}

function valeEm(token: string, quando: Date): boolean {
  vi.setSystemTime(quando);
  try {
    verifyPortalAccess(token);
    return true;
  } catch {
    return false;
  }
}

describe("duração da sessão do portal", () => {
  it("sem lembrar é o de sempre (12 h); com lembrar, 30 dias", () => {
    expect(duracaoDaSessaoDoPortal(false)).toEqual({ ttlDoToken: undefined, maxAgeDoCookie: 12 * 3600 });
    expect(duracaoDaSessaoDoPortal(true)).toEqual({ ttlDoToken: 30 * 86400, maxAgeDoCookie: 30 * 86400 });
    expect(SESSAO_PADRAO_SEGUNDOS).toBe(43_200);
    expect(SESSAO_LEMBRADA_SEGUNDOS).toBe(2_592_000);
  });

  it("só a caixa marcada pede para lembrar", () => {
    expect(querLembrar("1")).toBe(true);
    expect(querLembrar("on")).toBe(true);
    expect(querLembrar("0")).toBe(false);
    expect(querLembrar(null)).toBe(false);
    expect(querLembrar(undefined)).toBe(false);
  });
});

describe("o cookie e o token da sessão", () => {
  it("cookie próprio do portal, httpOnly, no site todo, com a duração escolhida", () => {
    const padrao = entrarEm(ENTROU, false);
    expect(padrao.name).toBe(PORTAL_COOKIE);
    expect(padrao.options).toMatchObject({ httpOnly: true, sameSite: "lax", path: "/", maxAge: SESSAO_PADRAO_SEGUNDOS });
    expect(entrarEm(ENTROU, true).options.maxAge).toBe(SESSAO_LEMBRADA_SEGUNDOS);
  });

  it("o token carrega a conta, o escritório e o cliente — e é de portal", () => {
    const { value } = entrarEm(ENTROU, true);
    expect(verifyPortalAccess(value)).toMatchObject({ kind: "portal", sub: "pu1", tenantId: "t1", clientGroupId: "g1" });
    // A sessão longa continua não valendo como sessão interna.
    expect(() => verifyAccess(value)).toThrow();
  });

  it("sem lembrar, o token vence em 12 h", () => {
    const { value } = entrarEm(ENTROU, false);
    expect(valeEm(value, new Date(ENTROU.getTime() + 11 * HORA))).toBe(true);
    expect(valeEm(value, new Date(ENTROU.getTime() + 13 * HORA))).toBe(false);
  });

  it("com lembrar, o mesmo verificador aceita o token por 30 dias, e não mais", () => {
    const { value } = entrarEm(ENTROU, true);
    expect(valeEm(value, new Date(ENTROU.getTime() + 13 * HORA))).toBe(true);
    expect(valeEm(value, new Date(ENTROU.getTime() + 29 * DIA))).toBe(true);
    expect(valeEm(value, new Date(ENTROU.getTime() + 31 * DIA))).toBe(false);
    const { exp, iat } = jwt.decode(value) as { exp: number; iat: number };
    expect(exp - iat).toBe(SESSAO_LEMBRADA_SEGUNDOS);
  });
});
