import { beforeEach, describe, expect, it, vi } from "vitest";

const notification = { findMany: vi.fn(), groupBy: vi.fn(), count: vi.fn() };
const vazio = { findMany: vi.fn().mockResolvedValue([]) };
const user = { findMany: vi.fn() };
const notificationHiddenType = { findMany: vi.fn() };
vi.mock("@/lib/prisma", () => ({
  getPrisma: () => ({
    notification,
    user,
    notificationHiddenType,
    company: { findMany: vi.fn().mockResolvedValue([{ id: "c1", name: "ACME LTDA", displayName: "Acme" }]) },
    person: vazio,
    pipelineItem: { findMany: vi.fn().mockResolvedValue([{ id: "i1", title: "Fechar balanço" }]) },
    process: vazio,
    serviceRequest: vazio,
    whatsappThread: vazio,
    clientRequest: vazio,
  }),
}));

const { consultarNotificacoes, contarNaoLidasVisiveis, entidadeDoChip, lerCursor, montarCursor, naoLidasPorAba, ondeDasNotificacoes, tiposOcultos } =
  await import("./consultas");

const DONO = { tenantId: "t1", userId: "u1" };

function linha(id: string, extra: Record<string, unknown> = {}) {
  return {
    id,
    tenantId: "t1",
    userId: "u1",
    type: "COMPANY_MESSAGE",
    entityType: null,
    entityId: null,
    message: "msg",
    read: false,
    createdAt: new Date("2026-10-02T12:00:00Z"),
    actorUserId: null,
    archivedAt: null,
    ...extra,
  };
}

beforeEach(() => vi.clearAllMocks());

describe("consultas das notificações", () => {
  it("todo filtro leva o escritório e a pessoa", () => {
    const w = ondeDasNotificacoes(DONO, { aba: "clientes", status: "nao_lidas", q: " acme " });
    expect(w).toMatchObject({ tenantId: "t1", userId: "u1", read: false, archivedAt: null, message: { contains: "acme" } });
    expect(w.type).toHaveProperty("in");
  });

  it("arquivadas: fora das abas; na caixa delas, todas as abas e sem filtro de tipo", () => {
    const aba = ondeDasNotificacoes(DONO, { aba: "todas", status: "todas", q: "" }, ["GESTAO_PARADO"]);
    expect(aba).toMatchObject({ archivedAt: null, type: { notIn: ["GESTAO_PARADO"] } });
    const caixa = ondeDasNotificacoes(DONO, { aba: "alertas", status: "nao_lidas", q: "", arquivadas: true }, ["GESTAO_PARADO"]);
    expect(caixa).toEqual({ tenantId: "t1", userId: "u1", archivedAt: { not: null } });
  });

  it("tipos ocultos da pessoa: filtrados pelo dono e pelo catálogo", async () => {
    notificationHiddenType.findMany.mockResolvedValue([{ type: "GESTAO_PARADO" }, { type: "TIPO_QUE_SAIU" }]);
    expect(await tiposOcultos(DONO)).toEqual(["GESTAO_PARADO"]);
    expect(notificationHiddenType.findMany.mock.calls[0][0].where).toEqual({ tenantId: "t1", userId: "u1" });
  });

  it("o número do sino tira arquivadas e tipos ocultos", async () => {
    notification.count.mockResolvedValue(3);
    expect(await contarNaoLidasVisiveis(DONO, ["COMMENT"])).toBe(3);
    expect(notification.count.mock.calls[0][0].where).toEqual({ tenantId: "t1", userId: "u1", read: false, archivedAt: null, type: { notIn: ["COMMENT"] } });
    await contarNaoLidasVisiveis(DONO, []);
    expect(notification.count.mock.calls[1][0].where).not.toHaveProperty("type");
  });

  it("autor: foto e nome de quem fez, em uma consulta só; sem autor, nulo", async () => {
    notification.findMany.mockResolvedValue([
      linha("n1", { type: "COMMENT", actorUserId: "u9" }),
      linha("n2", { type: "MENTION", actorUserId: "u9" }),
      linha("n3", { actorUserId: "sumiu" }),
      linha("n4", { archivedAt: new Date("2026-10-03T12:00:00Z") }),
    ]);
    user.findMany.mockResolvedValue([{ id: "u9", name: "Ana Souza", photoUrl: "/f.png" }]);
    const r = await consultarNotificacoes(DONO, { aba: "todas", status: "todas", q: "" });
    expect(r.itens.map((n) => n.autor)).toEqual([{ nome: "Ana Souza", foto: "/f.png" }, { nome: "Ana Souza", foto: "/f.png" }, null, null]);
    expect(r.itens.map((n) => n.arquivada)).toEqual([false, false, false, true]);
    expect(user.findMany).toHaveBeenCalledTimes(1);
    expect(user.findMany.mock.calls[0][0].where).toEqual({ id: { in: ["u9", "sumiu"] } });
  });

  it("cursor vai e volta, e lixo vira nulo", () => {
    const c = montarCursor({ createdAt: new Date("2026-10-02T12:00:00Z"), id: "n9" });
    expect(lerCursor(c)).toEqual({ em: new Date("2026-10-02T12:00:00Z"), id: "n9" });
    expect(lerCursor("lixo")).toBeNull();
    expect(lerCursor(null)).toBeNull();
  });

  it("chip pelo tipo e pela entidade, na ordem do link", () => {
    expect(entidadeDoChip({ type: "WHATSAPP_HANDOFF", entityId: "w1" })).toEqual({ tipo: "conversa", id: "w1" });
    expect(entidadeDoChip({ type: "COMMENT", entityType: "COMPANY", entityId: "c1" })).toEqual({ tipo: "empresa", id: "c1" });
    expect(entidadeDoChip({ type: "MENTION", entityId: "i1" })).toEqual({ tipo: "card", id: "i1" });
    expect(entidadeDoChip({ type: "GESTAO_ALERTA" })).toBeNull();
  });

  it("página com 'carregar mais' e chips resolvidos", async () => {
    notification.findMany.mockResolvedValue([
      linha("n1", { entityType: "COMPANY", entityId: "c1" }),
      linha("n2", { type: "MENTION", entityId: "i1" }),
      linha("n3"),
    ]);
    const r = await consultarNotificacoes(DONO, { aba: "todas", status: "todas", q: "", limite: 2 });
    expect(r.itens.map((n) => n.id)).toEqual(["n1", "n2"]);
    expect(r.proximoCursor).toBe(montarCursor({ createdAt: new Date("2026-10-02T12:00:00Z"), id: "n2" }));
    expect(r.itens[0].chip).toEqual({ rotulo: "Acme", tipo: "empresa" });
    expect(r.itens[1]).toMatchObject({ aba: "para_mim", titulo: "Você foi mencionado", href: "/kanban/itens/i1", chip: { rotulo: "Fechar balanço", tipo: "card" } });
    // Pediu uma a mais, para saber se há próxima página.
    expect(notification.findMany.mock.calls[0][0].take).toBe(3);
    expect(notification.findMany.mock.calls[0][0].where).toMatchObject({ tenantId: "t1", userId: "u1" });
  });

  it("com cursor, só o que vem depois dele", async () => {
    notification.findMany.mockResolvedValue([]);
    await consultarNotificacoes(DONO, { aba: "todas", status: "todas", q: "", cursor: montarCursor({ createdAt: new Date("2026-10-02T12:00:00Z"), id: "n2" }) });
    const where = notification.findMany.mock.calls[0][0].where;
    expect(where.AND[0]).toMatchObject({ tenantId: "t1", userId: "u1" });
    expect(where.AND[1].OR).toHaveLength(2);
  });

  it("não lidas por aba somam no total", async () => {
    notification.groupBy.mockResolvedValue([
      { type: "MENTION", _count: { _all: 2 } },
      { type: "NEW_APPLICATION", _count: { _all: 3 } },
      { type: "TIPO_NOVO", _count: { _all: 1 } },
    ]);
    expect(await naoLidasPorAba(DONO)).toEqual({ todas: 6, para_mim: 2, clientes: 3, alertas: 1 });
    expect(notification.groupBy.mock.calls[0][0].where).toEqual({ tenantId: "t1", userId: "u1", read: false, archivedAt: null });
    // Tipo oculto não conta em aba nenhuma.
    expect(await naoLidasPorAba(DONO, ["NEW_APPLICATION"])).toEqual({ todas: 3, para_mim: 2, clientes: 0, alertas: 1 });
  });
});
