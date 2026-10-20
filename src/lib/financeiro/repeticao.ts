// A repetição do lançamento (lote D, fila do BPO de 19/10 — "repetição" do
// Omie): aluguel, folha, pró-labore, mensalidade. O lançamento manual nasce já
// com as próximas ocorrências, todas de uma vez, como o Omie faz — cada uma é
// uma conta comum, que se edita, paga e cancela sozinha; a série só as liga
// (`recurrenceId`, "3/12").
//
// Funções puras; a gravação é `criarLancamentoManual`.

import { dataValida } from "./periodo";

export type Frequencia = "MENSAL" | "QUINZENAL" | "SEMANAL" | "ANUAL";
/** O que fazer com o vencimento que cai em fim de semana ou feriado. */
export type AjusteDoDia = "MANTER" | "ANTECIPAR" | "ADIAR";

export const FREQUENCIAS: { valor: Frequencia; rotulo: string }[] = [
  { valor: "MENSAL", rotulo: "Todo mês" },
  { valor: "QUINZENAL", rotulo: "A cada 15 dias" },
  { valor: "SEMANAL", rotulo: "Toda semana" },
  { valor: "ANUAL", rotulo: "Todo ano" },
];

export const AJUSTES_DO_DIA: { valor: AjusteDoDia; rotulo: string }[] = [
  { valor: "ADIAR", rotulo: "Adiar para o dia útil seguinte" },
  { valor: "ANTECIPAR", rotulo: "Antecipar para o dia útil anterior" },
  { valor: "MANTER", rotulo: "Manter a data" },
];

/** Teto da série: dez anos de mensal, dois de semanal. */
export const MAXIMO_DE_OCORRENCIAS = 120;

export type Repeticao = { frequencia: Frequencia; vezes: number; ajuste: AjusteDoDia };

/**
 * Os campos "Repetir" do formulário. Sem frequência, não repete (`null`).
 * `vezes` conta a primeira: "12 vezes" são esta e mais 11.
 */
export function validarRepeticao(campos: {
  frequencia: string | null | undefined;
  vezes: string | null | undefined;
  ajuste: string | null | undefined;
}): { ok: true; repeticao: Repeticao | null } | { ok: false; erro: string } {
  const frequencia = (campos.frequencia ?? "").trim();
  if (!frequencia) return { ok: true, repeticao: null };
  if (!FREQUENCIAS.some((f) => f.valor === frequencia)) return { ok: false, erro: "Frequência da repetição inválida." };
  const vezes = Number((campos.vezes ?? "").trim());
  if (!Number.isInteger(vezes) || vezes < 2) return { ok: false, erro: "Informe quantas vezes repete — duas ou mais, contando esta." };
  if (vezes > MAXIMO_DE_OCORRENCIAS) return { ok: false, erro: `No máximo ${MAXIMO_DE_OCORRENCIAS} vezes.` };
  const ajuste = (campos.ajuste ?? "").trim() || "ADIAR";
  if (!AJUSTES_DO_DIA.some((a) => a.valor === ajuste)) return { ok: false, erro: "Ajuste de fim de semana inválido." };
  return { ok: true, repeticao: { frequencia: frequencia as Frequencia, vezes, ajuste: ajuste as AjusteDoDia } };
}

// ─── Datas, em "AAAA-MM-DD", sem fuso: é dia de calendário ───────────────────

const chave = (d: Date) => d.toISOString().slice(0, 10);
const doDia = (k: string) => new Date(`${k}T00:00:00Z`);
const ultimoDiaDoMes = (ano: number, mes: number) => new Date(Date.UTC(ano, mes, 0)).getUTCDate();

function somarDias(k: string, dias: number): string {
  const d = doDia(k);
  d.setUTCDate(d.getUTCDate() + dias);
  return chave(d);
}

/** Meses depois, no mesmo dia — ou no último do mês, quando ele não tem esse dia (31 → 30, 28). */
function somarMeses(k: string, meses: number, diaDeAncora: number): string {
  const [ano, mes] = k.split("-").map(Number) as [number, number];
  const total = ano * 12 + (mes - 1) + meses;
  const a = Math.floor(total / 12);
  const m = (total % 12) + 1;
  const dia = Math.min(diaDeAncora, ultimoDiaDoMes(a, m));
  return `${a}-${String(m).padStart(2, "0")}-${String(dia).padStart(2, "0")}`;
}

/** Fim de semana ou feriado do escritório. */
function naoUtil(k: string, feriados: ReadonlySet<string>): boolean {
  const dia = doDia(k).getUTCDay();
  return dia === 0 || dia === 6 || feriados.has(k);
}

/** O vencimento que cai em dia não útil, ajustado como a pessoa pediu. */
export function ajustarDia(k: string, ajuste: AjusteDoDia, feriados: ReadonlySet<string>): string {
  if (ajuste === "MANTER") return k;
  let d = k;
  // Feriado emendado em fim de semana dá até quatro dias seguidos; o teto só
  // protege de um cadastro de feriados absurdo.
  for (let i = 0; i < 15 && naoUtil(d, feriados); i++) d = somarDias(d, ajuste === "ADIAR" ? 1 : -1);
  return d;
}

/** Competência "AAAA-MM" depois de `meses`. */
function somarMesesNaCompetencia(competencia: string, meses: number): string {
  const [ano, mes] = competencia.split("-").map(Number) as [number, number];
  const total = ano * 12 + (mes - 1) + meses;
  return `${Math.floor(total / 12)}-${String((total % 12) + 1).padStart(2, "0")}`;
}

const mesesEntre = (de: string, ate: string) => {
  const [a1, m1] = de.split("-").map(Number) as [number, number];
  const [a2, m2] = ate.split("-").map(Number) as [number, number];
  return (a2 - a1) * 12 + (m2 - m1);
};

export type Ocorrencia = { indice: number; vencimentoKey: string; competencia: string };

/** "3/12" — a posição da conta na série; sem série, nada. */
export function rotuloDaSerie(conta: { recurrenceIndex: number | null; recurrenceTotal: number | null }): string | null {
  if (!conta.recurrenceIndex || !conta.recurrenceTotal) return null;
  return `${conta.recurrenceIndex}/${conta.recurrenceTotal}`;
}

/**
 * As ocorrências da série, a primeira inclusa — ela fica como a pessoa
 * digitou; as seguintes andam na frequência e, caindo em fim de semana ou
 * feriado, são ajustadas.
 *
 * A competência anda junto com o mês do vencimento **sem o ajuste**: o
 * aluguel de 31/10 que cai num sábado e vai para 02/11 continua sendo de
 * outubro.
 */
export function ocorrenciasDaRepeticao(
  primeira: { vencimentoKey: string; competencia: string },
  r: Repeticao,
  feriados: ReadonlySet<string> = new Set()
): Ocorrencia[] {
  if (!dataValida(primeira.vencimentoKey)) return [];
  const ancora = Number(primeira.vencimentoKey.slice(8, 10));
  const saida: Ocorrencia[] = [];
  for (let i = 0; i < r.vezes; i++) {
    const bruta =
      r.frequencia === "MENSAL"
        ? somarMeses(primeira.vencimentoKey, i, ancora)
        : r.frequencia === "ANUAL"
          ? somarMeses(primeira.vencimentoKey, i * 12, ancora)
          : somarDias(primeira.vencimentoKey, i * (r.frequencia === "SEMANAL" ? 7 : 15));
    saida.push({
      indice: i + 1,
      vencimentoKey: i === 0 ? bruta : ajustarDia(bruta, r.ajuste, feriados),
      competencia: somarMesesNaCompetencia(primeira.competencia, mesesEntre(primeira.vencimentoKey, bruta)),
    });
  }
  return saida;
}
