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

/**
 * Carimbo de autor que o gateway de WhatsApp põe no começo do texto:
 * `*Wellington:* ...`, `**Juliana Coelho:** ...`, `*Ana Cecilia :* ...`.
 *
 * Só é lido em mensagem de conta marcada como automação. Medido no 41 Tech:
 * o carimbo aparece em 147 mensagens e **todas** são da conta do gateway —
 * nenhum atendente humano escreve assim. Ler o carimbo em todo mundo abriria a
 * porta para alguém citando um colega ("*Ana Cecilia:* ela disse que…") ser
 * confundido com a própria.
 *
 * `Contact` e `Name` são descartados: vêm do cartão de contato encaminhado
 * (`**Contact:** *Name:* …`), que não é pessoa atendendo.
 */
const CARIMBO_DE_AUTOR = /^\*{1,3}\s*([^*:\r\n]{2,40}?)\s*:\s*\*{1,3}\s*/;
const CARIMBOS_QUE_NAO_SAO_PESSOA = new Set(["contact", "name", "contato", "nome"]);

export function autorCarimbado(conteudo: string | null | undefined): string | null {
  const achado = conteudo?.match(CARIMBO_DE_AUTOR);
  if (!achado) return null;
  const nome = achado[1]!.replace(/\s+/g, " ").trim();
  if (!nome || CARIMBOS_QUE_NAO_SAO_PESSOA.has(nome.toLowerCase())) return null;
  return nome;
}

/**
 * Quem de fato escreveu a mensagem.
 *
 * Para conta de gente, é o remetente. Para conta de automação, é o autor
 * carimbado no texto — e `null` quando não há carimbo, porque aí a mensagem é o
 * sistema falando (saudação, aviso de fora de horário, pedido de avaliação,
 * agradecimento final) e isso não é atendimento de ninguém.
 *
 * Devolver `null` é o ponto: sem isso, a conta dona do token da integração
 * aparecia como responsável por atendimentos que nunca tocou, só porque foi a
 * última a "falar" — a mensagem de encerramento é sempre a última.
 */
export function autorEfetivo(
  m: MensagemSegmentavel,
  ehDeAutomacao: (senderLabel: string | null) => boolean
): string | null {
  if (!ehDeAutomacao(m.senderLabel)) return m.senderLabel?.trim() || null;
  return autorCarimbado(m.content);
}

function ultimoAtendente(
  mensagens: MensagemSegmentavel[],
  ehDeAutomacao: (senderLabel: string | null) => boolean
): string | null {
  for (let i = mensagens.length - 1; i >= 0; i--) {
    const m = mensagens[i]!;
    if (m.messageType !== "outgoing") continue;
    const autor = autorEfetivo(m, ehDeAutomacao);
    if (autor) return autor;
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
  resolvidoEm: Date,
  nomesDeAutomacao: Iterable<string> = []
): Segmento[] {
  if (mensagens.length === 0) return [];

  const conjunto = (nomes: Iterable<string>) =>
    new Set([...nomes].map((n) => normalizarNomeAtendente(n)).filter((n): n is string => n !== null));

  const recepcao = conjunto(nomesDaRecepcao);
  const automacao = conjunto(nomesDeAutomacao);

  const ehDeAutomacao = (senderLabel: string | null) => {
    const nome = normalizarNomeAtendente(senderLabel);
    return nome !== null && automacao.has(nome);
  };

  // A barreira olha o autor EFETIVO, não o remetente. Uma mensagem entregue
  // pelo gateway no nome do Wellington abre a tratativa; a de encerramento, que
  // não tem autor, não abre nada.
  const ehRespostaAoCliente = (m: MensagemSegmentavel) =>
    m.messageType === "outgoing" && autorEfetivo(m, ehDeAutomacao) !== null;

  const ehDaRecepcao = (m: MensagemSegmentavel) => {
    const nome = normalizarNomeAtendente(autorEfetivo(m, ehDeAutomacao));
    return nome !== null && recepcao.has(nome);
  };

  const indiceDaBarreira = mensagens.findIndex((m) => ehRespostaAoCliente(m) && !ehDaRecepcao(m));

  // Ninguém de fora da recepção falou: ou ela resolveu sozinha, ou ninguém
  // respondeu. Nos dois casos não houve tratativa.
  if (indiceDaBarreira === -1) {
    const atendente = ultimoAtendente(mensagens, ehDeAutomacao);
    if (atendente === null) return [];
    return [{ tipo: "TRIAGEM", mensagens, atendente, fim: resolvidoEm }];
  }

  const antes = mensagens.slice(0, indiceDaBarreira);
  const depois = mensagens.slice(indiceDaBarreira);
  const barreiraEm = mensagens[indiceDaBarreira]!.chatwootCreatedAt;

  const segmentos: Segmento[] = [];

  // Triagem só existe se a recepção realmente falou. Mensagem de cliente
  // sozinha antes do setor entrar não é trabalho de triagem — é fila.
  const atendenteTriagem = ultimoAtendente(antes, ehDeAutomacao);
  if (atendenteTriagem !== null) {
    segmentos.push({ tipo: "TRIAGEM", mensagens: antes, atendente: atendenteTriagem, fim: barreiraEm });
  }

  segmentos.push({
    tipo: "TRATATIVA",
    mensagens: depois,
    atendente: ultimoAtendente(depois, ehDeAutomacao),
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

  // Aqui basta ser mensagem do atendimento: o segmento já foi montado com o
  // autor efetivo, e a primeira saída dentro dele é a resposta que conta.
  const resposta = segmento.mensagens.find(
    (m) => m.messageType === "outgoing" && m.chatwootCreatedAt >= inicio
  );

  return { inicio, primeiraResposta: resposta?.chatwootCreatedAt ?? null, fim: segmento.fim };
}
