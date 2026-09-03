import { describe, expect, it } from "vitest";
import { segmentarAtendimento, janelaDeSla, type MensagemSegmentavel } from "./segments";

const RECEPCAO = ["Juliana Coelho"];
const t0 = new Date("2026-09-01T09:00:00Z");
const min = (n: number) => new Date(t0.getTime() + n * 60_000);

function msg(
  tipo: "cliente" | "atende",
  quem: string | null,
  minutos: number,
  texto = "..."
): MensagemSegmentavel {
  return {
    messageType: tipo === "cliente" ? "incoming" : "outgoing",
    senderLabel: quem,
    content: texto,
    chatwootCreatedAt: min(minutos),
  };
}

describe("segmentarAtendimento", () => {
  it("corta na primeira resposta de quem não é da recepção", () => {
    const conversa = [
      msg("cliente", null, 0, "bom dia"),
      msg("atende", "Juliana Coelho", 2, "bom dia, como posso ajudar?"),
      msg("cliente", null, 5, "preciso da guia"),
      msg("atende", "Ruli", 40, "segue a guia"),
      msg("atende", "Ruli", 42, "mais alguma coisa?"),
    ];
    const segs = segmentarAtendimento(conversa, RECEPCAO, min(60));

    expect(segs.map((s) => s.tipo)).toEqual(["TRIAGEM", "TRATATIVA"]);
    expect(segs[0]!.atendente).toBe("Juliana Coelho");
    expect(segs[0]!.mensagens).toHaveLength(3);
    expect(segs[0]!.fim).toEqual(min(40)); // a triagem termina quando o setor assume
    expect(segs[1]!.atendente).toBe("Ruli");
    expect(segs[1]!.mensagens).toHaveLength(2);
    expect(segs[1]!.fim).toEqual(min(60));
  });

  // Decisão de 2026-09-03: nenhum setor tratou, então não se inventa tratativa.
  it("recepção resolvendo sozinha rende só triagem", () => {
    const segs = segmentarAtendimento(
      [msg("cliente", null, 0), msg("atende", "Juliana Coelho", 3), msg("cliente", null, 4)],
      RECEPCAO,
      min(10)
    );
    expect(segs.map((s) => s.tipo)).toEqual(["TRIAGEM"]);
    expect(segs[0]!.fim).toEqual(min(10));
  });

  it("setor pegando direto rende só tratativa — não se dá nota a triagem que não houve", () => {
    const segs = segmentarAtendimento(
      [msg("cliente", null, 0), msg("atende", "Wellington", 5)],
      RECEPCAO,
      min(20)
    );
    expect(segs.map((s) => s.tipo)).toEqual(["TRATATIVA"]);
    expect(segs[0]!.atendente).toBe("Wellington");
  });

  it("quem responde por um trecho é o último a falar nele, não o que mais falou", () => {
    const segs = segmentarAtendimento(
      [
        msg("cliente", null, 0),
        msg("atende", "Juliana Coelho", 1),
        msg("atende", "Ruli", 10),
        msg("atende", "Ruli", 11),
        msg("atende", "Talita Souza", 30),
      ],
      RECEPCAO,
      min(40)
    );
    expect(segs[1]!.atendente).toBe("Talita Souza");
  });

  it("conversa sem nenhuma resposta ao cliente não tem o que avaliar", () => {
    expect(segmentarAtendimento([msg("cliente", null, 0)], RECEPCAO, min(5))).toEqual([]);
    expect(segmentarAtendimento([], RECEPCAO, min(5))).toEqual([]);
  });

  it("nome da recepção casa com espaço e caixa diferentes", () => {
    const segs = segmentarAtendimento(
      [msg("cliente", null, 0), msg("atende", "juliana  coelho", 2), msg("atende", "Ruli", 9)],
      RECEPCAO,
      min(20)
    );
    expect(segs.map((s) => s.tipo)).toEqual(["TRIAGEM", "TRATATIVA"]);
  });

  it("sem recepção marcada, o primeiro a responder já abre a tratativa", () => {
    const segs = segmentarAtendimento(
      [msg("cliente", null, 0), msg("atende", "Juliana Coelho", 2)],
      [],
      min(10)
    );
    expect(segs.map((s) => s.tipo)).toEqual(["TRATATIVA"]);
  });

  it("mensagem do cliente antes do setor entrar é fila, não triagem", () => {
    const segs = segmentarAtendimento(
      [msg("cliente", null, 0), msg("cliente", null, 1), msg("atende", "Katia", 90)],
      RECEPCAO,
      min(120)
    );
    expect(segs.map((s) => s.tipo)).toEqual(["TRATATIVA"]);
  });
});

describe("janelaDeSla", () => {
  const conversa = [
    msg("cliente", null, 0),
    msg("atende", "Juliana Coelho", 2),
    msg("cliente", null, 5),
    msg("atende", "Ruli", 45),
  ];
  const segs = segmentarAtendimento(conversa, RECEPCAO, min(60));

  it("triagem conta do primeiro pedido do cliente até a resposta da recepção", () => {
    const j = janelaDeSla(segs[0]!, [])!;
    expect(j.inicio).toEqual(min(0));
    expect(j.primeiraResposta).toEqual(min(2));
    expect(j.fim).toEqual(min(45));
  });

  // Sem isto o SLA da tratativa seria perfeito por construção: a barreira é,
  // por definição, a primeira fala do setor.
  it("tratativa conta da última mensagem antes da barreira, não da própria barreira", () => {
    const j = janelaDeSla(segs[1]!, segs[0]!.mensagens)!;
    expect(j.inicio).toEqual(min(5));
    expect(j.primeiraResposta).toEqual(min(45));
    expect(j.fim).toEqual(min(60));
  });

  it("segmento vazio não tem janela", () => {
    expect(janelaDeSla({ tipo: "TRIAGEM", mensagens: [], atendente: null, fim: min(1) }, [])).toBeNull();
  });
});

// ── Conta de automação (2026-09-03) ─────────────────────────────────────────
//
// O dono do token da integração aparecia como responsável por atendimentos que
// nunca tocou: o Chatwoot atribui a ele as mensagens do sistema, e a de
// encerramento é sempre a última — então a regra "quem fecha conduziu" o
// premiava. Parte das mensagens dele, porém, é atendimento real de outra
// pessoa, entregue por gateway que carimba o autor no texto.
const AUTOMACAO = ["Nathan Maciel"];

describe("conta de automação", () => {
  it("mensagem de encerramento não faz do sistema o atendente", () => {
    const segs = segmentarAtendimento(
      [
        msg("cliente", null, 0),
        msg("atende", "Juliana Coelho", 2),
        msg("atende", "Ruli", 20, "segue a guia"),
        msg("atende", "Nathan Maciel", 60, "*A 41 Contabilidade agradece seu contato!!!*"),
      ],
      RECEPCAO,
      min(65),
      AUTOMACAO
    );
    expect(segs.map((s) => s.tipo)).toEqual(["TRIAGEM", "TRATATIVA"]);
    expect(segs[1]!.atendente).toBe("Ruli");
  });

  it("mensagem carimbada volta para quem de fato escreveu", () => {
    const segs = segmentarAtendimento(
      [
        msg("cliente", null, 0),
        msg("atende", "Juliana Coelho", 2),
        msg("atende", "Nathan Maciel", 30, "*Wellington:* Ainda não saiu nada"),
      ],
      RECEPCAO,
      min(40),
      AUTOMACAO
    );
    expect(segs.map((s) => s.tipo)).toEqual(["TRIAGEM", "TRATATIVA"]);
    expect(segs[1]!.atendente).toBe("Wellington");
  });

  it("carimbo com dois asteriscos e espaço sobrando também casa", () => {
    const segs = segmentarAtendimento(
      [msg("cliente", null, 0), msg("atende", "Nathan Maciel", 5, "**Ana Cecilia :** Pode ser via WhatsApp")],
      RECEPCAO,
      min(10),
      AUTOMACAO
    );
    expect(segs[0]!.atendente).toBe("Ana Cecilia");
  });

  it("carimbo da própria recepção mantém a mensagem na triagem", () => {
    const segs = segmentarAtendimento(
      [
        msg("cliente", null, 0),
        msg("atende", "Nathan Maciel", 2, "**Juliana Coelho:** Combinado."),
        msg("atende", "Katia", 30, "resolvido"),
      ],
      RECEPCAO,
      min(40),
      AUTOMACAO
    );
    expect(segs.map((s) => s.tipo)).toEqual(["TRIAGEM", "TRATATIVA"]);
    expect(segs[0]!.atendente).toBe("Juliana Coelho");
    expect(segs[1]!.atendente).toBe("Katia");
  });

  it("cartão de contato encaminhado não vira atendente", () => {
    const segs = segmentarAtendimento(
      [
        msg("cliente", null, 0),
        msg("atende", "Ruli", 5, "segue"),
        msg("atende", "Nathan Maciel", 9, "**Contact:** *Name:* k2 Medicina e Segurança"),
      ],
      RECEPCAO,
      min(20),
      AUTOMACAO
    );
    expect(segs[0]!.atendente).toBe("Ruli");
  });

  it("só automação e nenhum carimbo: não há atendimento a avaliar", () => {
    expect(
      segmentarAtendimento(
        [msg("cliente", null, 0), msg("atende", "Nathan Maciel", 1, "***Bem vindo(a)!***")],
        RECEPCAO,
        min(5),
        AUTOMACAO
      )
    ).toEqual([]);
  });

  // Sem a marcação, o comportamento antigo continua — a conta é tratada como
  // gente. É o que garante que marcar seja decisão, não efeito colateral.
  it("sem marcar a conta como automação, nada muda", () => {
    const segs = segmentarAtendimento(
      [
        msg("cliente", null, 0),
        msg("atende", "Juliana Coelho", 2),
        msg("atende", "Ruli", 20),
        msg("atende", "Nathan Maciel", 60, "*A 41 Contabilidade agradece seu contato!!!*"),
      ],
      RECEPCAO,
      min(65)
    );
    expect(segs[1]!.atendente).toBe("Nathan Maciel");
  });

  it("atendente humano citando colega não perde a autoria", () => {
    const segs = segmentarAtendimento(
      [msg("cliente", null, 0), msg("atende", "Ruli", 5, "*Ana Cecilia:* falou que já protocolou")],
      RECEPCAO,
      min(10),
      AUTOMACAO
    );
    expect(segs[0]!.atendente).toBe("Ruli");
  });
});
