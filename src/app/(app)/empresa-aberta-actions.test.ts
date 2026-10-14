import { beforeEach, describe, expect, it, vi } from "vitest";

// O que se testa: a ação só grava para quem está logado, com o tenant da
// sessão, e descarta o que não é um id.
const gravarUltimaEmpresa = vi.fn(async () => true);
vi.mock("@/lib/empresas/ultimaEmpresa", () => ({ gravarUltimaEmpresa }));
let ctx = { userId: "u1", tenantId: "t1" };
vi.mock("@/lib/auth/context", () => ({ getAuthContext: async () => ctx }));

const { registrarEmpresaAberta } = await import("./empresa-aberta-actions");

beforeEach(() => {
  vi.clearAllMocks();
  ctx = { userId: "u1", tenantId: "t1" };
});

describe("registrarEmpresaAberta", () => {
  it("grava com a sessão de quem chamou", async () => {
    expect(await registrarEmpresaAberta("bld")).toEqual({ ok: true });
    expect(gravarUltimaEmpresa).toHaveBeenCalledWith(ctx, "bld");
  });

  it("descarta o que não é id", async () => {
    expect(await registrarEmpresaAberta("")).toEqual({ ok: false });
    expect(await registrarEmpresaAberta(42 as unknown as string)).toEqual({ ok: false });
    expect(await registrarEmpresaAberta("x".repeat(500))).toEqual({ ok: false });
    expect(gravarUltimaEmpresa).not.toHaveBeenCalled();
  });

  it("sem sessão, não grava", async () => {
    ctx = { userId: "", tenantId: "t1" };
    expect(await registrarEmpresaAberta("bld")).toEqual({ ok: false });
    expect(gravarUltimaEmpresa).not.toHaveBeenCalled();
  });
});
