import { beforeEach, describe, expect, it, vi } from "vitest";

// O que se testa: nenhuma ação alcança notificação de outra pessoa ou de outro
// escritório — todo `where` leva tenantId + userId da sessão.
const notification = { updateMany: vi.fn(), deleteMany: vi.fn(), count: vi.fn() };
vi.mock("@/lib/prisma", () => ({ getPrisma: () => ({ notification }) }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
const ctx = { tenantId: "t1", userId: "u1" };
vi.mock("@/lib/auth/context", () => ({ getAuthContext: async () => ctx }));

const { marcarLidas, marcarNaoLida, removerNotificacoes, marcarTodasLidas, contarNaoLidas } = await import("./actions");

beforeEach(() => vi.clearAllMocks());

describe("ações das notificações", () => {
  it("marcar lidas: só as da pessoa, no escritório dela", async () => {
    await marcarLidas(["n1", "n2"]);
    expect(notification.updateMany).toHaveBeenCalledWith({ where: { id: { in: ["n1", "n2"] }, tenantId: "t1", userId: "u1" }, data: { read: true } });
  });

  it("marcar como não lida", async () => {
    await marcarNaoLida("n1");
    expect(notification.updateMany.mock.calls[0][0]).toMatchObject({ where: { tenantId: "t1", userId: "u1" }, data: { read: false } });
  });

  it("remover filtra pela pessoa e ignora lixo na lista", async () => {
    await removerNotificacoes(["n1", 42 as unknown as string, ""]);
    expect(notification.deleteMany).toHaveBeenCalledWith({ where: { id: { in: ["n1"] }, tenantId: "t1", userId: "u1" } });
  });

  it("lista vazia não toca no banco", async () => {
    await removerNotificacoes([]);
    expect(notification.deleteMany).not.toHaveBeenCalled();
  });

  it("marcar todas de uma aba leva o filtro da aba", async () => {
    await marcarTodasLidas("clientes");
    const where = notification.updateMany.mock.calls[0][0].where;
    expect(where).toMatchObject({ tenantId: "t1", userId: "u1", read: false });
    expect(where.type.in).toContain("NEW_APPLICATION");
  });

  it("sem sessão, nada", async () => {
    ctx.userId = "";
    await marcarLidas(["n1"]);
    expect(await contarNaoLidas()).toBe(0);
    expect(notification.updateMany).not.toHaveBeenCalled();
    ctx.userId = "u1";
  });
});
