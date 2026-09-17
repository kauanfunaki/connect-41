// Lembrete automático de pendência vencida: o e-mail que volta a chamar o
// cliente quando o prazo passa sem resposta. Funções puras — o cron decide com
// elas, e a ficha da pendência mostra à equipe o que já saiu.
//
// ─── Os passos ───────────────────────────────────────────────────────────────
//
// A mecânica é a da régua de cobrança (`passoDevido`): só o maior passo já
// alcançado, uma vez cada, e o último vale por uma janela. O cron que ficou o
// fim de semana parado não manda, na segunda, o lembrete de 1 dia e o de 3 no
// mesmo dia — manda o de 3.
//
// ─── Só pendência ABERTA ─────────────────────────────────────────────────────
//
// `ABERTA` é a bola com o cliente. `RESPONDIDA` espera a equipe: lembrar o
// cliente de algo que ele já respondeu é o e-mail que ensina a ignorar os
// próximos. Se a equipe devolver a pendência, ela volta a `ABERTA` e os passos
// que faltam continuam valendo — os já enviados não se repetem.

import { passoDevido } from "../cobranca/regua";
import { diasEntre } from "../periodo";
import type { StatusDaPendencia } from "./regras";

/** Dias de atraso em que o cliente é lembrado. */
export const PASSOS_DO_LEMBRETE = [1, 3, 7, 15];

/**
 * Por quantos dias o último passo continua devido depois de alcançado.
 *
 * Existe para o dia em que o lembrete entra no ar: sem janela, a pendência
 * esquecida há meses receberia um e-mail no primeiro cron. Pendência tão velha é
 * conversa da equipe, não lembrete automático.
 */
export const JANELA_DO_ULTIMO_LEMBRETE = 30;

export type MotivoSemLembrete = "NAO_AGUARDA_CLIENTE" | "SEM_PRAZO" | "NO_PRAZO" | "SEM_PASSO_HOJE";

export type VereditoDoLembrete = { enviar: number; diasDeAtraso: number } | { enviar: null; motivo: MotivoSemLembrete };

/**
 * Manda lembrete hoje?
 *
 * `prazoKey` e `hojeKey` são dias civis em São Paulo (`AAAA-MM-DD`), a mesma
 * comparação de `situacaoDoPrazo`: vencida é a de prazo **anterior** a hoje, e a
 * que vence hoje ainda não recebe nada.
 */
export function avaliarLembrete(
  p: { status: StatusDaPendencia; prazoKey: string | null; enviados: number[] },
  hojeKey: string
): VereditoDoLembrete {
  if (p.status !== "ABERTA") return { enviar: null, motivo: "NAO_AGUARDA_CLIENTE" };
  if (!p.prazoKey) return { enviar: null, motivo: "SEM_PRAZO" };
  const atraso = diasEntre(p.prazoKey, hojeKey);
  if (atraso < 1) return { enviar: null, motivo: "NO_PRAZO" };
  const passo = passoDevido(atraso, PASSOS_DO_LEMBRETE, p.enviados, JANELA_DO_ULTIMO_LEMBRETE);
  if (passo === null) return { enviar: null, motivo: "SEM_PASSO_HOJE" };
  return { enviar: passo, diasDeAtraso: atraso };
}

/** O que o registro guarda entre a reserva do passo e o fim do envio. */
export const RESERVA_DO_LEMBRETE = "enviando";

/** Reserva mais velha que isso não é envio em curso: o processo caiu no meio. */
const ENVIO_EM_CURSO_MS = 10 * 60_000;

/**
 * Como a ficha descreve um lembrete registrado.
 *
 * A reserva é gravada segundos antes do e-mail. Ainda em "enviando" minutos
 * depois é queda entre a reserva e o envio — e esse passo não é retentado (ver
 * `executarLembretes.ts`), então a ficha diz isso em vez de "enviando" para sempre.
 */
export function situacaoDoLembrete(
  l: { ok: boolean; erro: string | null; em: Date; destinatarios: number },
  agora: Date
): { tom: "ok" | "andamento" | "falha"; texto: string } {
  if (l.ok) return { tom: "ok", texto: l.destinatarios === 1 ? "enviado a 1 pessoa" : `enviado a ${l.destinatarios} pessoas` };
  if (l.erro === RESERVA_DO_LEMBRETE) {
    return agora.getTime() - l.em.getTime() < ENVIO_EM_CURSO_MS
      ? { tom: "andamento", texto: "enviando…" }
      : { tom: "falha", texto: "envio interrompido — não é repetido automaticamente" };
  }
  return { tom: "falha", texto: l.erro ?? "falhou" };
}

/** "1 dia", "3 dias" — o passo como a equipe lê na ficha. */
export function rotuloDoPasso(passo: number): string {
  return passo === 1 ? "1 dia de atraso" : `${passo} dias de atraso`;
}

/** Os passos por extenso, para a ficha avisar o que vai acontecer: "1, 3, 7 e 15". */
export function passosPorExtenso(passos: number[] = PASSOS_DO_LEMBRETE): string {
  if (passos.length <= 1) return passos.join("");
  return `${passos.slice(0, -1).join(", ")} e ${passos.at(-1)}`;
}
