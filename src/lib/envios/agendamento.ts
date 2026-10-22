// O envio agendado (22/10/2026): ao criar (ou editar) o rascunho, a equipe
// marca o dia e a hora — horário de Brasília — em que ele sai. Até lá é
// "Agendado": um rascunho com data, que o cliente não vê (portal e link
// público só mostram o publicado) e que não manda e-mail. Na hora, o agendador
// interno publica e manda os e-mails escolhidos; a equipe pode antes mudar a
// data, mandar já ou cancelar o agendamento (volta a ser rascunho comum).
//
// Puro: a leitura do formulário, a lista de e-mails guardada e quando vence.

import { saoPauloDateTimeToUtc, toSaoPauloDateTimeLocal } from "@/lib/agenda";
import { emailDoDestinatario } from "./regras";

const DIA_MS = 86_400_000;
/** Mais longe que isso é engano de digitação (ano trocado), não plano. */
export const AGENDAMENTO_MAXIMO_EM_DIAS = 366;
/** A hora quando só a data foi escolhida. */
export const HORA_PADRAO_DO_AGENDAMENTO = "08:00";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export type LeituraDoAgendamento = { ok: true; quando: Date | null } | { ok: false; erro: string };

/**
 * O agendamento preenchido: sem data é "sem agendamento" (`quando: null`). A
 * hora é de Brasília; sem hora, 08:00. Precisa estar no futuro e a menos de
 * um ano.
 */
export function lerAgendamento(bruto: { data: unknown; hora: unknown }, agora: Date): LeituraDoAgendamento {
  const data = typeof bruto.data === "string" ? bruto.data.trim() : "";
  if (!data) return { ok: true, quando: null };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(data)) return { ok: false, erro: "Data do agendamento inválida." };
  const hora = (typeof bruto.hora === "string" && bruto.hora.trim()) || HORA_PADRAO_DO_AGENDAMENTO;
  const m = /^(\d{1,2}):(\d{2})$/.exec(hora);
  if (!m || Number(m[1]) > 23 || Number(m[2]) > 59) return { ok: false, erro: "Hora do agendamento inválida." };
  const quando = saoPauloDateTimeToUtc(data, Number(m[1]), Number(m[2]));
  if (Number.isNaN(quando.getTime())) return { ok: false, erro: "Data do agendamento inválida." };
  // A data volta igual? Senão o dia não existe ("2026-02-30").
  if (toSaoPauloDateTimeLocal(quando).slice(0, 10) !== data) return { ok: false, erro: "Data do agendamento inválida." };
  if (quando.getTime() <= agora.getTime()) return { ok: false, erro: "Escolha uma data e hora no futuro para o agendamento." };
  if (quando.getTime() > agora.getTime() + AGENDAMENTO_MAXIMO_EM_DIAS * DIA_MS) {
    return { ok: false, erro: "O agendamento pode ser de no máximo um ano à frente." };
  }
  return { ok: true, quando };
}

/** Os campos do formulário a partir da data gravada (edição). */
export function camposDoAgendamento(quando: Date | null): { data: string; hora: string } {
  if (!quando) return { data: "", hora: "" };
  const local = toSaoPauloDateTimeLocal(quando);
  return { data: local.slice(0, 10), hora: local.slice(11, 16) };
}

/**
 * Os e-mails guardados no agendamento (coluna JSON). Lixo vira lista vazia —
 * o envio sai só no portal, nunca para um endereço que não foi escolhido.
 */
export function emailsDoAgendamento(valor: unknown): string[] {
  if (!Array.isArray(valor)) return [];
  return Array.from(
    new Set(valor.filter((e): e is string => typeof e === "string").map(emailDoDestinatario).filter((e) => EMAIL_RE.test(e)))
  );
}

/** O rascunho agendado cuja hora chegou. */
export function agendamentoVencido(envio: { status: "DRAFT" | "PUBLISHED"; scheduledFor: Date | null }, agora: Date): boolean {
  return envio.status === "DRAFT" && !!envio.scheduledFor && envio.scheduledFor.getTime() <= agora.getTime();
}
