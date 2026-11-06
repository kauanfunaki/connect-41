// O que a sessão assistida guarda em memória (06/11/2026): o último quadro da
// tela do robô e os cliques que ainda não foram buscados.
//
// Em memória de propósito: a sessão dura minutos, o quadro muda a cada fração
// de segundo e não tem valor depois. Gravar cada quadro no banco seria escrever
// centenas de KB por segundo para jogar fora. O Connect roda num processo só;
// se ele reiniciar no meio, o robô manda o próximo quadro e a tela volta. O
// clique que estava na fila nesse instante se perde, e a pessoa clica de novo.
//
// Fica no `globalThis`, como o cliente do Prisma, para sobreviver ao recarregar
// do módulo em desenvolvimento.

import type { Clique } from "./assistencia";

export type Quadro = { bytes: Uint8Array; tipo: string; em: Date };
type CliqueNaFila = Clique & { userId: string; em: Date };

type Memoria = { quadros: Map<string, Quadro>; cliques: Map<string, CliqueNaFila[]> };
const global = globalThis as unknown as { __assistenciaDoRobo?: Memoria };
function memoria(): Memoria {
  global.__assistenciaDoRobo ??= { quadros: new Map(), cliques: new Map() };
  return global.__assistenciaDoRobo;
}

/** Quadro sem atualização há mais disto é lixo de sessão que não terminou direito. */
const QUADRO_ESQUECIDO_MS = 30 * 60 * 1000;
/** A fila de cliques não cresce sem limite: a pessoa clicando sem parar não enche a memória. */
const CLIQUES_NA_FILA = 20;

export function guardarQuadro(tarefaId: string, quadro: Quadro): void {
  const m = memoria();
  m.quadros.set(tarefaId, quadro);
  // Varre o que ficou de sessões que nunca chamaram o fim (máquina desligada no meio).
  for (const [id, q] of m.quadros) {
    if (quadro.em.getTime() - q.em.getTime() > QUADRO_ESQUECIDO_MS) {
      m.quadros.delete(id);
      m.cliques.delete(id);
    }
  }
}

export function ultimoQuadro(tarefaId: string): Quadro | null {
  return memoria().quadros.get(tarefaId) ?? null;
}

export function enfileirarClique(tarefaId: string, clique: CliqueNaFila): void {
  const m = memoria();
  const fila = m.cliques.get(tarefaId) ?? [];
  fila.push(clique);
  m.cliques.set(tarefaId, fila.slice(-CLIQUES_NA_FILA));
}

/** Entrega os cliques pendentes à máquina e esvazia a fila. */
export function retirarCliques(tarefaId: string): CliqueNaFila[] {
  const m = memoria();
  const fila = m.cliques.get(tarefaId) ?? [];
  m.cliques.delete(tarefaId);
  return fila;
}

export function esquecerSessao(tarefaId: string): void {
  const m = memoria();
  m.quadros.delete(tarefaId);
  m.cliques.delete(tarefaId);
}
