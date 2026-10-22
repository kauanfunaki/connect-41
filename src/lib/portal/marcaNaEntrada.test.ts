import { beforeEach, describe, expect, it, vi } from "vitest";

// A marca do escritório na entrada do portal (22/10/2026).
const m = vi.hoisted(() => ({ cookie: vi.fn(), tenant: vi.fn(), aparencia: vi.fn(), token: vi.fn(), conta: vi.fn() }));
vi.mock("next/headers", () => ({ cookies: async () => ({ get: m.cookie }) }));
vi.mock("@/lib/prisma", () => ({
  getPrisma: () => ({
    tenant: { findUnique: m.tenant },
    tenantAparencia: { findUnique: m.aparencia },
    passwordResetToken: { findFirst: m.token },
    portalUser: { findUnique: m.conta },
  }),
}));

import { APARENCIA_PADRAO } from "@/lib/aparencia/cores";
import { marcaPublicaDe } from "@/lib/aparencia/marcaPublica";
import { COOKIE_DO_ESCRITORIO, cookieDoEscritorioDoPortal, idDoCookieDoEscritorio, marcaDaEntradaDoPortal } from "./marcaNaEntrada";

const ESCRITORIO = { nome: "Contábil Fictícia", logoUrl: "/api/workspace-logos/t1.png?v=1" };

describe("marcaPublicaDe", () => {
  it("sem logo ligado nem cor, fica a marca do Connect", () => {
    expect(marcaPublicaDe({ aparencia: APARENCIA_PADRAO, escritorio: ESCRITORIO })).toBeNull();
  });
  it("logo só com 'Mostrar o logo' ligado e logo enviado", () => {
    expect(marcaPublicaDe({ aparencia: { ...APARENCIA_PADRAO, logoNoPortal: true }, escritorio: ESCRITORIO })).toEqual({ ...ESCRITORIO, corPrincipal: null });
    expect(marcaPublicaDe({ aparencia: { ...APARENCIA_PADRAO, logoNoPortal: true }, escritorio: { ...ESCRITORIO, logoUrl: null } })).toBeNull();
  });
  it("só os campos públicos: nome, logo e cor principal", () => {
    const marca = marcaPublicaDe({
      aparencia: { ...APARENCIA_PADRAO, corPrincipal: "#0E7C66", coresDosGrupos: { fiscal: "#000000" }, noConnect: true },
      escritorio: ESCRITORIO,
    });
    expect(marca).toEqual({ nome: ESCRITORIO.nome, logoUrl: null, corPrincipal: "#0E7C66" });
  });
});

describe("cookie do escritório", () => {
  it("guarda só o id, httpOnly, por um ano", () => {
    const c = cookieDoEscritorioDoPortal("t1");
    expect(c).toMatchObject({ name: COOKIE_DO_ESCRITORIO, value: "t1", options: { httpOnly: true, sameSite: "lax", path: "/" } });
    expect(c.options.maxAge).toBe(365 * 24 * 60 * 60);
  });
  it("recusa valor sem forma de id", () => {
    expect(idDoCookieDoEscritorio("t1")).toBe("t1");
    expect(idDoCookieDoEscritorio("a b")).toBeNull();
    expect(idDoCookieDoEscritorio("'; drop")).toBeNull();
    expect(idDoCookieDoEscritorio(undefined)).toBeNull();
  });
});

describe("marcaDaEntradaDoPortal", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    m.cookie.mockReturnValue(undefined);
    m.tenant.mockImplementation(({ where, select }: { where: { id: string }; select: Record<string, boolean> }) =>
      Promise.resolve(select.active ? { active: where.id !== "inativo" } : { name: `Escritório ${where.id}`, logoUrl: `/api/workspace-logos/${where.id}.png` })
    );
    m.aparencia.mockResolvedValue({ corPrincipal: "#0E7C66", coresDosGrupos: null, coresPorGrupo: true, logoNoPortal: true, noConnect: false });
  });

  it("sem cookie nem link, a marca do Connect", async () => {
    expect(await marcaDaEntradaDoPortal()).toBeNull();
    expect(m.tenant).not.toHaveBeenCalled();
  });
  it("o escritório do último login neste aparelho", async () => {
    m.cookie.mockImplementation((nome: string) => (nome === COOKIE_DO_ESCRITORIO ? { value: "t1" } : undefined));
    expect(await marcaDaEntradaDoPortal()).toEqual({ nome: "Escritório t1", logoUrl: "/api/workspace-logos/t1.png", corPrincipal: "#0E7C66" });
  });
  it("escritório desativado não aparece", async () => {
    m.cookie.mockReturnValue({ value: "inativo" });
    expect(await marcaDaEntradaDoPortal()).toBeNull();
  });
  it("o link de nova senha ganha do cookie, sem gastar o link", async () => {
    m.cookie.mockReturnValue({ value: "t1" });
    m.token.mockResolvedValue({ subject: "PORTAL_USER", userId: "conta" });
    m.conta.mockResolvedValue({ tenantId: "t2", active: true });
    expect((await marcaDaEntradaDoPortal({ token: "abc" }))?.nome).toBe("Escritório t2");
    expect(m.token).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ usedAt: null }) }));
  });
  it("link de conta interna não diz escritório: vale o cookie", async () => {
    m.cookie.mockReturnValue({ value: "t1" });
    m.token.mockResolvedValue({ subject: "USER", userId: "u" });
    expect((await marcaDaEntradaDoPortal({ token: "abc" }))?.nome).toBe("Escritório t1");
    expect(m.conta).not.toHaveBeenCalled();
  });
  it("banco fora: a marca do Connect, sem derrubar a tela", async () => {
    m.cookie.mockReturnValue({ value: "t1" });
    m.tenant.mockRejectedValue(new Error("fora"));
    expect(await marcaDaEntradaDoPortal()).toBeNull();
  });
});
