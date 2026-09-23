// O que a tela de conversas precisa decidir, sem tocar no banco.
//
// A regra que importa aqui é a mesma do robô, aplicada a gente: **opt-out vale
// para todo mundo**. Quem pediu para parar não recebe mensagem nem de uma
// pessoa clicando — se valesse só para o robô, o pedido do candidato não teria
// significado nenhum, e a tela seria o jeito mais fácil de furá-lo.

import { dentroDaJanelaLivre } from "@/lib/whatsapp/decisao";

export type ConversaParaTela = {
  optedOutAt: Date | null;
  handoffAt: Date | null;
  lastInboundAt: Date | null;
  candidaturaId: string | null;
  /** Janela de mensagem livre do provedor desta conversa. `null` = sem janela. */
  janelaLivreHoras: number | null;
};

export type SituacaoDaConversa =
  /** Transferida e aguardando alguém. É a fila da tela. */
  | "precisa_atencao"
  /** O robô está conduzindo. */
  | "com_robo"
  /** Pediu para não receber mais. */
  | "encerrada"
  /** Transferida, mas passou da janela do provedor: só template resolve. */
  | "fora_da_janela";

export function situacaoDaConversa(c: ConversaParaTela, agora: Date): SituacaoDaConversa {
  if (c.optedOutAt) return "encerrada";
  if (!c.handoffAt) return "com_robo";
  // Transferida: a pergunta seguinte é se ainda dá para responder. Separar os
  // dois estados existe porque a ação da pessoa é diferente — num caso ela
  // responde, no outro precisa ligar ou mandar template.
  return dentroDaJanelaLivre(c.lastInboundAt, agora, c.janelaLivreHoras) ? "precisa_atencao" : "fora_da_janela";
}

export const SITUACAO_LABEL: Record<SituacaoDaConversa, string> = {
  precisa_atencao: "Precisa de você",
  com_robo: "Com o assistente",
  encerrada: "Não quer mensagens",
  fora_da_janela: "Fora da janela",
};

export const SITUACAO_VARIANTE: Record<SituacaoDaConversa, "danger" | "warning" | "info" | "success"> = {
  precisa_atencao: "danger",
  com_robo: "success",
  encerrada: "info",
  fora_da_janela: "warning",
};

export type VereditoDeResposta = { pode: true } | { pode: false; motivo: string };

/**
 * Esta pessoa pode responder nesta conversa agora?
 *
 * Fora da janela a Meta simplesmente recusa a mensagem livre, e o erro dela não
 * explica isso para quem clicou — então a recusa é nossa, com o motivo em
 * português, antes de gastar a viagem.
 */
export function podeResponder(c: ConversaParaTela, agora: Date): VereditoDeResposta {
  if (c.optedOutAt) {
    return { pode: false, motivo: "O candidato pediu para não receber mais mensagens por aqui." };
  }
  if (!dentroDaJanelaLivre(c.lastInboundAt, agora, c.janelaLivreHoras)) {
    if (c.janelaLivreHoras === null || !c.lastInboundAt) {
      return { pode: false, motivo: "Ele ainda não escreveu nesta conversa." };
    }
    return {
      pode: false,
      motivo: `Passaram-se mais de ${c.janelaLivreHoras}h desde a última mensagem dele. O WhatsApp só permite retomar por modelo aprovado — ligue ou aguarde ele escrever.`,
    };
  }
  return { pode: true };
}

/**
 * Devolver a conversa ao robô é permitido?
 *
 * Só o que está transferido volta, e o que foi encerrado a pedido do candidato
 * nunca volta — devolver ao robô uma conversa de quem pediu silêncio é
 * exatamente o que o opt-out existe para impedir.
 */
export function podeDevolverAoRobo(c: Pick<ConversaParaTela, "optedOutAt" | "handoffAt">): VereditoDeResposta {
  if (c.optedOutAt) {
    return { pode: false, motivo: "O candidato pediu para não receber mais mensagens." };
  }
  if (!c.handoffAt) return { pode: false, motivo: "Esta conversa já está com o assistente." };
  return { pode: true };
}

// ─── Quem assume ────────────────────────────────────────────────────────────

/**
 * Esta pessoa pode assumir a conversa?
 *
 * Assumir de quem já assumiu é permitido — alguém sai de férias, a conversa não
 * pode ficar presa —, mas fica no log. Assumir conversa que está com o
 * assistente também: é o jeito de tirá-la dele antes de escrever. A única
 * recusa é quem pediu para não receber mensagens: não há o que atender.
 */
export function podeAssumir(
  c: { optedOutAt: Date | null; assignedToId: string | null },
  userId: string
): VereditoDeResposta {
  if (c.optedOutAt) return { pode: false, motivo: "O candidato pediu para não receber mais mensagens." };
  if (c.assignedToId === userId) return { pode: false, motivo: "Esta conversa já está com você." };
  return { pode: true };
}

/** Soltar devolve a conversa à fila, sem responsável. Só quem está com ela solta. */
export function podeSoltar(c: { assignedToId: string | null }, userId: string): VereditoDeResposta {
  if (!c.assignedToId) return { pode: false, motivo: "Ninguém assumiu esta conversa." };
  if (c.assignedToId !== userId) return { pode: false, motivo: "Só quem assumiu a conversa pode soltá-la." };
  return { pode: true };
}

/**
 * Quem é avisado quando a conversa pede alguém.
 *
 * Quem assumiu, se houver — a conversa é dele. Senão, o responsável pela vaga
 * da candidatura ligada, que é quem conhece o processo. Sem nenhum dos dois, o
 * setor inteiro: alguém precisa ver, e a fila é de todos.
 */
export function destinoDoAviso(c: {
  assignedToId: string | null;
  responsavelDaVagaId: string | null;
}): { usuario: string } | { setor: true } {
  if (c.assignedToId) return { usuario: c.assignedToId };
  if (c.responsavelDaVagaId) return { usuario: c.responsavelDaVagaId };
  return { setor: true };
}

/** Intervalo mínimo entre avisos de mensagem nova na mesma conversa. */
export const INTERVALO_ENTRE_AVISOS_MS = 15 * 60_000;

/**
 * Mensagem nova numa conversa que já está com gente: avisa?
 *
 * Só quando ela reabre a conversa depois de um silêncio. Candidato escreve em
 * rajada — "oi", "tudo bem?", "sobre a vaga…" —, e um aviso por linha faz o
 * recrutador desligar os avisos, que é pior que não ter.
 */
export function avisarMensagemNova(ultimaAntes: Date | null, agora: Date): boolean {
  if (!ultimaAntes) return true;
  return agora.getTime() - ultimaAntes.getTime() >= INTERVALO_ENTRE_AVISOS_MS;
}

/** Os recortes da lista de conversas. */
export type RecorteDaLista = "todas" | "minhas" | "sem_responsavel";

export function recorteDaUrl(v: string | undefined): RecorteDaLista {
  return v === "minhas" || v === "sem_responsavel" ? v : "todas";
}

/**
 * "Sem responsável" é a fila de verdade: transferidas que ninguém assumiu. As
 * que estão com o assistente não entram — não esperam ninguém.
 */
export function filtrarConversas<T extends ConversaParaTela & { responsavel: { id: string } | null }>(
  conversas: T[],
  recorte: RecorteDaLista,
  userId: string
): T[] {
  if (recorte === "minhas") return conversas.filter((c) => c.responsavel?.id === userId);
  if (recorte === "sem_responsavel") {
    return conversas.filter((c) => c.handoffAt && !c.optedOutAt && !c.responsavel);
  }
  return conversas;
}

/**
 * A ordem da fila.
 *
 * Quem precisa de gente primeiro, e dentro disso a espera mais longa no topo —
 * é a conversa que está sem resposta há mais tempo, e a que mais custa deixar
 * parada. Encerradas vão para o fim: não há o que fazer com elas.
 */
export function ordenarConversas<T extends ConversaParaTela>(conversas: T[], agora: Date): T[] {
  const peso: Record<SituacaoDaConversa, number> = {
    precisa_atencao: 0,
    fora_da_janela: 1,
    com_robo: 2,
    encerrada: 3,
  };
  return [...conversas].sort((a, b) => {
    const da = peso[situacaoDaConversa(a, agora)];
    const db = peso[situacaoDaConversa(b, agora)];
    if (da !== db) return da - db;
    // Sem mensagem recebida vai para o fim do grupo: não há espera a medir.
    const ta = a.lastInboundAt?.getTime() ?? Infinity;
    const tb = b.lastInboundAt?.getTime() ?? Infinity;
    return ta - tb;
  });
}

/** Formata o telefone (DDI + número, sem "+") como as pessoas leem. */
export function telefoneLegivel(waPhone: string): string {
  const d = waPhone.replace(/\D/g, "");
  const semPais = d.startsWith("55") ? d.slice(2) : d;
  if (semPais.length === 11) return `(${semPais.slice(0, 2)}) ${semPais.slice(2, 7)}-${semPais.slice(7)}`;
  if (semPais.length === 10) return `(${semPais.slice(0, 2)}) ${semPais.slice(2, 6)}-${semPais.slice(6)}`;
  // Número que não tem cara de brasileiro sai como veio: inventar máscara
  // esconderia que o número é estrangeiro, e isso importa para quem vai ligar.
  return `+${d}`;
}
