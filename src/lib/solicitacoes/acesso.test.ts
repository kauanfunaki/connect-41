import { describe, expect, it } from "vitest";
import type { AuthContext } from "@/lib/auth/context";
import { podeAgirNaSolicitacao, podeVerSolicitacao, setoresDaFila } from "./acesso";

// Perfis simulados: a conta do Kauan é administrador e vê tudo, então o que
// importa provar é o colaborador de um ou dois setores.
function ctx(role: AuthContext["role"], sectors: string[], extra: Partial<AuthContext> = {}): AuthContext {
  return {
    userId: "u1",
    tenantId: "t1",
    homeTenantId: "t1",
    role,
    sectors,
    subscriptionReadOnly: false,
    canSelfRegularizeSubscription: true,
    activeSector: null,
    ...extra,
  };
}

const doDp = { sectorCode: "dp", assigneeId: null };
const doFiscal = { sectorCode: "fiscal", assigneeId: null };

describe("acesso às solicitações", () => {
  it("colaborador de um setor vê e age só nas do setor dele", () => {
    const c = ctx("SECTOR_USER", ["dp"]);
    expect(podeVerSolicitacao(c, doDp)).toBe(true);
    expect(podeAgirNaSolicitacao(c, doDp)).toBe(true);
    expect(podeVerSolicitacao(c, doFiscal)).toBe(false);
    expect(podeAgirNaSolicitacao(c, doFiscal)).toBe(false);
    expect(setoresDaFila(c)).toEqual(["dp"]);
  });

  it("colaborador de dois setores vê as dos dois", () => {
    const c = ctx("SECTOR_USER", ["dp", "fiscal"]);
    expect(podeVerSolicitacao(c, doDp)).toBe(true);
    expect(podeVerSolicitacao(c, doFiscal)).toBe(true);
    expect(podeVerSolicitacao(c, { sectorCode: "bpo", assigneeId: null })).toBe(false);
    expect(setoresDaFila(c)).toEqual(["dp", "fiscal"]);
  });

  it("o responsável fora do setor vê e responde a que está com ele", () => {
    const c = ctx("SECTOR_USER", ["dp"]);
    const comEle = { sectorCode: "fiscal", assigneeId: "u1" };
    expect(podeVerSolicitacao(c, comEle)).toBe(true);
    expect(podeAgirNaSolicitacao(c, comEle)).toBe(true);
  });

  it("administrador vê e age em todas, e a fila dele não tem filtro de setor", () => {
    const c = ctx("ADMIN", []);
    expect(podeVerSolicitacao(c, doFiscal)).toBe(true);
    expect(podeAgirNaSolicitacao(c, doFiscal)).toBe(true);
    expect(setoresDaFila(c)).toBeNull();
  });

  it("leitura total vê tudo e não age em nada — nem como responsável", () => {
    const c = ctx("READONLY", []);
    expect(podeVerSolicitacao(c, doDp)).toBe(true);
    expect(podeAgirNaSolicitacao(c, doDp)).toBe(false);
    expect(podeAgirNaSolicitacao(c, { sectorCode: "dp", assigneeId: "u1" })).toBe(false);
  });

  it("assinatura travada vê e não age", () => {
    const c = ctx("SECTOR_USER", ["dp"], { subscriptionReadOnly: true });
    expect(podeVerSolicitacao(c, doDp)).toBe(true);
    expect(podeAgirNaSolicitacao(c, doDp)).toBe(false);
    expect(podeAgirNaSolicitacao(c, { sectorCode: "fiscal", assigneeId: "u1" })).toBe(false);
  });

  it("sem usuário (sessão sem id) não vira responsável de nada", () => {
    const c = ctx("SECTOR_USER", ["dp"], { userId: "" });
    expect(podeVerSolicitacao(c, { sectorCode: "fiscal", assigneeId: "" })).toBe(false);
  });
});
