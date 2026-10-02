import { beforeEach, describe, expect, it, vi } from "vitest";

// Ações em lote no WhatsApp do Recrutamento (02/10/2026): encerrar, devolver ao
// assistente e transferir várias conversas, cada uma pela regra da ação de uma só.

const prisma = {
  whatsappThread: { findMany: vi.fn(), update: vi.fn() },
  whatsappAtendimento: { updateMany: vi.fn() },
  candidatura: { findMany: vi.fn() },
  user: { findMany: vi.fn(), findUnique: vi.fn() },
};
const ctx = { tenantId: "t1", userId: "eu", role: "SECTOR_USER", sectors: ["recrutamento"], subscriptionReadOnly: false };
const notifyUser = vi.fn();
const logAudit = vi.fn();

vi.mock("@/lib/prisma", () => ({ getPrisma: () => prisma }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/auth/context", async (orig) => ({ ...(await orig<object>()), getAuthContext: async () => ctx }));
vi.mock("@/lib/modules", () => ({ setorDoModulo: async () => "recrutamento" }));
vi.mock("@/lib/notifications", () => ({ notifyUser: (...a: unknown[]) => notifyUser(...a) }));
vi.mock("@/lib/audit", () => ({ logAudit: (...a: unknown[]) => logAudit(...a) }));

const { podeTransferir, resumoDoLote, MAX_NO_LOTE } = await import("./conversas");
const { agirEmLote, transferirConversa } = await import("@/app/(app)/whatsapp/actions");
const { linkDaNotificacao } = await import("@/lib/notificacaoLink");

const AGORA = new Date("2026-10-02T15:00:00Z");

/** Uma conversa como o lote lê do banco. */
function conversa(id: string, extra: Partial<{ optedOutAt: Date; handoffAt: Date; assignedToId: string; aberto: boolean; candidaturaId: string }> = {}) {
  return {
    id,
    waPhone: "5541999990000",
    optedOutAt: extra.optedOutAt ?? null,
    handoffAt: extra.handoffAt ?? null,
    assignedToId: extra.assignedToId ?? null,
    candidaturaId: extra.candidaturaId ?? null,
    atendimentos: extra.aberto === false ? [] : [{ id: `a-${id}` }],
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  prisma.candidatura.findMany.mockResolvedValue([]);
  prisma.user.findMany.mockResolvedValue([
    { id: "eu", name: "Kauan" },
    { id: "bia", name: "Bia" },
  ]);
  prisma.user.findUnique.mockResolvedValue({ name: "Kauan" });
  prisma.whatsappAtendimento.updateMany.mockResolvedValue({ count: 1 });
});

describe("regras", () => {
  it("transferir: não para quem pediu silêncio, nem atendimento encerrado, nem para quem já está com ela", () => {
    const aberta = { optedOutAt: null, atendimentoEncerradoEm: null, assignedToId: "bia" };
    expect(podeTransferir(aberta, "eu")).toEqual({ pode: true });
    expect(podeTransferir({ ...aberta, assignedToId: null }, "bia")).toEqual({ pode: true });
    expect(podeTransferir(aberta, "bia").pode).toBe(false);
    expect(podeTransferir({ ...aberta, optedOutAt: AGORA }, "eu").pode).toBe(false);
    expect(podeTransferir({ ...aberta, atendimentoEncerradoEm: AGORA }, "eu").pode).toBe(false);
  });

  it("resumo em uma frase", () => {
    expect(resumoDoLote({ feitas: 3, puladas: [] }, "transferir")).toBe("3 conversas transferidas.");
    expect(resumoDoLote({ feitas: 1, puladas: [{ nome: "x", motivo: "y" }] }, "encerrar")).toBe("1 conversa encerrada; 1 ficou de fora.");
    expect(resumoDoLote({ feitas: 0, puladas: [{ nome: "x", motivo: "y" }, { nome: "z", motivo: "w" }] }, "devolver")).toBe(
      "Nenhuma conversa mudou; 2 ficaram de fora."
    );
  });

  it("aviso de várias conversas abre as minhas", () => {
    expect(linkDaNotificacao({ type: "WHATSAPP_HANDOFF", entityId: null })).toBe("/whatsapp?ver=minhas");
    expect(linkDaNotificacao({ type: "WHATSAPP_HANDOFF", entityId: "c1" })).toBe("/whatsapp/c1");
  });
});

describe("agirEmLote", () => {
  it("encerra as que dá e conta as que ficaram de fora, com o nome e o motivo", async () => {
    prisma.whatsappThread.findMany.mockResolvedValue([
      conversa("c1", { handoffAt: AGORA, assignedToId: "bia" }),
      conversa("c2", { optedOutAt: AGORA, candidaturaId: "cand2" }),
      conversa("c3", { aberto: false }),
    ]);
    prisma.candidatura.findMany.mockResolvedValue([{ id: "cand2", person: { name: "Ana Souza" } }]);

    const r = await agirEmLote(["c1", "c2", "c3"], { tipo: "encerrar", desfecho: "RESOLVIDO" });
    expect(r).toEqual({
      feitas: 1,
      puladas: [
        { nome: "Ana Souza", motivo: "O candidato pediu para parar — o atendimento já foi encerrado." },
        { nome: "(41) 99999-0000", motivo: "Este atendimento já foi encerrado." },
      ],
    });
    expect(prisma.whatsappThread.findMany.mock.calls[0][0].where).toEqual({ tenantId: "t1", id: { in: ["c1", "c2", "c3"] } });
    expect(prisma.whatsappAtendimento.updateMany).toHaveBeenCalledWith({
      where: { threadId: "c1", encerradoEm: null },
      data: { encerradoEm: expect.any(Date), encerradoPorId: "eu", desfecho: "RESOLVIDO" },
    });
    expect(logAudit).toHaveBeenCalledTimes(1);
    expect(logAudit.mock.calls[0][0]).toMatchObject({ action: "whatsapp.close", entityId: "c1", metadata: { emLote: true, desfecho: "RESOLVIDO", responsavelAnterior: "bia" } });
  });

  it("transfere, tira do assistente o que estava com ele, e avisa quem recebe uma vez só", async () => {
    prisma.whatsappThread.findMany.mockResolvedValue([conversa("c1"), conversa("c2", { handoffAt: AGORA, assignedToId: "eu" })]);

    const r = await agirEmLote(["c1", "c2"], { tipo: "transferir", paraId: "bia" });
    expect(r).toEqual({ feitas: 2, puladas: [] });
    const [primeira, segunda] = prisma.whatsappThread.update.mock.calls.map((c) => c[0]);
    expect(primeira).toEqual({
      where: { id: "c1" },
      data: { assignedToId: "bia", assignedAt: expect.any(Date), handoffAt: expect.any(Date), handoffReason: "transferida por alguém do time" },
    });
    expect(segunda.data).toEqual({ assignedToId: "bia", assignedAt: expect.any(Date) });
    expect(notifyUser).toHaveBeenCalledTimes(1);
    expect(notifyUser).toHaveBeenCalledWith("bia", { tenantId: "t1", type: "WHATSAPP_HANDOFF", message: "WhatsApp: Kauan passou 2 conversas para você" });
  });

  it("uma conversa só: o aviso leva a ela", async () => {
    prisma.whatsappThread.findMany.mockResolvedValue([conversa("c1", { handoffAt: AGORA })]);
    expect(await transferirConversa("c1", "bia")).toEqual({ success: true });
    expect(notifyUser.mock.calls[0][1]).toEqual({
      tenantId: "t1",
      type: "WHATSAPP_HANDOFF",
      message: "WhatsApp: Kauan passou para você a conversa com (41) 99999-0000",
      entityId: "c1",
    });
  });

  it("transferir para si mesmo não gera aviso", async () => {
    prisma.whatsappThread.findMany.mockResolvedValue([conversa("c1", { handoffAt: AGORA })]);
    expect(await agirEmLote(["c1"], { tipo: "transferir", paraId: "eu" })).toEqual({ feitas: 1, puladas: [] });
    expect(notifyUser).not.toHaveBeenCalled();
  });

  it("só recebe quem atende o WhatsApp do setor — o id vem do navegador", async () => {
    expect(await agirEmLote(["c1"], { tipo: "transferir", paraId: "estranho" })).toEqual({ error: "Essa pessoa não atende o WhatsApp do Recrutamento." });
    expect(prisma.whatsappThread.update).not.toHaveBeenCalled();
    // E a lista de quem atende vem do tenant, sem a leitura.
    expect(prisma.user.findMany.mock.calls[0][0].where).toMatchObject({ tenantId: "t1", active: true });
  });

  it("devolve ao assistente só o que estava com gente", async () => {
    prisma.whatsappThread.findMany.mockResolvedValue([conversa("c1", { handoffAt: AGORA, assignedToId: "bia" }), conversa("c2")]);
    const r = await agirEmLote(["c1", "c2"], { tipo: "devolver" });
    expect(r).toEqual({ feitas: 1, puladas: [{ nome: "(41) 99999-0000", motivo: "Esta conversa já está com o assistente." }] });
    expect(prisma.whatsappThread.update).toHaveBeenCalledWith({
      where: { id: "c1" },
      data: { handoffAt: null, handoffReason: null, assignedToId: null, assignedAt: null },
    });
  });

  it("recusa lote vazio, grande demais e desfecho fora da lista", async () => {
    expect(await agirEmLote([], { tipo: "devolver" })).toEqual({ error: "Selecione ao menos uma conversa." });
    const muitas = Array.from({ length: MAX_NO_LOTE + 1 }, (_, i) => `c${i}`);
    expect(await agirEmLote(muitas, { tipo: "devolver" })).toEqual({ error: `Até ${MAX_NO_LOTE} conversas por vez.` });
    expect(await agirEmLote(["c1"], { tipo: "encerrar", desfecho: "PEDIU_PARA_PARAR" })).toEqual({ error: "Escolha como os atendimentos terminaram." });
    expect(prisma.whatsappThread.findMany).not.toHaveBeenCalled();
  });

  it("conversa de outro escritório não é achada e fica de fora", async () => {
    prisma.whatsappThread.findMany.mockResolvedValue([]);
    expect(await agirEmLote(["de-outro"], { tipo: "devolver" })).toEqual({ feitas: 0, puladas: [{ nome: "—", motivo: "Conversa não encontrada." }] });
  });

  it("sem permissão no setor, nada acontece", async () => {
    const antes = ctx.sectors;
    ctx.sectors = ["fiscal"];
    try {
      expect(await agirEmLote(["c1"], { tipo: "devolver" })).toEqual({ error: "Sem permissão no Recrutamento." });
      expect(prisma.whatsappThread.findMany).not.toHaveBeenCalled();
    } finally {
      ctx.sectors = antes;
    }
  });
});
