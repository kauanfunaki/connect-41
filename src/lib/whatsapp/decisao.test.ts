import { describe, it, expect } from "vitest";
import {
  decidir,
  pediuParaSair,
  voltouAConversar,
  CONFIRMACAO_DE_SAIDA,
  dentroDaJanelaLivre,
  decidirComARespostaDoAgente,
  prometeContatoHumano,
  montarMensagens,
  dividirEmMensagens,
  pausaAntesDe,
  semCumprimentoRepetido,
  avisoDeRobo,
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
    janelaLivreHoras: 24,
    ...over,
  };
}

describe("voltouAConversar", () => {
  // No teste de 29/09, o "Oi" depois do PARAR ficou sem resposta.
  it("quem escreve de novo depois do PARAR está voltando", () => {
    for (const t of ["Oi", "oi, tudo bem?", "Bom dia", "Queria saber da vaga", "ok, mas e a entrevista?"]) {
      expect(voltouAConversar(t), t).toBe(true);
    }
  });

  it("despedida, outro PARAR ou mensagem sem palavra não reabre", () => {
    for (const t of ["ok", "Ok, obrigado!", "obrigada", "vlw", "tá bom", "👍", "🙏🙏", "...", "PARAR", "sair"]) {
      expect(voltouAConversar(t), t).toBe(false);
    }
  });

  it("a confirmação do PARAR diz como voltar", () => {
    expect(CONFIRMACAO_DE_SAIDA).toContain("oi");
    expect(voltouAConversar("oi")).toBe(true);
  });
});

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

  it("integração desligada transfere, não silencia — e não avisa, não há como mandar", () => {
    const d = decidir(estado({ integracaoLigada: false }), "oi", AGORA);
    expect(d.tipo).toBe("transferir");
    if (d.tipo === "transferir") expect(d.avisar).toBe(false);
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
    // O candidato fica sabendo que alguém vai continuar (achado de 29/09).
    if (d.tipo === "transferir") expect(d.avisar).toBe(true);
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
    if (d.tipo === "transferir") expect(d.avisar).toBe(false);
  });

  // Provedor sem janela (a Evolution) não pode transferir por uma regra que é
  // só da Meta — seria o robô parar de responder sem motivo nenhum.
  it("provedor sem janela nunca transfere por janela", () => {
    expect(decidir(estado({ lastInboundAt: HA_DOIS_DIAS, janelaLivreHoras: null }), "oi", AGORA).tipo).toBe(
      "responder"
    );
  });

  it("primeira mensagem da vida, sem inbound anterior, responde", () => {
    expect(decidir(estado({ lastInboundAt: null, jaSeApresentou: false }), "oi", AGORA).tipo).toBe(
      "responder"
    );
  });
});

describe("dentroDaJanelaLivre", () => {
  it("sem mensagem recebida, não há janela", () => {
    expect(dentroDaJanelaLivre(null, AGORA, 24)).toBe(false);
    expect(dentroDaJanelaLivre(null, AGORA, null)).toBe(false);
  });

  it("dentro e fora das 24h", () => {
    expect(dentroDaJanelaLivre(HA_UMA_HORA, AGORA, 24)).toBe(true);
    expect(dentroDaJanelaLivre(HA_DOIS_DIAS, AGORA, 24)).toBe(false);
  });

  it("exatamente 24h ainda vale", () => {
    expect(dentroDaJanelaLivre(new Date("2026-09-10T12:00:00Z"), AGORA, 24)).toBe(true);
  });

  it("sem janela no provedor, qualquer conversa com mensagem recebida está dentro", () => {
    expect(dentroDaJanelaLivre(HA_DOIS_DIAS, AGORA, null)).toBe(true);
  });
});

describe("motivo da transferência", () => {
  // No teste de 29/09, um pedido de ajuda legítimo apareceu na tela como
  // "o assistente sugeriu uma ação no processo seletivo".
  it("mostra o motivo que o assistente deu ao pedir uma pessoa", () => {
    const d = decidirComARespostaDoAgente({
      texto: "…",
      propostas: 1,
      truncado: false,
      motivoDaAjuda: "Candidato diz que se inscreveu, mas não achei inscrição com este número",
    });
    expect(d).toEqual({
      tipo: "transferir",
      motivo: "o assistente pediu ajuda: Candidato diz que se inscreveu, mas não achei inscrição com este número",
    });
  });

  it("sem motivo, continua o texto genérico", () => {
    expect(decidirComARespostaDoAgente({ texto: "x", propostas: 1, truncado: false })).toMatchObject({
      motivo: "o assistente sugeriu uma ação no processo seletivo",
    });
  });
});

describe("semCumprimentoRepetido", () => {
  it("tira o oi do começo, que a apresentação já fez", () => {
    expect(semCumprimentoRepetido("Oi! Não achei nenhuma candidatura.")).toBe("Não achei nenhuma candidatura.");
    expect(semCumprimentoRepetido("Olá, tudo bem? Posso ajudar.")).toBe("Tudo bem? Posso ajudar.");
    expect(semCumprimentoRepetido("Bom dia! 😊 Como posso ajudar?")).toBe("😊 Como posso ajudar?");
  });

  it("não mexe no que não começa com cumprimento, nem deixa a mensagem vazia", () => {
    expect(semCumprimentoRepetido("Oitenta vagas abertas")).toBe("Oitenta vagas abertas");
    expect(semCumprimentoRepetido("Temos duas vagas.")).toBe("Temos duas vagas.");
    expect(semCumprimentoRepetido("Oi!")).toBe("Oi!");
  });

  it("só vale na primeira mensagem, junto da apresentação", () => {
    expect(montarMensagens("Oi! Tudo certo por aqui, e com você?", true, "Escritório").at(-1)?.texto).toBe(
      "Tudo certo por aqui, e com você?"
    );
    expect(montarMensagens("Oi! Tudo certo por aqui, e com você?", false, "Escritório")[0]?.texto).toBe(
      "Oi! Tudo certo por aqui, e com você?"
    );
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

  it("o teto de tamanho vem do provedor quando informado", () => {
    expect(decidirComARespostaDoAgente({ texto: "x".repeat(101), propostas: 0, truncado: false }, 100).tipo).toBe(
      "transferir"
    );
  });

  // O caso real de 15/09: a promessa saiu e ninguém assumiu. Agora a mensagem
  // sai e a conversa é transferida — a promessa vira verdade.
  it("promessa de contato sem ferramenta sai e transfere", () => {
    const texto =
      "Oi! Esta conversa ainda não está ligada a nenhuma candidatura; vou passar seu caso para a pessoa do time confirmar o próximo passo. Assim que houver confirmação, alguém do time entra em contato.";
    const d = decidirComARespostaDoAgente({ texto, propostas: 0, truncado: false });
    expect(d.tipo).toBe("enviar_e_transferir");
    if (d.tipo === "enviar_e_transferir") expect(d.texto).toBe(texto);
  });

  it("proposta continua valendo mais que a promessa: não envia", () => {
    const d = decidirComARespostaDoAgente({ texto: "Vou te transferir para o time.", propostas: 1, truncado: false });
    expect(d.tipo).toBe("transferir");
  });
});

describe("prometeContatoHumano", () => {
  it.each([
    "vou passar seu caso para a pessoa do time",
    "Alguém do time entra em contato em breve.",
    "Vou te transferir para um atendente.",
    "Uma pessoa da equipe vai entrar em contato com você.",
    "Vamos encaminhar sua dúvida ao recrutador.",
    "Nossa equipe retornará o contato.",
  ])("detecta: %s", (texto) => {
    expect(prometeContatoHumano(texto)).toBe(true);
  });

  it.each([
    "Claro! Vagas abertas no momento: Analista, empresa FIEL TRANSPORTES. Quer detalhes de alguma?",
    "Somos o atendimento virtual de Recrutamento da 41 Tech.",
    "Se preferir falar com uma pessoa, é só pedir.",
    "Sua candidatura está em triagem.",
  ])("não detecta: %s", (texto) => {
    expect(prometeContatoHumano(texto)).toBe(false);
  });
});

describe("montarMensagens", () => {
  // O primeiro contato tem de dizer que é robô e como sair. É o que torna o
  // "PARAR" uma opção real, e não um segredo de quem escreveu o código.
  it("a apresentação vem numa mensagem própria, fixa, e diz que é robô, de qual escritório e como sair", () => {
    const [apresentacao, resposta] = montarMensagens("Temos duas vagas abertas agora.", true, "Escritório Exemplo");
    expect(apresentacao).toEqual({ texto: avisoDeRobo("Escritório Exemplo"), fixa: true });
    expect(apresentacao!.texto).toContain("Escritório Exemplo");
    expect(apresentacao!.texto).toContain("PARAR");
    expect(resposta).toEqual({ texto: "Temos duas vagas abertas agora.", fixa: false });
  });

  // Regressão de 14/09: o texto dizia "41 Contábil" para o candidato de
  // qualquer cliente do Connect.
  it("não carrega o nome de um escritório fixo", () => {
    expect(avisoDeRobo("Escritório Exemplo")).not.toContain("41 Contábil");
  });

  it("depois da primeira, não se apresenta de novo", () => {
    expect(montarMensagens("Oi!", false, "Escritório Exemplo")).toEqual([{ texto: "Oi!", fixa: false }]);
  });
});

describe("dividirEmMensagens", () => {
  // Pedido do teste de 30/09: resposta num bloco só era longa demais.
  it("cada parágrafo vira uma mensagem", () => {
    expect(dividirEmMensagens("Temos duas vagas abertas no momento.\n\nQuer que eu mande o link de alguma delas?")).toEqual([
      "Temos duas vagas abertas no momento.",
      "Quer que eu mande o link de alguma delas?",
    ]);
  });

  it("parágrafo curto demais gruda no seguinte", () => {
    expect(dividirEmMensagens("Claro!\n\nA vaga de Analista é na Fiel Transportes.")).toEqual([
      "Claro!\nA vaga de Analista é na Fiel Transportes.",
    ]);
  });

  it("não passa de três: o que sobra vai junto na última, sem cortar frase", () => {
    const texto = [
      "Primeira ideia completa aqui.",
      "Segunda ideia completa aqui.",
      "Terceira ideia completa aqui.",
      "Quarta ideia completa aqui.",
    ].join("\n\n");
    const partes = dividirEmMensagens(texto);
    expect(partes).toHaveLength(3);
    expect(partes[2]).toBe("Terceira ideia completa aqui.\n\nQuarta ideia completa aqui.");
  });

  it("uma linha só continua uma mensagem só, e vazio não vira mensagem", () => {
    expect(dividirEmMensagens("Sua candidatura está em triagem.")).toEqual(["Sua candidatura está em triagem."]);
    expect(dividirEmMensagens("   \n\n  ")).toEqual([]);
  });
});

describe("pausaAntesDe", () => {
  it("cresce com o texto e não passa de 2,5 s", () => {
    expect(pausaAntesDe("ok")).toBeLessThan(pausaAntesDe("uma mensagem bem mais comprida que a outra"));
    expect(pausaAntesDe("x".repeat(5_000))).toBe(2_500);
  });
});
