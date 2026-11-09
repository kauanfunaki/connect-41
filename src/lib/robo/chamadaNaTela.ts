// O robô chama na tela (09/11/2026) — a regra, sem banco, para o componente do
// layout (`ChamadaDoRobo`) e a tela do robô.
//
// Pedido do Kauan depois de testar a sessão assistida: o aviso do sino e do
// celular não bastam, porque quem pediu o alvará continua em Licenças e só vê
// o captcha quando abre o sino. Agora a janela do captcha abre sozinha em
// qualquer tela do Connect, para quem pediu (e, depois de escalada, para o
// setor). A conferência é leve: rápida só enquanto a pessoa tem tarefa dela na
// fila do robô ou sessão aberta, lenta no resto, e parada com a aba escondida.

/** Enquanto há tarefa da pessoa na fila ou sessão aberta: a janela abre em poucos segundos. */
export const CONFERENCIA_RAPIDA_MS = 5_000;
/** O resto do tempo: só para o setor, quando a sessão de outra pessoa sobe para ele. */
export const CONFERENCIA_LENTA_MS = 30_000;

/** Quanto a janela fica na tela mostrando "Resolvido" (ou "Prazo encerrado") antes de fechar. */
export const FECHAR_DEPOIS_DO_FIM_MS = 2_500;

/**
 * Disparado na janela do navegador quando a pessoa pede uma tarefa ao robô
 * (Licenças › ⋯ › Imprimir pelo robô): a conferência passa para a rápida na
 * hora, sem esperar a volta lenta.
 */
export const EVENTO_DO_PEDIDO_AO_ROBO = "connect:robo-pedido";

/** A sessão aberta que chama a pessoa, como a rota `/api/robo/assistencia` devolve. */
export type SessaoNaTela = {
  /** Sessão + início: o captcha que volta na mesma tentativa conta como chamada nova. */
  chave: string;
  tarefaId: string;
  oQue: string;
  empresa: string | null;
  /** ISO do prazo da sessão. */
  ate: string;
};

export type ChamadasDaPessoa = { naFila: boolean; sessoes: SessaoNaTela[] };

export function chaveDaSessao(s: { id: string; startedAt: Date }): string {
  return `${s.id}:${s.startedAt.getTime()}`;
}

/**
 * A sessão chama esta pessoa? Quem pediu, sempre; o setor do robô, só depois
 * de escalada — o mesmo caminho do aviso (`notifyUser` e depois `notifySector`).
 * Admin fora do setor não é chamado pela sessão dos outros, como no sino.
 */
export function chamaAPessoa(
  s: { escalatedAt: Date | null },
  t: { requestedById: string | null },
  pessoa: { userId: string; doSetor: boolean },
): boolean {
  if (!pessoa.userId) return false;
  return t.requestedById === pessoa.userId || (s.escalatedAt !== null && pessoa.doSetor);
}

/** De quanto em quanto o layout pergunta de novo. */
export function intervaloDaConferencia(c: ChamadasDaPessoa): number {
  return c.naFila || c.sessoes.length > 0 ? CONFERENCIA_RAPIDA_MS : CONFERENCIA_LENTA_MS;
}

/** O que a pessoa já fez com cada chamada nesta aba: fechou para depois, ou viu terminar. */
export type MarcaDaChamada = "depois" | "encerrada";

/** A pessoa já está na tela da própria tarefa: a janela não abre por cima dela. */
export function naTelaDaTarefa(caminho: string | null, tarefaId: string): boolean {
  return caminho === `/robo/assistir/${tarefaId}`;
}

/** A sessão que a janela abre sozinha: a mais antiga ainda não fechada pela pessoa. */
export function sessaoParaAbrir(sessoes: readonly SessaoNaTela[], marcas: Readonly<Record<string, MarcaDaChamada>>, caminho: string | null): SessaoNaTela | null {
  return sessoes.find((s) => !marcas[s.chave] && !naTelaDaTarefa(caminho, s.tarefaId)) ?? null;
}

/** As que a pessoa fechou para resolver depois e ainda esperam: o botão de reabrir. */
export function sessoesParaReabrir(sessoes: readonly SessaoNaTela[], marcas: Readonly<Record<string, MarcaDaChamada>>, caminho: string | null): SessaoNaTela[] {
  return sessoes.filter((s) => marcas[s.chave] === "depois" && !naTelaDaTarefa(caminho, s.tarefaId));
}

/** As marcas que ainda valem: sessão que saiu da lista não precisa mais de marca. */
export function marcasQueValem(marcas: Readonly<Record<string, MarcaDaChamada>>, sessoes: readonly SessaoNaTela[]): Record<string, MarcaDaChamada> {
  const abertas = new Set(sessoes.map((s) => s.chave));
  return Object.fromEntries(Object.entries(marcas).filter(([chave]) => abertas.has(chave)));
}

export type FimDaChamada = "resolvida" | "expirada" | "encerrada" | "sem_sessao";

/** O estado que a tela ao vivo leu fecha a janela? Esperando a tela, ao vivo e sem sinal ainda pedem a pessoa. */
export function ehFimDaChamada(estado: string): estado is FimDaChamada {
  return estado === "resolvida" || estado === "expirada" || estado === "encerrada" || estado === "sem_sessao";
}

/** O que o aviso diz quando a janela fecha porque a sessão terminou. */
export function avisoDoFim(fim: FimDaChamada): { texto: string; tom: "success" | "info" } {
  if (fim === "resolvida") return { texto: "Captcha resolvido. O robô seguiu sozinho.", tom: "success" };
  if (fim === "expirada") return { texto: "O prazo do captcha acabou. A tarefa seguiu pelo caminho do PDF.", tom: "info" };
  return { texto: "O robô encerrou a espera do captcha.", tom: "info" };
}
