// Fila das chamadas ao Omie, por conta e método (Fase 2, 13/10/2026).
//
// A leitura da Fase 1 anda em sequência dentro de uma só função e não
// precisava disto. A emissão precisa: duas pessoas podem emitir ao mesmo tempo,
// o cron consulta enquanto alguém cancela, e o Omie diz (ajuda.omie.com.br,
// artigos 8112984 e 8001888, lidos em 13/10/2026):
//
// - inclusão e alteração **não podem ser simultâneas** — por isso toda escrita
//   da mesma conta passa por uma fila só, qualquer que seja o método;
// - o limite é por IP + App Key + método — por isso a leitura enfileira por
//   conta e método;
// - a mesma consulta repetida em 60 s não traz dado, e insistir estende a
//   espera; o 10º erro seguido bloqueia a chave por 30 min (HTTP 425). Quem
//   recebe bloqueio para de chamar até o fim da pausa, em vez de somar erros.
//
// **A conta é a App Key, não a empresa do Connect.** Em 13/10/2026 duas empresas
// do Connect (ELIO RUBENS e ER DIAS) foram cadastradas com a mesma conta do
// Omie: chavear a fila pela empresa deixaria as duas escreverem em paralelo na
// mesma conta. A identidade é um resumo da App Key — a chave em si não fica em
// mapa, log nem mensagem.
//
// Em memória: o Connect roda num contêiner só. Se um dia forem vários, a fila
// precisa ir para o banco (ou para o Redis), senão cada um terá a sua.

import { createHash } from "node:crypto";
import { formatInstantTime } from "@/lib/format";
import { chamarOmie, ErroDoOmie, type CredencialOmie } from "./cliente";

/** Identidade da conta do Omie: os 16 primeiros hexas do SHA-256 da App Key. */
export function idDaConta(cred: Pick<CredencialOmie, "appKey">): string {
  return createHash("sha256").update(cred.appKey.trim()).digest("hex").slice(0, 16);
}

const MINUTO = 60_000;

/**
 * Quanto tempo parar de chamar depois deste erro, ou `null` se o erro não é
 * bloqueio. As mensagens exatas do Omie ainda não foram vistas em resposta
 * real — o 425 e o "Too many requests" vêm da ajuda do Omie; o resto é
 * reconhecido pelo sentido, e a mensagem original segue para a tela.
 */
export function pausaPedidaPeloOmie(err: unknown): number | null {
  if (!(err instanceof ErroDoOmie)) return null;
  if (err.http === 425) return 30 * MINUTO;
  const m = err.message.toLowerCase();
  if (/consumo indevido|api bloqueada|bloqueada por/.test(m)) return 30 * MINUTO;
  if (err.http === 429 || m.includes("too many requests")) return MINUTO;
  if (/redundan|j[aá] foi (realizad|processad|solicitad)|est[aá] sendo processad/.test(m)) return MINUTO;
  return null;
}

const filas = new Map<string, Promise<unknown>>();
const pausas = new Map<string, number>();

function naFila<T>(chave: string, tarefa: () => Promise<T>): Promise<T> {
  const anterior = filas.get(chave) ?? Promise.resolve();
  // A falha de quem veio antes não derruba quem está esperando.
  const atual = anterior.catch(() => undefined).then(tarefa);
  const cauda = atual.catch(() => undefined);
  filas.set(chave, cauda);
  void cauda.then(() => {
    if (filas.get(chave) === cauda) filas.delete(chave);
  });
  return atual;
}

function horaDeBrasilia(ms: number): string {
  return formatInstantTime(new Date(ms), { hour: "2-digit", minute: "2-digit" });
}

/** Até quando o método está em pausa nesta conta, ou `null`. */
export function pausaAte(cred: Pick<CredencialOmie, "appKey">, call: string, agora = Date.now()): number | null {
  const ate = pausas.get(`${idDaConta(cred)}:${call}`);
  return ate && ate > agora ? ate : null;
}

/** Só para teste: esvazia filas e pausas entre um caso e outro. */
export function esquecerFilasEPausas(): void {
  filas.clear();
  pausas.clear();
}

export type OpcoesDaFila = {
  /** Escrita (incluir, faturar, cancelar): uma por vez na conta inteira. */
  escrita?: boolean;
  fetch?: typeof fetch;
  timeoutMs?: number;
  agora?: () => number;
};

/**
 * `chamarOmie` com a fila e a pausa. Em pausa, falha na hora com `ErroDoOmie`
 * de código `PAUSA` — sem chamar o Omie, que é o que faria a pausa crescer.
 */
export async function chamarOmieNaFila<T = unknown>(
  cred: CredencialOmie,
  modulo: string,
  call: string,
  param: Record<string, unknown>,
  opcoes: OpcoesDaFila = {}
): Promise<T> {
  const conta = idDaConta(cred);
  const chaveDaPausa = `${conta}:${call}`;
  const agora = opcoes.agora ?? Date.now;

  const conferirPausa = () => {
    const ate = pausas.get(chaveDaPausa);
    if (ate && ate > agora()) {
      throw new ErroDoOmie(
        `O Omie pediu uma pausa nas chamadas de ${call} desta conta. Tente de novo depois das ${horaDeBrasilia(ate)}.`,
        "PAUSA",
        0
      );
    }
  };

  conferirPausa();
  return naFila(opcoes.escrita ? `${conta}:escrita` : chaveDaPausa, async () => {
    // Quem esperou na fila atrás de um bloqueio também não chama.
    conferirPausa();
    try {
      return await chamarOmie<T>(cred, modulo, call, param, { fetch: opcoes.fetch, timeoutMs: opcoes.timeoutMs });
    } catch (err) {
      const pausa = pausaPedidaPeloOmie(err);
      if (pausa) pausas.set(chaveDaPausa, agora() + pausa);
      throw err;
    }
  });
}
