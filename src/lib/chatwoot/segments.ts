// Onde termina a triagem e começa a tratativa.
//
// Nesta operação todo atendimento entra pela recepção, que cumprimenta,
// entende o assunto e transfere para o setor. Avaliar isso como um atendimento
// só mede dois trabalhos diferentes com uma régua só: a recepção carrega o SLA
// de um setor que demorou dois dias, e o setor herda a saudação de quem nunca
// tratou nada.
//
// ─── Por que a barreira não é o evento de atribuição ─────────────────────────
//
// O caminho óbvio seria ler o "Atribuído a Fulano" que o Chatwoot grava como
// mensagem de atividade. Medido na base do 41 Tech: esse texto aparece em pelo
// menos quatro formatos — "Atribuído a X", "X atribuiu a Y", "Assigned to X" e
// "Conversa atribuída…" —, em português e inglês, além de reatribuição
// automática DEPOIS da resolução, que devolve a conversa para a fila da
// recepção. Casar isso por texto é a mesma armadilha de casar `<Numero>` e
// pegar `<NumeroLote>`.
//
// A barreira é **a primeira resposta ao cliente escrita por alguém que não é da
// recepção**. Isso é dado, não texto: não depende de idioma, de formato nem de
// o Chatwoot ter registrado a transferência.

import { normalizarNomeAtendente } from "./evaluation";

export type MensagemSegmentavel = {
  /** "incoming" (cliente) | "outgoing" (atendimento). */
  messageType: string;
  senderLabel: string | null;
  content: string | null;
  chatwootCreatedAt: Date;
};

export type TipoSegmento = "TRIAGEM" | "TRATATIVA";

export type Segmento = {
  tipo: TipoSegmento;
  mensagens: MensagemSegmentavel[];
  /**
   * Quem responde por este trecho: **o último a escrever ao cliente dentro
   * dele**. Mantém a regra que já valia para a conversa inteira — quem fecha é
   * quem conduziu —, agora aplicada a cada metade em vez de ao todo.
   */
  atendente: string | null;
  /**
   * Instante em que o trecho termina, para o SLA. Na triagem é a barreira
   * (a hora em que o setor assumiu); na tratativa, a resolução.
   */
  fim: Date;
};

function ehRespostaAoCliente(m: MensagemSegmentavel): boolean {
  return m.messageType === "outgoing" && !!m.senderLabel?.trim();
}

function ultimoAtendente(mensagens: MensagemSegmentavel[]): string | null {
  for (let i = mensagens.length - 1; i >= 0; i--) {
    const m = mensagens[i]!;
    if (ehRespostaAoCliente(m)) return m.senderLabel!.trim();
  }
  return null;
}

/**
 * Corta o atendimento nas suas metades.
 *
 * `nomesDaRecepcao` são os nomes (como aparecem no remetente da mensagem) de
 * quem faz triagem — vêm de `chatwoot_agent_links.isReception`, marcação
 * explícita, nunca deduzida de quem respondeu primeiro.
 *
 * Três formatos de saída, e cada um diz uma coisa diferente sobre o
 * atendimento:
 *
 * - **[TRIAGEM, TRATATIVA]** — o caso normal: recepção recebeu e o setor tratou.
 * - **[TRIAGEM]** — a recepção resolveu sozinha, nenhum setor entrou. Decidido
 *   em 2026-09-03 que isto **não** vira uma tratativa da recepção: nenhum setor
 *   tratou, e criar uma tratativa vazia mentiria no denominador de todo mundo.
 *   Quem quiser esse número tem o contador de "resolvidos na triagem".
 * - **[TRATATIVA]** — a recepção não escreveu nada; o setor pegou direto. Não
 *   existe triagem para avaliar, e forçar uma daria nota a um trabalho que não
 *   aconteceu.
 *
 * Sem nenhuma resposta ao cliente (só mensagens do cliente, ou conversa vazia),
 * devolve lista vazia: não há atendimento a avaliar.
 */
export function segmentarAtendimento(
  mensagens: MensagemSegmentavel[],
  nomesDaRecepcao: Iterable<string>,
  resolvidoEm: Date
): Segmento[] {
  if (mensagens.length === 0) return [];

  const recepcao = new Set(
    [...nomesDaRecepcao].map((n) => normalizarNomeAtendente(n)).filter((n): n is string => n !== null)
  );

  const ehDaRecepcao = (m: MensagemSegmentavel) => {
    const nome = normalizarNomeAtendente(m.senderLabel);
    return nome !== null && recepcao.has(nome);
  };

  const indiceDaBarreira = mensagens.findIndex((m) => ehRespostaAoCliente(m) && !ehDaRecepcao(m));

  // Ninguém de fora da recepção falou: ou ela resolveu sozinha, ou ninguém
  // respondeu. Nos dois casos não houve tratativa.
  if (indiceDaBarreira === -1) {
    const atendente = ultimoAtendente(mensagens);
    if (atendente === null) return [];
    return [{ tipo: "TRIAGEM", mensagens, atendente, fim: resolvidoEm }];
  }

  const antes = mensagens.slice(0, indiceDaBarreira);
  const depois = mensagens.slice(indiceDaBarreira);
  const barreiraEm = mensagens[indiceDaBarreira]!.chatwootCreatedAt;

  const segmentos: Segmento[] = [];

  // Triagem só existe se a recepção realmente falou. Mensagem de cliente
  // sozinha antes do setor entrar não é trabalho de triagem — é fila.
  const atendenteTriagem = ultimoAtendente(antes);
  if (atendenteTriagem !== null) {
    segmentos.push({ tipo: "TRIAGEM", mensagens: antes, atendente: atendenteTriagem, fim: barreiraEm });
  }

  segmentos.push({
    tipo: "TRATATIVA",
    mensagens: depois,
    atendente: ultimoAtendente(depois),
    fim: resolvidoEm,
  });

  return segmentos;
}

/**
 * Contexto de SLA de um segmento: quando o relógio começa e quando para.
 *
 * O início não é a primeira mensagem do trecho — é **a pergunta que o trecho
 * tinha de responder**. Na triagem, a primeira mensagem do cliente. Na
 * tratativa, a última mensagem antes da barreira: o cliente já falou, a
 * recepção já passou adiante, e o que se mede é quanto ele esperou o setor.
 *
 * Sem isso o SLA da tratativa seria sempre perfeito por construção, já que a
 * barreira é, por definição, a primeira fala do setor.
 */
export function janelaDeSla(
  segmento: Segmento,
  mensagensAnteriores: MensagemSegmentavel[]
): { inicio: Date; primeiraResposta: Date | null; fim: Date } | null {
  const primeira = segmento.mensagens[0];
  if (!primeira) return null;

  const inicio =
    segmento.tipo === "TRIAGEM"
      ? (segmento.mensagens.find((m) => m.messageType === "incoming") ?? primeira).chatwootCreatedAt
      : (mensagensAnteriores[mensagensAnteriores.length - 1] ?? primeira).chatwootCreatedAt;

  const resposta = segmento.mensagens.find(
    (m) => ehRespostaAoCliente(m) && m.chatwootCreatedAt >= inicio
  );

  return { inicio, primeiraResposta: resposta?.chatwootCreatedAt ?? null, fim: segmento.fim };
}
