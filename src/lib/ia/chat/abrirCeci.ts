// Abrir a Ceci a partir de um botão da tela (14/10/2026).
//
// A primeira tela a pedir é a ficha da vaga — escolha "Vaga · 6 C" do Kauan:
// o bloco "Assistente da vaga" saiu, e no lugar dele o botão "Perguntar à Ceci
// sobre esta vaga" abre o chat do canto já com a Ceci do Recrutamento. A vaga
// como assunto não viaja aqui: o chat manda o caminho da página a cada
// pergunta, e o servidor reconhece a vaga por ele (`contextoDaTela`) — e só a
// entrega ao agente do Recrutamento (`contextoParaOAgente`). Por isso o pedido
// leva o agente.
//
// Um evento da janela, e não um contexto do React: o chat mora no layout e o
// botão no meio da página, sem dono em comum além do <body>. Quem escuta é o
// `ChatDeIA`; sem o chat na tela (a pessoa não tem a Ceci), o evento cai no
// vazio — a página só mostra o botão a quem tem o agente.

export const EVENTO_ABRIR_CECI = "c41:abrir-ceci";

export type PedidoParaAbrirCeci = {
  /** O agente do chat que deve atender (`assistente_do_recrutamento`…). Sem ele, o de sempre. */
  agente?: string;
  /** Do que se trata, para o campo de pergunta: "a vaga Auxiliar de produção". */
  assunto?: string;
};

/** Pede ao chat do canto que abra. */
export function pedirParaAbrirCeci(pedido: PedidoParaAbrirCeci, alvo: EventTarget = window): void {
  alvo.dispatchEvent(new CustomEvent<PedidoParaAbrirCeci>(EVENTO_ABRIR_CECI, { detail: pedido }));
}

/** O pedido de um evento, conferido: só texto curto passa. */
export function lerPedidoParaAbrirCeci(evento: Event): PedidoParaAbrirCeci {
  const detalhe = (evento as CustomEvent<unknown>).detail;
  if (!detalhe || typeof detalhe !== "object") return {};
  const d = detalhe as Record<string, unknown>;
  const texto = (v: unknown, max: number) => (typeof v === "string" && v.trim() ? v.trim().slice(0, max) : undefined);
  const agente = texto(d.agente, 60);
  const assunto = texto(d.assunto, 160);
  return { ...(agente ? { agente } : {}), ...(assunto ? { assunto } : {}) };
}

/** Escuta os pedidos; devolve o "parar de escutar", no formato do retorno de um `useEffect`. */
export function assinarPedidosParaAbrirCeci(aoPedir: (pedido: PedidoParaAbrirCeci) => void, alvo: EventTarget = window): () => void {
  const ouvir = (e: Event) => aoPedir(lerPedidoParaAbrirCeci(e));
  alvo.addEventListener(EVENTO_ABRIR_CECI, ouvir);
  return () => alvo.removeEventListener(EVENTO_ABRIR_CECI, ouvir);
}
