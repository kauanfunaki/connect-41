import { beforeEach, describe, expect, it, vi } from "vitest";

// Teste de regressão da Fase 0 (subworkspaces por setor).
//
// Com o subworkspace, a pessoa passa a operar dentro de UM setor por vez
// (`ctx.activeSector`), e a listagem de quase tudo no app é recortada por ele.
// Notificação é a exceção que precisa continuar de fora desse recorte: quem é
// dos setores Fiscal e Contábil, operando no Fiscal, tem que continuar sabendo
// que chegou transferência no Contábil — senão a demanda fica parada sem que
// ninguém veja.
//
// O defeito seria silencioso: nada quebra, nada dá erro, a notificação existe
// no banco e simplesmente não aparece. Por isso a regra está travada aqui em
// vez de depender de alguém lembrar dela ao mexer na consulta.

const findMany = vi.fn();
const createMany = vi.fn();
const notificationFindMany = vi.fn();

vi.mock("@/lib/prisma", () => ({
  getPrisma: () => ({
    user: { findMany },
    notification: { createMany, findMany: notificationFindMany },
  }),
}));

vi.mock("@/lib/webPush", () => ({ sendWebPushToUser: vi.fn() }));

const { notifySector } = await import("./notifications");

describe("notifySector — quem recebe", () => {
  beforeEach(() => {
    findMany.mockReset().mockResolvedValue([{ id: "u-1" }, { id: "u-2" }]);
    createMany.mockReset().mockResolvedValue({ count: 2 });
  });

  it("seleciona por setor DA PESSOA, nunca pelo setor ativo da sessão", async () => {
    await notifySector("contabil", {
      tenantId: "t-1",
      type: "handoff.created",
      message: "Nova transferência para o Contábil",
    });

    const where = findMany.mock.calls[0][0].where;
    expect(where.sectors).toEqual({ some: { sectorCode: "contabil" } });

    // A armadilha: recortar por sessão aqui deixaria de notificar justamente
    // quem está trabalhando em outro subworkspace no momento — que é a pessoa
    // que mais precisa saber.
    const serializado = JSON.stringify(where);
    expect(serializado).not.toContain("activeSector");
  });

  it("notifica todo mundo do setor, não só quem está com ele aberto", async () => {
    await notifySector("fiscal", { tenantId: "t-1", type: "x", message: "m" });

    expect(createMany).toHaveBeenCalledTimes(1);
    const linhas = createMany.mock.calls[0][0].data;
    expect(linhas.map((l: { userId: string }) => l.userId)).toEqual(["u-1", "u-2"]);
  });

  it("só usuário ativo do tenant recebe", async () => {
    await notifySector("fiscal", { tenantId: "t-1", type: "x", message: "m" });

    const where = findMany.mock.calls[0][0].where;
    expect(where.tenantId).toBe("t-1");
    expect(where.active).toBe(true);
  });

  it("setor sem ninguém não grava nada", async () => {
    findMany.mockResolvedValue([]);
    await notifySector("corretora", { tenantId: "t-1", type: "x", message: "m" });

    expect(createMany).not.toHaveBeenCalled();
  });
});
