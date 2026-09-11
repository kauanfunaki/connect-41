// O que a tela de conversas precisa decidir, sem tocar no banco.
//
// A regra que importa aqui é a mesma do robô, aplicada a gente: **opt-out vale
// para todo mundo**. Quem pediu para parar não recebe mensagem nem de uma
// pessoa clicando — se valesse só para o robô, o pedido do candidato não teria
// significado nenhum, e a tela seria o jeito mais fácil de furá-lo.

import { dentroDaJanelaLivre, JANELA_LIVRE_EM_HORAS } from "@/lib/whatsapp/decisao";

export type ConversaParaTela = {
  optedOutAt: Date | null;
  handoffAt: Date | null;
  lastInboundAt: Date | null;
  candidaturaId: string | null;
};

export type SituacaoDaConversa =
  /** Transferida e aguardando alguém. É a fila da tela. */
  | "precisa_atencao"
  /** O robô está conduzindo. */
  | "com_robo"
  /** Pediu para não receber mais. */
  | "encerrada"
  /** Transferida, mas passou das 24h: só template resolve. */
  | "fora_da_janela";

export function situacaoDaConversa(c: ConversaParaTela, agora: Date): SituacaoDaConversa {
  if (c.optedOutAt) return "encerrada";
  if (!c.handoffAt) return "com_robo";
  // Transferida: a pergunta seguinte é se ainda dá para responder. Separar os
  // dois estados existe porque a ação da pessoa é diferente — num caso ela
  // responde, no outro precisa ligar ou mandar template.
  return dentroDaJanelaLivre(c.lastInboundAt, agora) ? "precisa_atencao" : "fora_da_janela";
}

export const SITUACAO_LABEL: Record<SituacaoDaConversa, string> = {
  precisa_atencao: "Precisa de você",
  com_robo: "Com o assistente",
  encerrada: "Não quer mensagens",
  fora_da_janela: "Fora das 24h",
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
  if (!dentroDaJanelaLivre(c.lastInboundAt, agora)) {
    return {
      pode: false,
      motivo: `Passaram-se mais de ${JANELA_LIVRE_EM_HORAS}h desde a última mensagem dele. O WhatsApp só permite retomar por modelo aprovado — ligue ou aguarde ele escrever.`,
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
export function podeDevolverAoRobo(c: ConversaParaTela): VereditoDeResposta {
  if (c.optedOutAt) {
    return { pode: false, motivo: "O candidato pediu para não receber mais mensagens." };
  }
  if (!c.handoffAt) return { pode: false, motivo: "Esta conversa já está com o assistente." };
  return { pode: true };
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

/** Formata o telefone da Meta (E.164 sem "+") como as pessoas leem. */
export function telefoneLegivel(waPhone: string): string {
  const d = waPhone.replace(/\D/g, "");
  const semPais = d.startsWith("55") ? d.slice(2) : d;
  if (semPais.length === 11) return `(${semPais.slice(0, 2)}) ${semPais.slice(2, 7)}-${semPais.slice(7)}`;
  if (semPais.length === 10) return `(${semPais.slice(0, 2)}) ${semPais.slice(2, 6)}-${semPais.slice(6)}`;
  // Número que não tem cara de brasileiro sai como veio: inventar máscara
  // esconderia que o número é estrangeiro, e isso importa para quem vai ligar.
  return `+${d}`;
}
