// Conversa livre com o cliente — as regras, puras.
//
// ─── Conversa não é pendência ────────────────────────────────────────────────
//
// Pendência é pedido: tem prazo, entra na fila, cobra sozinha por e-mail e
// alguém precisa encerrar. Conversa é recado: sem prazo, sem status, sem fila.
// A única coisa que a conversa acompanha é **de quem é a vez**, e isso não é
// campo gravado — é quem escreveu por último.

/** O módulo que sustenta a conversa — o gate das duas telas e das duas actions. */
export const MODULO_DE_COMUNICACAO = "bpo_comunicacao";

/** De que lado da conversa está quem escreveu. O mesmo par das pendências. */
export type Lado = "EQUIPE" | "CLIENTE";

export type MensagemDaConversa = {
  id: string;
  lado: Lado;
  autorNome: string;
  corpo: string;
  criadaEm: Date;
  anexos: { id: string; fileName: string; sizeBytes: number }[];
};

export type ResumoDaConversa = {
  /** Última mensagem, para a lista mostrar do que se trata sem abrir. */
  ultima: { lado: Lado; autorNome: string; corpo: string; criadaEm: Date } | null;
  mensagens: number;
  anexos: number;
  /**
   * O cliente falou por último: a bola está com o escritório.
   *
   * É o mais perto de "não lido" que dá para ter sem inventar estado — e
   * responde a pergunta que o setor faz de manhã ("quem está esperando?"),
   * que é melhor que "o que eu ainda não abri".
   */
  esperandoEscritorio: boolean;
};

/** O resumo de uma conversa, para a lista de empresas. */
export function resumirConversa(mensagens: MensagemDaConversa[]): ResumoDaConversa {
  const ultima = mensagens.at(-1) ?? null;
  return {
    ultima: ultima ? { lado: ultima.lado, autorNome: ultima.autorNome, corpo: ultima.corpo, criadaEm: ultima.criadaEm } : null,
    mensagens: mensagens.length,
    anexos: mensagens.reduce((soma, m) => soma + m.anexos.length, 0),
    esperandoEscritorio: ultima?.lado === "CLIENTE",
  };
}

/** Primeira linha da mensagem, cortada, para caber na lista. */
export function previa(corpo: string, limite = 120): string {
  const limpo = corpo.replace(/\s+/g, " ").trim();
  if (limpo.length <= limite) return limpo;
  return `${limpo.slice(0, limite - 1).trimEnd()}…`;
}

/**
 * Ordena as empresas da lista: quem espera o escritório primeiro, e dentro
 * disso a conversa mais parada no topo — é a que mais custa deixar assim, a
 * mesma regra da fila de pendências e da de conversas do WhatsApp.
 */
export function ordenarConversas<T extends { resumo: ResumoDaConversa; empresaNome: string }>(itens: T[]): T[] {
  return [...itens].sort((a, b) => {
    if (a.resumo.esperandoEscritorio !== b.resumo.esperandoEscritorio) return a.resumo.esperandoEscritorio ? -1 : 1;
    const ta = a.resumo.ultima?.criadaEm.getTime() ?? 0;
    const tb = b.resumo.ultima?.criadaEm.getTime() ?? 0;
    if (ta !== tb) return a.resumo.esperandoEscritorio ? ta - tb : tb - ta;
    return a.empresaNome.localeCompare(b.empresaNome, "pt-BR");
  });
}
