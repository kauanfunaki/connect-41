import { beforeEach, describe, expect, it, vi } from "vitest";

// Etapa 2 do chat (02/10/2026): respostas rápidas, cartões de decisão,
// recusar e substituir (editar/refazer).
const agentMessage = { findFirst: vi.fn(), updateMany: vi.fn(), update: vi.fn() };
vi.mock("@/lib/prisma", () => ({ getPrisma: () => ({ agentMessage }) }));

const { lerPropostas, opcoesDeRespostaRapida, rotulosDaDecisao, MARCA_DE_SUBSTITUIDA, SUGERIR_RESPOSTAS } = await import("./regras");
const { substituirAPartirDe, marcarPropostaRecusada } = await import("./conversas");
const { AGENT_CATALOG } = await import("@/lib/ia/catalogo");
const { AGENTES_DO_CHAT } = await import("./regras");

const DONO = { tenantId: "t1", userId: "u1" };

beforeEach(() => vi.clearAllMocks());

describe("respostas rápidas", () => {
  it("2 a 4 opções limpas, sem repetir", () => {
    expect(opcoesDeRespostaRapida({ ferramenta: SUGERIR_RESPOSTAS, argumentos: { opcoes: [" Sim ", "sim", "Não", 3, "", "Só a de março", "Outra", "Mais uma"] } })).toEqual([
      "Sim",
      "Não",
      "Só a de março",
      "Outra",
    ]);
  });
  it("uma opção só não vira botão, e outra ferramenta não tem opções", () => {
    expect(opcoesDeRespostaRapida({ ferramenta: SUGERIR_RESPOSTAS, argumentos: { opcoes: ["Sim"] } })).toEqual([]);
    expect(opcoesDeRespostaRapida({ ferramenta: "propor_mover_etapa", argumentos: { opcoes: ["a", "b"] } })).toEqual([]);
  });
  it("toda IA do chat pode oferecer respostas rápidas", () => {
    for (const code of AGENTES_DO_CHAT) {
      const def = AGENT_CATALOG.find((a) => a.code === code);
      expect(def?.ferramentas, code).toContain(SUGERIR_RESPOSTAS);
    }
  });
});

describe("cartões de decisão", () => {
  it("candidatura é Aprovar/Recusar; o resto, Sim/Não", () => {
    expect(rotulosDaDecisao("propor_mover_etapa")).toEqual({ sim: "Aprovar", nao: "Recusar" });
    expect(rotulosDaDecisao("propor_concluir_etapa").sim).toBe("Sim, aplicar");
  });
  it("o 'Não' fica gravado e volta ao ler", async () => {
    const propostas = lerPropostas([{ ferramenta: "propor_concluir_etapa", descricao: "x", argumentos: {} }]);
    await marcarPropostaRecusada("m1", propostas, 0);
    const gravado = agentMessage.update.mock.calls[0][0].data.proposals;
    expect(lerPropostas(gravado)[0]).toMatchObject({ recusada: true, aplicada: false });
  });
});

describe("editar e refazer", () => {
  it("marca a mensagem e as seguintes como substituídas, sem apagar", async () => {
    agentMessage.findFirst.mockResolvedValue({ conversationId: "c1", createdAt: new Date("2026-10-02T12:00:00Z") });
    expect(await substituirAPartirDe(DONO, "m1")).toBe(true);
    expect(agentMessage.findFirst.mock.calls[0][0].where).toEqual({ id: "m1", conversation: { tenantId: "t1", userId: "u1" } });
    expect(agentMessage.updateMany).toHaveBeenCalledWith({
      where: { conversationId: "c1", createdAt: { gte: new Date("2026-10-02T12:00:00Z") } },
      data: { failed: true, contextLabel: MARCA_DE_SUBSTITUIDA },
    });
  });
  it("mensagem de outra pessoa não é achada, e nada muda", async () => {
    agentMessage.findFirst.mockResolvedValue(null);
    expect(await substituirAPartirDe(DONO, "m-de-outro")).toBe(false);
    expect(agentMessage.updateMany).not.toHaveBeenCalled();
  });
});
