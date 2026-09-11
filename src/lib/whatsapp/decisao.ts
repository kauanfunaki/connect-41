// Quando o robô responde — e, principalmente, quando não responde.
//
// ─── A diferença desta onda ─────────────────────────────────────────────────
//
// Até aqui, todo agente do Connect produzia texto para alguém de dentro ler.
// Este manda mensagem para um candidato, no celular dele. **Não dá para
// desfazer**, e o destinatário é uma pessoa que está esperando notícia de um
// emprego.
//
// A regra das ondas anteriores — o agente propõe, uma pessoa confirma — não
// serve aqui: um chatbot que precisa de confirmação a cada mensagem não é
// chatbot. Então a fronteira muda de lugar: em vez de confirmar **cada** ação,
// limita-se **o que ele pode dizer**, e tudo que sai do combinado vira
// transferência para gente.
//
// O que o robô nunca faz, e está no prompt e aqui:
//
// - não reprova ninguém;
// - não faz, insinua nem negocia proposta ou salário;
// - não confirma contratação;
// - não promete prazo que não leu no sistema.
//
// E o corolário que vale como código: **qualquer proposta que o agente emitir
// é motivo de transferência.** O agente querer agir já é o sinal de que o caso
// é de gente — ver `decidirComARespostaDoAgente`.

/** Janela de mensagem livre da Meta. Fora dela, só template aprovado. */
export const JANELA_LIVRE_EM_HORAS = 24;

/** Teto de respostas do robô por hora, na mesma conversa. */
export const MAX_RESPOSTAS_POR_HORA = 10;

export const PALAVRAS_DE_SAIDA = ["parar", "pare", "sair", "cancelar", "descadastrar", "stop"];

export const AVISO_DE_ROBO =
  "Oi! Aqui é o assistente virtual do Recrutamento da 41 Contábil. " +
  "Posso te ajudar com informações sobre o seu processo seletivo. " +
  "Se preferir falar com uma pessoa, é só pedir. Para não receber mais mensagens, responda PARAR.";

export const CONFIRMACAO_DE_SAIDA =
  "Pronto, não vamos mais te enviar mensagens por aqui. Se mudar de ideia, é só escrever.";

/**
 * O texto é um pedido para parar?
 *
 * Compara a mensagem inteira, normalizada — e não "contém". "Não quero parar
 * de tentar" contém "parar", e descadastrar alguém por isso é um erro que a
 * pessoa só descobre quando não recebe a resposta que esperava.
 */
export function pediuParaSair(texto: string): boolean {
  const limpo = texto
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z]/g, "");
  return PALAVRAS_DE_SAIDA.includes(limpo);
}

export type EstadoDaConversa = {
  /** A conexão está ligada para este cliente. */
  integracaoLigada: boolean;
  optedOutAt: Date | null;
  handoffAt: Date | null;
  lastInboundAt: Date | null;
  /** Respostas do robô na última hora, nesta conversa. */
  respostasNaUltimaHora: number;
  /** O robô já se apresentou nesta conversa? */
  jaSeApresentou: boolean;
};

export type Decisao =
  /** Chamar o agente e responder. `apresentar` prefixa o aviso de robô. */
  | { tipo: "responder"; apresentar: boolean }
  /** Marcar saída e mandar a confirmação — a última mensagem desta conversa. */
  | { tipo: "confirmar_saida" }
  /** Não responder, e passar para uma pessoa. */
  | { tipo: "transferir"; motivo: string }
  /** Não responder, e não é caso de ninguém. */
  | { tipo: "silenciar"; motivo: string };

/**
 * O que fazer com uma mensagem que acabou de chegar.
 *
 * A ordem das recusas é a ordem em que elas são verdade, e a primeira é a que
 * mais importa: **quem pediu para sair não recebe mais nada**, nem a
 * confirmação de novo, nem transferência que gere mensagem. Uma segunda
 * mensagem depois de "PARAR" é a falha que vira reclamação.
 */
export function decidir(estado: EstadoDaConversa, texto: string, agora: Date): Decisao {
  if (estado.optedOutAt) {
    return { tipo: "silenciar", motivo: "candidato pediu para não receber mensagens" };
  }
  if (pediuParaSair(texto)) return { tipo: "confirmar_saida" };

  if (!estado.integracaoLigada) {
    return { tipo: "transferir", motivo: "conexão de WhatsApp desligada" };
  }
  // Transferida não volta sozinha. Voltar seria o candidato receber robô no
  // meio de uma conversa que uma pessoa estava conduzindo.
  if (estado.handoffAt) {
    return { tipo: "silenciar", motivo: "conversa já está com uma pessoa" };
  }

  if (estado.respostasNaUltimaHora >= MAX_RESPOSTAS_POR_HORA) {
    return { tipo: "transferir", motivo: "muitas respostas automáticas na última hora" };
  }

  // A janela conta a partir da última mensagem recebida — e esta acabou de
  // chegar, então quem entra aqui está dentro dela. A checagem existe para o
  // caminho em que o envio é adiado (fila, reprocessamento) e a janela fecha
  // no meio.
  if (estado.lastInboundAt && horasEntre(estado.lastInboundAt, agora) > JANELA_LIVRE_EM_HORAS) {
    return { tipo: "transferir", motivo: "fora da janela de 24h do WhatsApp" };
  }

  return { tipo: "responder", apresentar: !estado.jaSeApresentou };
}

function horasEntre(a: Date, b: Date): number {
  return (b.getTime() - a.getTime()) / 3_600_000;
}

/**
 * Dá para mandar mensagem livre agora?
 *
 * Separado de `decidir` porque vale para qualquer envio, inclusive o de uma
 * pessoa pela tela: fora das 24h a Meta recusa mensagem livre, e o erro dela
 * não explica isso para quem clicou.
 */
export function dentroDaJanelaLivre(lastInboundAt: Date | null, agora: Date): boolean {
  if (!lastInboundAt) return false;
  return horasEntre(lastInboundAt, agora) <= JANELA_LIVRE_EM_HORAS;
}

export type RespostaDoAgente = {
  texto: string;
  /** Quantas escritas o agente propôs. */
  propostas: number;
  truncado: boolean;
};

export type DesfechoDaResposta =
  | { tipo: "enviar"; texto: string }
  | { tipo: "transferir"; motivo: string };

/** Limite de tamanho de uma mensagem de texto na Cloud API. */
export const MAX_CARACTERES_DA_MENSAGEM = 4_096;

/**
 * O que fazer com o que o agente escreveu.
 *
 * ─── Proposta é sinal de transferência ──────────────────────────────────────
 *
 * O agente do WhatsApp não tem ferramenta de escrita liberada. Se ainda assim
 * ele pedir uma, é porque concluiu que algo precisa mudar no sistema — mover
 * etapa, encerrar processo — e isso nunca é conversa de robô com candidato. A
 * resposta dele **não sai**, e uma pessoa assume.
 *
 * Resposta vazia também transfere, em vez de virar silêncio: o candidato
 * escreveu e ficou sem retorno é o pior desfecho possível desta conversa.
 */
export function decidirComARespostaDoAgente(r: RespostaDoAgente): DesfechoDaResposta {
  if (r.propostas > 0) {
    return { tipo: "transferir", motivo: "o assistente sugeriu uma ação no processo seletivo" };
  }
  const texto = r.texto.trim();
  if (!texto) return { tipo: "transferir", motivo: "o assistente não conseguiu responder" };
  if (r.truncado) {
    return { tipo: "transferir", motivo: "o assistente parou antes de terminar a resposta" };
  }
  if (texto.length > MAX_CARACTERES_DA_MENSAGEM) {
    // Cortar uma resposta ao meio e mandar assim é pior que não mandar: o
    // candidato lê meia informação e age sobre ela.
    return { tipo: "transferir", motivo: "resposta longa demais para o WhatsApp" };
  }
  return { tipo: "enviar", texto };
}

/** Monta o corpo final, com a apresentação quando for a primeira vez. */
export function montarMensagem(texto: string, apresentar: boolean): string {
  return apresentar ? `${AVISO_DE_ROBO}\n\n${texto}` : texto;
}
