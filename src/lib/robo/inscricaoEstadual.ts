// A vigilância da inscrição estadual pelo robô (30/10/2026) — o que vai e o
// que volta da máquina, sem banco. A regra da situação está em
// `societario/inscricaoEstadual.ts`, e a gravação em
// `societario/inscricaoEstadualServidor.ts`.
//
// A tarefa não é pedida por ninguém: nasce quando a máquina pede trabalho e
// diz que sabe ler a IE (`vigiar_ie` nas capacidades), uma empresa por vez, na
// ordem da rodada. Assim, enquanto o programa da máquina não tiver a leitura
// do CICAD, nada se acumula na fila.

import { z } from "zod";

export type PedidoDaIE = { inscricao: string; cnpj: string | null };

/** O que a máquina recebe: a IE só com os dígitos, e o CNPJ quando houver. */
export function pedidoDaIE(stateRegistration: string, cnpj: string | null): PedidoDaIE {
  const digitos = (cnpj ?? "").replace(/\D/g, "");
  return { inscricao: stateRegistration.replace(/\D/g, ""), cnpj: digitos.length === 14 ? digitos : null };
}

/**
 * O que a máquina devolve: o texto do campo "Situação Atual", como está na
 * tela. Quem interpreta é o Connect, onde há teste.
 */
export const resultadoDaIESchema = z.object({
  situacao: z.string().trim().min(1).max(200),
});

/** Depois de quantas leituras seguidas sem sucesso a vigilância para. */
export const FALHAS_PARA_PARAR = 3;
/** Por quanto tempo ela fica parada, contado da última falha. */
export const PAUSA_DEPOIS_DAS_FALHAS_MS = 24 * 60 * 60 * 1000;

/**
 * Pode criar a próxima tarefa? Se as últimas leituras terminaram todas com
 * uma pessoa (a tela do CICAD mudou, o certificado venceu), a vigilância para
 * por um dia, em vez de parar empresa por empresa a carteira inteira.
 *
 * `ultimas` são as tarefas da IE já terminadas, da mais recente para a mais
 * antiga.
 */
export function vigilanciaPodeSeguir(ultimas: { status: string; finishedAt: Date | null }[], agora: Date): boolean {
  const recentes = ultimas.slice(0, FALHAS_PARA_PARAR);
  if (recentes.length < FALHAS_PARA_PARAR) return true;
  if (!recentes.every((t) => t.status === "PRECISA_DE_GENTE")) return true;
  const ultima = recentes[0].finishedAt;
  return !ultima || agora.getTime() - ultima.getTime() >= PAUSA_DEPOIS_DAS_FALHAS_MS;
}
