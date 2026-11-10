import { describe, it, expect } from "vitest";
import {
  situacaoDaConversa,
  podeResponder,
  podeDevolverAoRobo,
  podeEncerrar,
  ordenarConversas,
  telefoneLegivel,
  anterioresAo,
  paginaDeMensagens,
  contarSemResposta,
  resumoPorConversa,
  mesclarMensagens,
  intercalarEncerramentos,
  MENSAGENS_POR_VEZ,
  type CursorDeMensagem,
  SITUACAO_LABEL,
  SITUACAO_TOM,
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
    janelaLivreHoras: 24,
    atendimentoEncerradoEm: null,
    ...over,
  };
}

const TODAS: SituacaoDaConversa[] = ["precisa_atencao", "com_robo", "encerrada", "nao_quer", "fora_da_janela"];

describe("situacaoDaConversa", () => {
  it("todo estado tem rótulo e cor", () => {
    for (const s of TODAS) {
      expect(SITUACAO_LABEL[s]).toBeTruthy();
      expect(SITUACAO_TOM[s]).toBeTruthy();
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

  // Conversa na Evolution não tem janela: marcar "fora da janela" mandaria a
  // pessoa ligar para um candidato a quem ela pode simplesmente responder.
  it("provedor sem janela nunca fica fora da janela", () => {
    expect(
      situacaoDaConversa(
        conversa({ handoffAt: HA_UMA_HORA, lastInboundAt: HA_DOIS_DIAS, janelaLivreHoras: null }),
        AGORA
      )
    ).toBe("precisa_atencao");
  });

  it("opt-out vence a transferência", () => {
    expect(
      situacaoDaConversa(conversa({ optedOutAt: HA_UMA_HORA, handoffAt: HA_UMA_HORA }), AGORA)
    ).toBe("nao_quer");
  });

  it("só 'precisa de você' é vermelho", () => {
    expect(TODAS.filter((s) => SITUACAO_TOM[s] === "perigo")).toEqual(["precisa_atencao"]);
  });
});

describe("atendimento encerrado", () => {
  it("aparece como encerrado, e o opt-out continua valendo mais", () => {
    expect(situacaoDaConversa(conversa({ atendimentoEncerradoEm: HA_UMA_HORA }), AGORA)).toBe("encerrada");
    expect(SITUACAO_LABEL.encerrada).toBe("Encerrado");
    expect(
      situacaoDaConversa(conversa({ atendimentoEncerradoEm: HA_UMA_HORA, optedOutAt: HA_UMA_HORA }), AGORA)
    ).toBe("nao_quer");
  });

  it("encerra o que está aberto, com o assistente ou com uma pessoa", () => {
    expect(podeEncerrar(conversa()).pode).toBe(true);
    expect(podeEncerrar(conversa({ handoffAt: HA_UMA_HORA })).pode).toBe(true);
  });

  it("não encerra duas vezes nem o que o candidato já encerrou com PARAR", () => {
    expect(podeEncerrar(conversa({ atendimentoEncerradoEm: HA_UMA_HORA })).pode).toBe(false);
    expect(podeEncerrar(conversa({ optedOutAt: HA_UMA_HORA })).pode).toBe(false);
  });

  // Uma pessoa pode retomar uma conversa encerrada: responder abre outro atendimento.
  it("ainda deixa responder dentro da janela", () => {
    expect(podeResponder(conversa({ atendimentoEncerradoEm: HA_UMA_HORA }), AGORA).pode).toBe(true);
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

  it("opt-out impede até em provedor sem janela", () => {
    expect(podeResponder(conversa({ optedOutAt: HA_UMA_HORA, janelaLivreHoras: null }), AGORA).pode).toBe(false);
  });

  it("fora da janela recusa com o motivo em português, antes de gastar a viagem", () => {
    const v = podeResponder(conversa({ lastInboundAt: HA_DOIS_DIAS }), AGORA);
    expect(v.pode).toBe(false);
    if (!v.pode) expect(v.motivo).toContain("24h");
  });

  it("provedor sem janela deixa responder mesmo dias depois", () => {
    expect(podeResponder(conversa({ lastInboundAt: HA_DOIS_DIAS, janelaLivreHoras: null }), AGORA).pode).toBe(true);
  });

  it("conversa sem mensagem recebida não tem janela", () => {
    expect(podeResponder(conversa({ lastInboundAt: null }), AGORA).pode).toBe(false);
    expect(podeResponder(conversa({ lastInboundAt: null, janelaLivreHoras: null }), AGORA).pode).toBe(false);
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
      { nome: "nao-quer", ...conversa({ optedOutAt: HA_UMA_HORA }) },
      { nome: "encerrada", ...conversa({ atendimentoEncerradoEm: HA_UMA_HORA }) },
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
      "nao-quer",
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

// ── Paginação da conversa ────────────────────────────────────────────────────

type Msg = { id: string; createdAt: Date; direction: "ENTRADA" | "SAIDA"; threadId: string; body: string };

/** `n` mensagens, uma por minuto, a partir de `inicio`. */
function mensagens(n: number, over: (i: number) => Partial<Msg> = () => ({})): Msg[] {
  const inicio = Date.parse("2026-11-01T12:00:00Z");
  return Array.from({ length: n }, (_, i) => ({
    id: `m${String(i).padStart(4, "0")}`,
    createdAt: new Date(inicio + i * 60_000),
    direction: i % 2 === 0 ? "ENTRADA" : "SAIDA",
    threadId: "t1",
    body: `mensagem ${i}`,
    ...over(i),
  }));
}

/** O que o banco faz com o `where` de `anterioresAo`, o `orderBy` (data, id) desc e o `take`. */
function consultar(todas: Msg[], cursor: CursorDeMensagem | null, take: number): Msg[] {
  let antes = todas;
  if (cursor) {
    const [porData, noMesmoInstante] = anterioresAo(cursor).OR;
    antes = todas.filter(
      (m) =>
        m.createdAt.getTime() < porData.createdAt.lt.getTime() ||
        (m.createdAt.getTime() === noMesmoInstante.createdAt.getTime() && m.id < noMesmoInstante.id.lt)
    );
  }
  return [...antes]
    .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime() || (a.id < b.id ? 1 : -1))
    .slice(0, take);
}

describe("paginaDeMensagens", () => {
  // O bug: com `asc` e teto, uma conversa longa mostrava as mais ANTIGAS.
  it("150 mensagens: vêm as 100 mais novas, em ordem crescente, avisando que há anteriores", () => {
    const todas = mensagens(150);
    const p = paginaDeMensagens(consultar(todas, null, MENSAGENS_POR_VEZ + 1));
    expect(p.mensagens).toHaveLength(100);
    expect(p.mensagens[0]!.id).toBe("m0050");
    expect(p.mensagens.at(-1)!.id).toBe("m0149");
    expect(p.mensagens.map((m) => m.id)).toEqual(todas.slice(50).map((m) => m.id));
    expect(p.temAnteriores).toBe(true);
  });

  it("conversa curta vem inteira, sem anteriores", () => {
    const p = paginaDeMensagens(consultar(mensagens(30), null, MENSAGENS_POR_VEZ + 1));
    expect(p.mensagens).toHaveLength(30);
    expect(p.temAnteriores).toBe(false);
  });

  it("a página seguinte pelo cursor traz o resto, e no fim não há mais anteriores", () => {
    const todas = mensagens(150);
    const primeira = paginaDeMensagens(consultar(todas, null, MENSAGENS_POR_VEZ + 1));
    const m0 = primeira.mensagens[0]!;
    const segunda = paginaDeMensagens(consultar(todas, { em: m0.createdAt, id: m0.id }, MENSAGENS_POR_VEZ + 1));
    expect(segunda.mensagens.map((m) => m.id)).toEqual(todas.slice(0, 50).map((m) => m.id));
    expect(segunda.temAnteriores).toBe(false);
  });

  // O robô responde em lote: várias mensagens no mesmo milissegundo. Só pela
  // data, as do mesmo instante que caíssem na virada da página sumiriam (lt)
  // ou repetiriam (lte).
  it("o cursor desempata createdAt igual pelo id: nada some nem repete entre as páginas", () => {
    const mesmoInstante = new Date("2026-11-01T12:00:00Z");
    const todas = mensagens(7, () => ({ createdAt: mesmoInstante }));
    const vistas: string[] = [];
    let cursor: CursorDeMensagem | null = null;
    for (let volta = 0; volta < 10; volta++) {
      const p: { mensagens: Msg[]; temAnteriores: boolean } = paginaDeMensagens(consultar(todas, cursor, 3), 2);
      vistas.unshift(...p.mensagens.map((m) => m.id));
      if (!p.temAnteriores) break;
      cursor = { em: p.mensagens[0]!.createdAt, id: p.mensagens[0]!.id };
    }
    expect(vistas).toEqual(todas.map((m) => m.id));
  });
});

describe("sem resposta", () => {
  it("conta as de entrada depois da última resposta, pelas mais novas", () => {
    // Antigas: muita entrada sem resposta; depois uma resposta; depois 3 novas.
    const todas = [
      ...mensagens(10, () => ({ direction: "ENTRADA" })),
      ...mensagens(1, () => ({ id: "resp", direction: "SAIDA", createdAt: new Date("2026-11-02T12:00:00Z") })),
      ...mensagens(3, (i) => ({ id: `novo${i}`, direction: "ENTRADA", createdAt: new Date(Date.parse("2026-11-03T12:00:00Z") + i * 60_000) })),
    ];
    expect(contarSemResposta(consultar(todas, null, 21))).toBe(3);
  });

  it("na lista, cada conversa tem a sua última mensagem e as suas sem resposta, mesmo misturadas", () => {
    const a = mensagens(5, (i) => ({ threadId: "a", id: `a${i}`, direction: i < 3 ? "SAIDA" : "ENTRADA" }));
    const b = mensagens(4, (i) => ({ threadId: "b", id: `b${i}`, direction: i === 3 ? "SAIDA" : "ENTRADA" }));
    const tudoDesc = [...a, ...b].sort((x, y) => y.createdAt.getTime() - x.createdAt.getTime());
    const r = resumoPorConversa(tudoDesc);
    expect(r.get("a")).toEqual({ ultima: { body: "mensagem 4", createdAt: a[4]!.createdAt }, naoRespondidas: 2 });
    expect(r.get("b")).toEqual({ ultima: { body: "mensagem 3", createdAt: b[3]!.createdAt }, naoRespondidas: 0 });
    expect(r.has("c")).toBe(false);
  });
});

describe("mesclarMensagens", () => {
  it("junta sem repetir, na ordem da tela, e a versão nova de cada id vence", () => {
    const [m0, m1, m2, m3] = mensagens(4);
    const atualizada = { ...m2!, body: "status mudou" };
    const r = mesclarMensagens([m0!, m1!, m2!], [atualizada, m3!]);
    expect(r.map((m) => m.id)).toEqual(["m0000", "m0001", "m0002", "m0003"]);
    expect(r[2]!.body).toBe("status mudou");
  });
});

describe("intercalarEncerramentos", () => {
  const ms = mensagens(4);
  const antes = { em: new Date("2026-10-01T00:00:00Z") };
  const noMeio = { em: new Date(ms[1]!.createdAt.getTime() + 1) };
  const tipos = (itens: ReturnType<typeof intercalarEncerramentos<Msg, { em: Date }>>) =>
    itens.map((i) => (i.tipo === "mensagem" ? i.mensagem.id : `fim-${i.indice}`));

  it("com a conversa inteira, a marca antiga fica antes da primeira mensagem", () => {
    expect(tipos(intercalarEncerramentos(ms, [antes, noMeio], false))).toEqual(["fim-0", "m0000", "m0001", "fim-1", "m0002", "m0003"]);
  });

  // Sem isto, todo atendimento encerrado antes da página carregada aparecia
  // empilhado no topo, como se tivesse acontecido ali.
  it("com anteriores por carregar, a marca de antes da primeira carregada espera", () => {
    expect(tipos(intercalarEncerramentos(ms, [antes, noMeio], true))).toEqual(["m0000", "m0001", "fim-1", "m0002", "m0003"]);
  });
});
