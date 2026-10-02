import { beforeEach, describe, expect, it, vi } from "vitest";

const notification = { findMany: vi.fn(), groupBy: vi.fn() };
const vazio = { findMany: vi.fn().mockResolvedValue([]) };
vi.mock("@/lib/prisma", () => ({
  getPrisma: () => ({
    notification,
    company: { findMany: vi.fn().mockResolvedValue([{ id: "c1", name: "ACME LTDA", displayName: "Acme" }]) },
    person: vazio,
    pipelineItem: { findMany: vi.fn().mockResolvedValue([{ id: "i1", title: "Fechar balanço" }]) },
    process: vazio,
    serviceRequest: vazio,
    whatsappThread: vazio,
    clientRequest: vazio,
  }),
}));

const { consultarNotificacoes, entidadeDoChip, lerCursor, montarCursor, naoLidasPorAba, ondeDasNotificacoes } = await import("./consultas");

const DONO = { tenantId: "t1", userId: "u1" };

function linha(id: string, extra: Record<string, unknown> = {}) {
  return { id, tenantId: "t1", userId: "u1", type: "COMPANY_MESSAGE", entityType: null, entityId: null, message: "msg", read: false, createdAt: new Date("2026-10-02T12:00:00Z"), ...extra };
}

beforeEach(() => vi.clearAllMocks());

describe("consultas das notificações", () => {
  it("todo filtro leva o escritório e a pessoa", () => {
    const w = ondeDasNotificacoes(DONO, { aba: "clientes", status: "nao_lidas", q: " acme " });
    expect(w).toMatchObject({ tenantId: "t1", userId: "u1", read: false, message: { contains: "acme" } });
    expect(w.type).toHaveProperty("in");
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
    expect(notification.groupBy.mock.calls[0][0].where).toEqual({ tenantId: "t1", userId: "u1", read: false });
  });
});
