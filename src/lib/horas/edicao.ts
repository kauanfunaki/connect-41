// Corrigir um lançamento de horas (13/10/2026) — card do Kanban e processo do
// Societário.
//
// Até aqui, a única saída para um apontamento errado (o cronômetro esquecido
// ligado, o dia trocado) era apagar e lançar de novo. Com a exclusão restrita
// ao administrador, quem apontou passa a corrigir pelo "Editar". Funções puras:
// sem banco, para as duas telas lerem o formulário do mesmo jeito.

import { lerDataDoCampo } from "@/lib/societario/datas";

/** O mesmo teto do lançamento manual do Societário. */
export const MAXIMO_DE_MINUTOS_POR_LANCAMENTO = 16 * 60;

export type EstadoDaEdicaoDeHoras = { error: string } | { ok: true } | null;

export type LeituraDoLancamento =
  | { ok: true; minutos: number; dia: Date | null; nota: string | null }
  | { ok: false; error: string };

/**
 * Lê os campos "horas" (aceita vírgula), "minutos", "dia" (AAAA-MM-DD; vazio
 * mantém o dia que já estava) e "nota" do formulário de edição.
 */
export function lerLancamentoDeHoras(form: FormData): LeituraDoLancamento {
  const horas = Number(String(form.get("horas") ?? "0").trim().replace(",", ".") || "0");
  const extras = Number(String(form.get("minutos") ?? "0").trim() || "0");
  if (!Number.isFinite(horas) || !Number.isFinite(extras) || horas < 0 || extras < 0) {
    return { ok: false, error: "Informe o tempo em horas e minutos." };
  }
  const minutos = Math.round(horas * 60 + extras);
  if (minutos <= 0 || minutos > MAXIMO_DE_MINUTOS_POR_LANCAMENTO) {
    return { ok: false, error: "Informe o tempo gasto (até 16 horas por lançamento)." };
  }
  const dia = lerDataDoCampo(form.get("dia"));
  if (!dia.ok) return { ok: false, error: "Data inválida." };
  const nota = String(form.get("nota") ?? "").trim().slice(0, 280) || null;
  return { ok: true, minutos, dia: dia.data, nota };
}

/** "1h30min", "45min", "2h" — como as listas de horas mostram. */
export function duracaoDoLancamento(min: number): string {
  const h = Math.floor(min / 60);
  const m = min % 60;
  if (h === 0) return `${m}min`;
  if (m === 0) return `${h}h`;
  return `${h}h${m}min`;
}
