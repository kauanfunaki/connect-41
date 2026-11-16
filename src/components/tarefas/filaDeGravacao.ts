import type { ActionState } from "@/lib/actionState";

/** Uma gravação: a action já com os argumentos da vez. */
type Pedido = () => Promise<ActionState>;

/**
 * Como a rodada terminou para quem pediu. Com `ok`, tudo o que estava na fila
 * foi gravado. Sem `ok`, `erro` vem só para quem fez o pedido que falhou — os
 * que esperavam atrás dele são descartados e recebem `null`, para o aviso sair
 * uma vez só.
 */
export type FimDaGravacao = { ok: true } | { ok: false; erro: string | null };

const FALHA_AO_GRAVAR = "Não foi possível gravar. Tente de novo.";

/**
 * Gravações na ordem dos cliques, uma por vez (16/11/2026, melhoria-714).
 *
 * O Configurar do Meu dia grava a cada interruptor, e a action recebe o
 * conjunto inteiro: duas gravações cruzadas deixariam no banco o conjunto que
 * chegou por último, não o do último clique. Aqui o pedido que chega com uma
 * gravação em curso espera a vez, e só o mais recente é enviado — o conjunto
 * dele já traz as trocas anteriores, e cada ida ao servidor refaz a página.
 */
export function criarFilaDeGravacao() {
  let aEnviar: Pedido | null = null;
  let rodada: Promise<{ pedido: Pedido; erro: string } | null> | null = null;

  async function rodar() {
    try {
      while (aEnviar) {
        const daVez = aEnviar;
        aEnviar = null;
        let erro: string | null;
        try {
          erro = (await daVez())?.error ?? null;
        } catch {
          erro = FALHA_AO_GRAVAR;
        }
        if (erro) {
          // O que esperava partia de um conjunto que não foi gravado.
          aEnviar = null;
          return { pedido: daVez, erro };
        }
      }
      return null;
    } finally {
      rodada = null;
    }
  }

  return async function gravar(pedido: Pedido): Promise<FimDaGravacao> {
    aEnviar = pedido;
    rodada ??= rodar();
    const falha = await rodada;
    if (!falha) return { ok: true };
    return { ok: false, erro: falha.pedido === pedido ? falha.erro : null };
  };
}
