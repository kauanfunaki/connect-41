import { beforeEach, describe, expect, it, vi } from "vitest";

// Etapa 5 do chat (02/10/2026): 👍/👎 na resposta e o painel em /admin/ia.
const agentMessage = { findMany: vi.fn(), findFirst: vi.fn(), findUnique: vi.fn(), updateMany: vi.fn() };
const auditLog = { findMany: vi.fn() };
vi.mock("@/lib/prisma", () => ({ getPrisma: () => ({ agentMessage, auditLog }) }));

const { avaliacaoParaGravar } = await import("./regras");
const { avaliarMensagem } = await import("./conversas");
const { painelDoOrquestrador, somarAvaliacoes, textoParaRevisao } = await import("./painel");

const DONO = { tenantId: "t1", userId: "u1" };
const AGORA = new Date("2026-10-02T15:00:00Z");
const ANA = "0b6c2f7e-1d3a-4c5b-9e8f-112233445566";

beforeEach(() => vi.clearAllMocks());

describe("o que gravar do clique", () => {
  it("👍, 👎 com e sem motivo, e tirar", () => {
    expect(avaliacaoParaGravar("boa", null)).toEqual({ rating: "BOA", ratingReason: null });
    expect(avaliacaoParaGravar("ruim", undefined)).toEqual({ rating: "RUIM", ratingReason: null });
    expect(avaliacaoParaGravar("ruim", "errou_dado")).toEqual({ rating: "RUIM", ratingReason: "errou_dado" });
    expect(avaliacaoParaGravar(null, "errou_dado")).toEqual({ rating: null, ratingReason: null });
  });

  it("o motivo só acompanha o 👎", () => {
    expect(avaliacaoParaGravar("boa", "incompleta")).toEqual({ rating: "BOA", ratingReason: null });
  });

  it("recusa o que veio fora da lista — o navegador não escolhe o texto gravado", () => {
    expect(avaliacaoParaGravar("ruim", "<b>qualquer coisa</b>")).toBeNull();
    expect(avaliacaoParaGravar("ruim", "toString")).toBeNull();
    expect(avaliacaoParaGravar("otima", null)).toBeNull();
    expect(avaliacaoParaGravar(1, null)).toBeNull();
  });
});

describe("gravar a avaliação", () => {
  it("só na resposta da própria pessoa que não falhou, com a hora", async () => {
    agentMessage.updateMany.mockResolvedValue({ count: 1 });
    expect(await avaliarMensagem(DONO, "m1", { rating: "RUIM", ratingReason: "incompleta" }, AGORA)).toBe(true);
    expect(agentMessage.updateMany).toHaveBeenCalledWith({
      where: { id: "m1", role: "ASSISTENTE", failed: false, conversation: { tenantId: "t1", userId: "u1" } },
      data: { rating: "RUIM", ratingReason: "incompleta", ratedAt: AGORA },
    });
  });

  it("tirar a avaliação limpa a hora; mensagem de outra pessoa não acha nada", async () => {
    agentMessage.updateMany.mockResolvedValue({ count: 0 });
    expect(await avaliarMensagem(DONO, "m-de-outro", { rating: null, ratingReason: null }, AGORA)).toBe(false);
    expect(agentMessage.updateMany.mock.calls[0][0].data).toEqual({ rating: null, ratingReason: null, ratedAt: null });
  });
});

describe("painel de avaliação", () => {
  it("soma por IA, conta os motivos e põe a pior taxa primeiro", () => {
    const r = somarAvaliacoes([
      { agentCode: "fiscal", rating: "BOA", ratingReason: null },
      { agentCode: "fiscal", rating: "BOA", ratingReason: null },
      { agentCode: "fiscal", rating: "RUIM", ratingReason: "errou_dado" },
      { agentCode: "dp", rating: "RUIM", ratingReason: "incompleta" },
      { agentCode: "dp", rating: "RUIM", ratingReason: null },
      { agentCode: "dp", rating: "RUIM", ratingReason: "lixo" },
      { agentCode: "bpo", rating: null, ratingReason: null },
    ]);
    expect(r).toEqual([
      { agentCode: "dp", boas: 0, ruins: 3, motivos: { incompleta: 1 } },
      { agentCode: "fiscal", boas: 2, ruins: 1, motivos: { errou_dado: 1 } },
    ]);
  });

  it("citação vira só o nome, sem negrito, e resposta longa é cortada", () => {
    expect(textoParaRevisao(`Fale com @[Ana Lima](usuario:${ANA}) sobre **3 etapas**.`)).toBe("Fale com Ana Lima sobre 3 etapas.");
    expect(textoParaRevisao("a".repeat(700))).toHaveLength(601);
  });

  it("lista o 👎 com a pergunta de antes, sem o anexo nem quem perguntou", async () => {
    agentMessage.findMany.mockImplementation(async (q: { where: Record<string, unknown> }) => {
      if ("ratedAt" in q.where) {
        return [
          { id: "r1", rating: "RUIM", ratingReason: "errou_dado", conversationId: "c1", createdAt: new Date("2026-10-02T12:00:01Z"), ratedAt: new Date("2026-10-02T12:05:00Z"), conversation: { agentCode: "fiscal" } },
          { id: "b1", rating: "BOA", ratingReason: null, conversationId: "c2", createdAt: new Date("2026-10-02T11:00:00Z"), ratedAt: new Date("2026-10-02T11:01:00Z"), conversation: { agentCode: "fiscal" } },
        ];
      }
      return [];
    });
    auditLog.findMany.mockResolvedValue([]);
    agentMessage.findUnique.mockResolvedValue({ content: "Não há notas em setembro." });
    agentMessage.findFirst.mockResolvedValue({ content: "Quantas notas em setembro?\n\n📎 relatorio.pdf" });

    const p = await painelDoOrquestrador("t1", AGORA);
    expect(p?.avaliacoes).toEqual([{ agentCode: "fiscal", boas: 1, ruins: 1, motivos: { errou_dado: 1 } }]);
    expect(p?.ruins).toEqual([
      {
        id: "r1",
        agentCode: "fiscal",
        motivo: "errou_dado",
        pergunta: "Quantas notas em setembro?",
        resposta: "Não há notas em setembro.",
        avaliadaEm: "2026-10-02T12:05:00.000Z",
      },
    ]);
    // Sempre no escritório, e a pergunta é a da mesma conversa, de antes da resposta.
    const consulta = agentMessage.findMany.mock.calls.find((c) => "ratedAt" in c[0].where)![0];
    expect(consulta.where.conversation).toEqual({ tenantId: "t1" });
    expect(agentMessage.findFirst.mock.calls[0][0].where).toEqual({
      conversationId: "c1",
      role: "USUARIO",
      createdAt: { lte: new Date("2026-10-02T12:00:01Z") },
    });
  });
});
