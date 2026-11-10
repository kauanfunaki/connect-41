import { beforeEach, describe, expect, it, vi } from "vitest";

// O número do item Solicitações do menu (21/10/2026): conta só as novas
// (`ABERTA`, ninguém da 41 respondeu) da fila da pessoa — os setores dela e o
// que está com ela —, a mesma conta do cartão "Novas" da tela.

const m = vi.hoisted(() => ({ count: vi.fn() }));
vi.mock("@/lib/prisma", () => ({ getPrisma: () => ({ serviceRequest: { count: m.count } }) }));

import { contarDaEquipe, contarNovasDaEquipe, whereDoRecorteDaEquipe } from "./consultas";

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

// O balão da aba "Recebidas" (10/11/2026): o que a fila mostra
// ao abrir — o recorte "Em aberto" —, contado no banco com o where da lista.
describe("contarDaEquipe", () => {
  const EM_ABERTO = { status: { in: ["ABERTA", "EM_ANDAMENTO", "AGUARDANDO_CLIENTE"] } };

  it("conta as em aberto dos setores da pessoa e as que estão com ela", async () => {
    expect(await contarDaEquipe({ tenantId: "t1", setores: ["dp"], userId: "u1" }, "abertas")).toBe(3);
    expect(m.count).toHaveBeenCalledWith({
      where: { AND: [{ tenantId: "t1", OR: [{ sectorCode: { in: ["dp"] } }, { assigneeId: "u1" }] }, EM_ABERTO] },
    });
  });

  it("administrador conta as em aberto do escritório inteiro", async () => {
    await contarDaEquipe({ tenantId: "t1", setores: null, userId: "u1" }, "abertas");
    expect(m.count).toHaveBeenCalledWith({ where: { AND: [{ tenantId: "t1" }, EM_ABERTO] } });
  });
});

describe("whereDoRecorteDaEquipe", () => {
  it("cada recorte da tela vira o status dele", () => {
    expect(whereDoRecorteDaEquipe("abertas", "u1")).toEqual({ status: { in: ["ABERTA", "EM_ANDAMENTO", "AGUARDANDO_CLIENTE"] } });
    expect(whereDoRecorteDaEquipe("novas", "u1")).toEqual({ status: "ABERTA" });
    expect(whereDoRecorteDaEquipe("aguardando", "u1")).toEqual({ status: "AGUARDANDO_CLIENTE" });
    expect(whereDoRecorteDaEquipe("encerradas", "u1")).toEqual({ status: { in: ["CONCLUIDA", "CANCELADA"] } });
    expect(whereDoRecorteDaEquipe("todas", "u1")).toEqual({});
  });

  it("'Minhas' é o em aberto que está com a pessoa", () => {
    expect(whereDoRecorteDaEquipe("minhas", "u7")).toEqual({
      status: { in: ["ABERTA", "EM_ANDAMENTO", "AGUARDANDO_CLIENTE"] },
      assigneeId: "u7",
    });
  });
});
