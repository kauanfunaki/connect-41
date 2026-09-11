import { describe, it, expect } from "vitest";
import {
  decidir,
  pediuParaSair,
  dentroDaJanelaLivre,
  decidirComARespostaDoAgente,
  montarMensagem,
  AVISO_DE_ROBO,
  MAX_RESPOSTAS_POR_HORA,
  MAX_CARACTERES_DA_MENSAGEM,
  type EstadoDaConversa,
} from "./decisao";

const AGORA = new Date("2026-09-11T12:00:00Z");
const HA_UMA_HORA = new Date("2026-09-11T11:00:00Z");
const HA_DOIS_DIAS = new Date("2026-09-09T12:00:00Z");

function estado(over: Partial<EstadoDaConversa> = {}): EstadoDaConversa {
  return {
    integracaoLigada: true,
    optedOutAt: null,
    handoffAt: null,
    lastInboundAt: HA_UMA_HORA,
    respostasNaUltimaHora: 0,
    jaSeApresentou: true,
    ...over,
  };
}

describe("pediuParaSair", () => {
  it("reconhece as palavras em qualquer caixa, com acento e com pontuação", () => {
    for (const t of ["PARAR", "parar", " Pare ", "Sair", "SAÍR", "cancelar", "STOP", "descadastrar", "parar."]) {
      expect(pediuParaSair(t), t).toBe(true);
    }
  });

  // Compara a mensagem inteira, não "contém": descadastrar alguém por causa de
  // uma palavra no meio da frase é um erro que a pessoa só descobre quando não
  // recebe a resposta que esperava.
  it("não confunde a palavra dentro de uma frase", () => {
    for (const t of [
      "não quero parar de tentar",
      "posso parar aí amanhã?",
      "vou cancelar minha outra entrevista",
    ]) {
      expect(pediuParaSair(t), t).toBe(false);
    }
  });

  it("frase vazia não é pedido de saída", () => {
    expect(pediuParaSair("   ")).toBe(false);
  });
});

describe("decidir", () => {
  it("conversa normal responde", () => {
    expect(decidir(estado(), "oi, tudo bem?", AGORA)).toEqual({ tipo: "responder", apresentar: false });
  });

  it("primeira resposta se apresenta", () => {
    expect(decidir(estado({ jaSeApresentou: false }), "oi", AGORA)).toEqual({
      tipo: "responder",
      apresentar: true,
    });
  });

  // A recusa que vem antes de todas: uma segunda mensagem depois de "PARAR" é
  // a falha que vira reclamação.
  it("quem pediu para sair não recebe mais nada, nem de novo", () => {
    const d = decidir(estado({ optedOutAt: HA_UMA_HORA }), "PARAR", AGORA);
    expect(d.tipo).toBe("silenciar");
  });

  it("quem pede para sair recebe uma confirmação, e só", () => {
    expect(decidir(estado(), "PARAR", AGORA)).toEqual({ tipo: "confirmar_saida" });
  });

  // Opt-out vence até a integração desligada: desligada, a conversa iria para
  // uma pessoa, e uma pessoa poderia escrever para quem pediu silêncio.
  it("opt-out vence a integração desligada", () => {
    const d = decidir(estado({ optedOutAt: HA_UMA_HORA, integracaoLigada: false }), "oi", AGORA);
    expect(d.tipo).toBe("silenciar");
  });

  it("integração desligada transfere, não silencia", () => {
    const d = decidir(estado({ integracaoLigada: false }), "oi", AGORA);
    expect(d.tipo).toBe("transferir");
  });

  // Voltar sozinha seria o candidato receber robô no meio de uma conversa que
  // uma pessoa estava conduzindo.
  it("conversa transferida não volta para o robô", () => {
    const d = decidir(estado({ handoffAt: HA_UMA_HORA }), "e aí?", AGORA);
    expect(d.tipo).toBe("silenciar");
  });

  it("muitas respostas na hora viram caso de gente", () => {
    const d = decidir(estado({ respostasNaUltimaHora: MAX_RESPOSTAS_POR_HORA }), "oi", AGORA);
    expect(d.tipo).toBe("transferir");
    if (d.tipo === "transferir") expect(d.motivo).toContain("última hora");
  });

  it("uma resposta abaixo do teto ainda responde", () => {
    expect(decidir(estado({ respostasNaUltimaHora: MAX_RESPOSTAS_POR_HORA - 1 }), "oi", AGORA).tipo).toBe(
      "responder"
    );
  });

  it("fora da janela de 24h não manda mensagem livre", () => {
    const d = decidir(estado({ lastInboundAt: HA_DOIS_DIAS }), "oi", AGORA);
    expect(d.tipo).toBe("transferir");
    if (d.tipo === "transferir") expect(d.motivo).toContain("24h");
  });

  it("primeira mensagem da vida, sem inbound anterior, responde", () => {
    expect(decidir(estado({ lastInboundAt: null, jaSeApresentou: false }), "oi", AGORA).tipo).toBe(
      "responder"
    );
  });
});

describe("dentroDaJanelaLivre", () => {
  it("sem mensagem recebida, não há janela", () => {
    expect(dentroDaJanelaLivre(null, AGORA)).toBe(false);
  });

  it("dentro e fora das 24h", () => {
    expect(dentroDaJanelaLivre(HA_UMA_HORA, AGORA)).toBe(true);
    expect(dentroDaJanelaLivre(HA_DOIS_DIAS, AGORA)).toBe(false);
  });

  it("exatamente 24h ainda vale", () => {
    expect(dentroDaJanelaLivre(new Date("2026-09-10T12:00:00Z"), AGORA)).toBe(true);
  });
});

describe("decidirComARespostaDoAgente", () => {
  it("resposta normal sai", () => {
    expect(decidirComARespostaDoAgente({ texto: "Sua entrevista é quinta.", propostas: 0, truncado: false })).toEqual(
      { tipo: "enviar", texto: "Sua entrevista é quinta." }
    );
  });

  // O agente querer agir já é o sinal de que o caso é de gente. A resposta
  // dele não sai.
  it("qualquer proposta transfere, e a resposta não é enviada", () => {
    const d = decidirComARespostaDoAgente({ texto: "Vou te mover para entrevista!", propostas: 1, truncado: false });
    expect(d.tipo).toBe("transferir");
  });

  // Candidato que escreveu e ficou sem retorno é o pior desfecho desta
  // conversa — pior que transferir à toa.
  it("resposta vazia transfere, não silencia", () => {
    expect(decidirComARespostaDoAgente({ texto: "   ", propostas: 0, truncado: false }).tipo).toBe(
      "transferir"
    );
  });

  it("resposta truncada não sai pela metade", () => {
    expect(decidirComARespostaDoAgente({ texto: "A sua situação é", propostas: 0, truncado: true }).tipo).toBe(
      "transferir"
    );
  });

  // Cortar e mandar assim é pior que não mandar: o candidato lê meia
  // informação e age sobre ela.
  it("resposta longa demais transfere, em vez de ser cortada", () => {
    const d = decidirComARespostaDoAgente({
      texto: "x".repeat(MAX_CARACTERES_DA_MENSAGEM + 1),
      propostas: 0,
      truncado: false,
    });
    expect(d.tipo).toBe("transferir");
  });
});

describe("montarMensagem", () => {
  // O primeiro contato tem de dizer que é robô e como sair. É o que torna o
  // "PARAR" uma opção real, e não um segredo de quem escreveu o código.
  it("a apresentação diz que é robô e como sair", () => {
    const m = montarMensagem("Oi!", true);
    expect(m).toContain(AVISO_DE_ROBO);
    expect(m).toContain("PARAR");
    expect(m).toContain("Oi!");
  });

  it("depois da primeira, não se apresenta de novo", () => {
    expect(montarMensagem("Oi!", false)).toBe("Oi!");
  });
});
