import { beforeEach, describe, expect, it, vi } from "vitest";

// O que se testa: nenhuma ação alcança notificação de outra pessoa ou de outro
// escritório — todo `where` leva tenantId + userId da sessão.
const notification = { updateMany: vi.fn(), deleteMany: vi.fn(), count: vi.fn() };
const notificationHiddenType = {
  findMany: vi.fn().mockResolvedValue([]),
  deleteMany: vi.fn((a: unknown) => ({ op: "apagar", a })),
  createMany: vi.fn((a: unknown) => ({ op: "criar", a })),
};
const $transaction = vi.fn(async (ops: unknown[]) => ops);
vi.mock("@/lib/prisma", () => ({ getPrisma: () => ({ notification, notificationHiddenType, $transaction }) }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
const ctx = { tenantId: "t1", userId: "u1" };
vi.mock("@/lib/auth/context", () => ({ getAuthContext: async () => ctx }));

const { marcarLidas, marcarNaoLida, removerNotificacoes, marcarTodasLidas, contarNaoLidas, arquivarNotificacoes, arquivarLidas, salvarTiposOcultos } =
  await import("./actions");

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

  it("marcar todas deixa de fora o tipo oculto e a arquivada", async () => {
    notificationHiddenType.findMany.mockResolvedValueOnce([{ type: "GESTAO_PARADO" }]);
    await marcarTodasLidas("todas");
    expect(notification.updateMany.mock.calls[0][0].where).toMatchObject({ archivedAt: null, type: { notIn: ["GESTAO_PARADO"] } });
  });

  it("arquivar e desarquivar: só as da pessoa", async () => {
    await arquivarNotificacoes(["n1"]);
    const arquivou = notification.updateMany.mock.calls[0][0];
    expect(arquivou.where).toEqual({ id: { in: ["n1"] }, tenantId: "t1", userId: "u1" });
    expect(arquivou.data.archivedAt).toBeInstanceOf(Date);
    await arquivarNotificacoes(["n1"], false);
    expect(notification.updateMany.mock.calls[1][0].data).toEqual({ archivedAt: null });
  });

  it("arquivar as lidas: só lidas, não arquivadas, da aba", async () => {
    await arquivarLidas("clientes");
    const { where } = notification.updateMany.mock.calls[0][0];
    expect(where).toMatchObject({ tenantId: "t1", userId: "u1", read: true, archivedAt: null });
    expect(where.type.in).toContain("NEW_APPLICATION");
  });

  it("preferências: troca a lista inteira e ignora o que não é do catálogo", async () => {
    expect(await salvarTiposOcultos(["GESTAO_PARADO", "TIPO_INVENTADO", "GESTAO_ALERTA"])).toBeNull();
    expect(notificationHiddenType.deleteMany).toHaveBeenCalledWith({ where: { tenantId: "t1", userId: "u1" } });
    expect(notificationHiddenType.createMany).toHaveBeenCalledWith({ data: [{ tenantId: "t1", userId: "u1", type: "GESTAO_PARADO" }] });
    // Religar tudo só apaga.
    vi.clearAllMocks();
    await salvarTiposOcultos([]);
    expect(notificationHiddenType.deleteMany).toHaveBeenCalledTimes(1);
    expect(notificationHiddenType.createMany).not.toHaveBeenCalled();
  });

  it("sem sessão, nada", async () => {
    ctx.userId = "";
    await marcarLidas(["n1"]);
    await arquivarNotificacoes(["n1"]);
    expect(await contarNaoLidas()).toBe(0);
    expect(await salvarTiposOcultos(["GESTAO_PARADO"])).toEqual({ error: "Não autenticado." });
    expect(notification.updateMany).not.toHaveBeenCalled();
    expect(notificationHiddenType.deleteMany).not.toHaveBeenCalled();
    ctx.userId = "u1";
  });
});
