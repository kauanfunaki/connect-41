import { describe, it, expect } from "vitest";
import { podeAssumir, podeSoltar, destinoDoAviso, avisarMensagemNova, filtrarConversas, recorteDaUrl } from "./conversas";

const AGORA = new Date("2026-09-24T12:00:00Z");

describe("podeAssumir", () => {
  it("deixa assumir conversa sem dono ou de outra pessoa", () => {
    expect(podeAssumir({ optedOutAt: null, assignedToId: null }, "ana")).toEqual({ pode: true });
    expect(podeAssumir({ optedOutAt: null, assignedToId: "bia" }, "ana")).toEqual({ pode: true });
  });
  it("recusa quem pediu silêncio e a conversa que já é sua", () => {
    expect(podeAssumir({ optedOutAt: AGORA, assignedToId: null }, "ana").pode).toBe(false);
    expect(podeAssumir({ optedOutAt: null, assignedToId: "ana" }, "ana").pode).toBe(false);
  });
});

describe("podeSoltar", () => {
  it("só quem assumiu solta", () => {
    expect(podeSoltar({ assignedToId: "ana" }, "ana")).toEqual({ pode: true });
    expect(podeSoltar({ assignedToId: "bia" }, "ana").pode).toBe(false);
    expect(podeSoltar({ assignedToId: null }, "ana").pode).toBe(false);
  });
});

describe("destinoDoAviso", () => {
  it("responsável da conversa, depois o da vaga, depois o setor", () => {
    expect(destinoDoAviso({ assignedToId: "ana", responsavelDaVagaId: "bia" })).toEqual({ usuario: "ana" });
    expect(destinoDoAviso({ assignedToId: null, responsavelDaVagaId: "bia" })).toEqual({ usuario: "bia" });
    expect(destinoDoAviso({ assignedToId: null, responsavelDaVagaId: null })).toEqual({ setor: true });
  });
});

describe("avisarMensagemNova", () => {
  it("avisa só quando a conversa reabre depois de 15 minutos", () => {
    expect(avisarMensagemNova(null, AGORA)).toBe(true);
    expect(avisarMensagemNova(new Date(AGORA.getTime() - 5 * 60_000), AGORA)).toBe(false);
    expect(avisarMensagemNova(new Date(AGORA.getTime() - 15 * 60_000), AGORA)).toBe(true);
  });
});

describe("filtrarConversas", () => {
  const base = { optedOutAt: null, lastInboundAt: null, candidaturaId: null, janelaLivreHoras: 24 };
  const comRobo = { ...base, id: "1", handoffAt: null, responsavel: null };
  const naFila = { ...base, id: "2", handoffAt: AGORA, responsavel: null };
  const minha = { ...base, id: "3", handoffAt: AGORA, responsavel: { id: "ana" } };
  const encerrada = { ...base, id: "4", handoffAt: AGORA, optedOutAt: AGORA, responsavel: null };
  const todas = [comRobo, naFila, minha, encerrada];

  it("separa as minhas e a fila sem responsável", () => {
    expect(filtrarConversas(todas, "minhas", "ana").map((c) => c.id)).toEqual(["3"]);
    expect(filtrarConversas(todas, "sem_responsavel", "ana").map((c) => c.id)).toEqual(["2"]);
    expect(filtrarConversas(todas, "todas", "ana")).toHaveLength(4);
  });
  it("lê o recorte da URL com padrão seguro", () => {
    expect(recorteDaUrl("minhas")).toBe("minhas");
    expect(recorteDaUrl("qualquer")).toBe("todas");
    expect(recorteDaUrl(undefined)).toBe("todas");
  });
});
