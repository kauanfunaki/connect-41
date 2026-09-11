import { describe, it, expect } from "vitest";
import {
  situacaoDaConversa,
  podeResponder,
  podeDevolverAoRobo,
  ordenarConversas,
  telefoneLegivel,
  SITUACAO_LABEL,
  SITUACAO_VARIANTE,
  type ConversaParaTela,
  type SituacaoDaConversa,
} from "./conversas";

const AGORA = new Date("2026-09-11T12:00:00Z");
const HA_UMA_HORA = new Date("2026-09-11T11:00:00Z");
const HA_TRES_HORAS = new Date("2026-09-11T09:00:00Z");
const HA_DOIS_DIAS = new Date("2026-09-09T12:00:00Z");

function conversa(over: Partial<ConversaParaTela> = {}): ConversaParaTela {
  return {
    optedOutAt: null,
    handoffAt: null,
    lastInboundAt: HA_UMA_HORA,
    candidaturaId: null,
    ...over,
  };
}

const TODAS: SituacaoDaConversa[] = ["precisa_atencao", "com_robo", "encerrada", "fora_da_janela"];

describe("situacaoDaConversa", () => {
  it("todo estado tem rótulo e cor", () => {
    for (const s of TODAS) {
      expect(SITUACAO_LABEL[s]).toBeTruthy();
      expect(SITUACAO_VARIANTE[s]).toBeTruthy();
    }
  });

  it("sem transferência, está com o robô", () => {
    expect(situacaoDaConversa(conversa(), AGORA)).toBe("com_robo");
  });

  it("transferida e dentro das 24h precisa de gente", () => {
    expect(situacaoDaConversa(conversa({ handoffAt: HA_UMA_HORA }), AGORA)).toBe("precisa_atencao");
  });

  // Separar os dois existe porque a ação da pessoa é diferente: num caso ela
  // responde, no outro precisa ligar.
  it("transferida e fora das 24h é outro estado", () => {
    expect(
      situacaoDaConversa(conversa({ handoffAt: HA_UMA_HORA, lastInboundAt: HA_DOIS_DIAS }), AGORA)
    ).toBe("fora_da_janela");
  });

  it("opt-out vence a transferência", () => {
    expect(
      situacaoDaConversa(conversa({ optedOutAt: HA_UMA_HORA, handoffAt: HA_UMA_HORA }), AGORA)
    ).toBe("encerrada");
  });

  it("só 'precisa de você' é vermelho", () => {
    expect(TODAS.filter((s) => SITUACAO_VARIANTE[s] === "danger")).toEqual(["precisa_atencao"]);
  });
});

describe("podeResponder", () => {
  it("dentro da janela, pode", () => {
    expect(podeResponder(conversa({ handoffAt: HA_UMA_HORA }), AGORA).pode).toBe(true);
  });

  // A regra central da tela: se o opt-out valesse só para o robô, a tela seria
  // o jeito mais fácil de furá-lo.
  it("opt-out impede até a resposta de uma pessoa", () => {
    const v = podeResponder(conversa({ optedOutAt: HA_UMA_HORA }), AGORA);
    expect(v.pode).toBe(false);
    if (!v.pode) expect(v.motivo).toContain("não receber");
  });

  it("fora da janela recusa com o motivo em português, antes de gastar a viagem", () => {
    const v = podeResponder(conversa({ lastInboundAt: HA_DOIS_DIAS }), AGORA);
    expect(v.pode).toBe(false);
    if (!v.pode) expect(v.motivo).toContain("24h");
  });

  it("conversa sem mensagem recebida não tem janela", () => {
    expect(podeResponder(conversa({ lastInboundAt: null }), AGORA).pode).toBe(false);
  });
});

describe("podeDevolverAoRobo", () => {
  it("transferida volta", () => {
    expect(podeDevolverAoRobo(conversa({ handoffAt: HA_UMA_HORA })).pode).toBe(true);
  });

  it("o que já está com o robô não volta de novo", () => {
    expect(podeDevolverAoRobo(conversa()).pode).toBe(false);
  });

  // Devolver ao robô uma conversa de quem pediu silêncio é exatamente o que o
  // opt-out existe para impedir.
  it("quem pediu silêncio nunca volta para o robô", () => {
    expect(
      podeDevolverAoRobo(conversa({ optedOutAt: HA_UMA_HORA, handoffAt: HA_UMA_HORA })).pode
    ).toBe(false);
  });
});

describe("ordenarConversas", () => {
  it("quem precisa de gente vem primeiro, e a espera mais longa no topo", () => {
    const lista = [
      { nome: "robo", ...conversa() },
      { nome: "encerrada", ...conversa({ optedOutAt: HA_UMA_HORA }) },
      { nome: "atencao-recente", ...conversa({ handoffAt: HA_UMA_HORA, lastInboundAt: HA_UMA_HORA }) },
      { nome: "atencao-antiga", ...conversa({ handoffAt: HA_TRES_HORAS, lastInboundAt: HA_TRES_HORAS }) },
      { nome: "fora", ...conversa({ handoffAt: HA_UMA_HORA, lastInboundAt: HA_DOIS_DIAS }) },
    ];
    expect(ordenarConversas(lista, AGORA).map((c) => c.nome)).toEqual([
      "atencao-antiga",
      "atencao-recente",
      "fora",
      "robo",
      "encerrada",
    ]);
  });

  it("não modifica a lista recebida", () => {
    const lista = [conversa({ handoffAt: HA_UMA_HORA }), conversa()];
    const copia = [...lista];
    ordenarConversas(lista, AGORA);
    expect(lista).toEqual(copia);
  });

  // Sem mensagem recebida não há espera a medir — vai para o fim do grupo, em
  // vez de fingir que é a mais urgente.
  it("sem mensagem recebida fica no fim do próprio grupo", () => {
    const lista = [
      { nome: "sem-inbound", ...conversa({ lastInboundAt: null }) },
      { nome: "com-inbound", ...conversa({ lastInboundAt: HA_TRES_HORAS }) },
    ];
    expect(ordenarConversas(lista, AGORA).map((c) => c.nome)).toEqual(["com-inbound", "sem-inbound"]);
  });

  it("lista vazia não quebra", () => {
    expect(ordenarConversas([], AGORA)).toEqual([]);
  });
});

describe("telefoneLegivel", () => {
  it("celular e fixo brasileiros ganham máscara", () => {
    expect(telefoneLegivel("5541988887777")).toBe("(41) 98888-7777");
    expect(telefoneLegivel("554133334444")).toBe("(41) 3333-4444");
  });

  // Inventar máscara esconderia que o número é estrangeiro, e isso importa
  // para quem vai ligar.
  it("número de fora sai como veio", () => {
    expect(telefoneLegivel("351912345678")).toBe("+351912345678");
  });
});
