import { beforeEach, describe, expect, it, vi } from "vitest";

// O número do item Solicitações do menu (21/10/2026): conta só as novas
// (`ABERTA`, ninguém da 41 respondeu) da fila da pessoa — os setores dela e o
// que está com ela —, a mesma conta do cartão "Novas" da tela.

const m = vi.hoisted(() => ({ count: vi.fn() }));
vi.mock("@/lib/prisma", () => ({ getPrisma: () => ({ serviceRequest: { count: m.count } }) }));

import { contarNovasDaEquipe } from "./consultas";

beforeEach(() => {
  m.count.mockReset();
  m.count.mockResolvedValue(3);
});

describe("contarNovasDaEquipe", () => {
  it("conta as novas dos setores da pessoa e as que estão com ela", async () => {
    expect(await contarNovasDaEquipe({ tenantId: "t1", setores: ["bpo"], userId: "u1" })).toBe(3);
    expect(m.count).toHaveBeenCalledWith({
      where: { AND: [{ tenantId: "t1", OR: [{ sectorCode: { in: ["bpo"] } }, { assigneeId: "u1" }] }, { status: "ABERTA" }] },
    });
  });

  it("administrador conta as do escritório inteiro", async () => {
    await contarNovasDaEquipe({ tenantId: "t1", setores: null, userId: "u1" });
    expect(m.count).toHaveBeenCalledWith({ where: { AND: [{ tenantId: "t1" }, { status: "ABERTA" }] } });
  });
});
