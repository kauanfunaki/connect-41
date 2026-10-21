// A repetição do lançamento (lote D, fila do BPO de 19/10 — "repetição" do
// Omie): aluguel, folha, pró-labore, mensalidade. O lançamento manual nasce já
// com as próximas ocorrências, todas de uma vez, como o Omie faz — cada uma é
// uma conta comum, que se edita, paga e cancela sozinha; a série só as liga
// (`recurrenceId`, "3/12").
//
// O fim da série (21/10, o que sobrou da fila do BPO — o Nibo tem): um número
// de vezes, até uma data ou sem data de fim, e o "todo dia útil". A série com
// número de vezes nasce inteira, como antes. A que vai até uma data ou não tem
// fim nasce até o horizonte (`horizonteDaSerie`), e o agendador cria as
// seguintes conforme o tempo anda — ver `estenderSeries`.
//
// Funções puras; a gravação é `criarLancamentoManual` e `estenderSeries`.

import { dataValida } from "./periodo";

export type Frequencia = "MENSAL" | "QUINZENAL" | "SEMANAL" | "ANUAL" | "DIARIA";
/** O que fazer com o vencimento que cai em fim de semana ou feriado. */
export type AjusteDoDia = "MANTER" | "ANTECIPAR" | "ADIAR";

export const FREQUENCIAS: { valor: Frequencia; rotulo: string }[] = [
  { valor: "MENSAL", rotulo: "Todo mês" },
  { valor: "QUINZENAL", rotulo: "A cada 15 dias" },
  { valor: "SEMANAL", rotulo: "Toda semana" },
  { valor: "ANUAL", rotulo: "Todo ano" },
  // Pula fim de semana e feriado sozinha: "adiar" ou "antecipar" juntaria duas no mesmo dia.
  { valor: "DIARIA", rotulo: "Todo dia útil" },
];

/** Como a série termina. */
export type FimDaSerie = { tipo: "VEZES"; vezes: number } | { tipo: "ATE"; dataKey: string } | { tipo: "SEM_FIM" };

export const FINS_DA_SERIE: { valor: FimDaSerie["tipo"]; rotulo: string }[] = [
  { valor: "VEZES", rotulo: "Depois de algumas vezes" },
  { valor: "ATE", rotulo: "Até uma data" },
  { valor: "SEM_FIM", rotulo: "Sem data de fim" },
];

export const AJUSTES_DO_DIA: { valor: AjusteDoDia; rotulo: string }[] = [
  { valor: "ADIAR", rotulo: "Adiar para o dia útil seguinte" },
  { valor: "ANTECIPAR", rotulo: "Antecipar para o dia útil anterior" },
  { valor: "MANTER", rotulo: "Manter a data" },
];

/** Teto da série com número de vezes: dez anos de mensal, dois de semanal. */
export const MAXIMO_DE_OCORRENCIAS = 120;
/**
 * Teto da série até uma data: conta as que cabem até lá, e passar disso é um
 * engano de data (2062 no lugar de 2026) — para o longo, há o "sem data de fim".
 */
export const MAXIMO_ATE_A_DATA = 1000;

export type Repeticao = { frequencia: Frequencia; ajuste: AjusteDoDia; fim: FimDaSerie };

/**
 * Os campos "Repetir" do formulário. Sem frequência, não repete (`null`).
 * `vezes` conta a primeira: "12 vezes" são esta e mais 11. Sem `fim`, é o
 * número de vezes, como antes de 21/10. A data final é conferida contra o
 * primeiro vencimento em `totalDaSerie`.
 */
export function validarRepeticao(campos: {
  frequencia: string | null | undefined;
  fim?: string | null | undefined;
  vezes: string | null | undefined;
  ate?: string | null | undefined;
  ajuste: string | null | undefined;
}): { ok: true; repeticao: Repeticao | null } | { ok: false; erro: string } {
  const frequencia = (campos.frequencia ?? "").trim();
  if (!frequencia) return { ok: true, repeticao: null };
  if (!FREQUENCIAS.some((f) => f.valor === frequencia)) return { ok: false, erro: "Frequência da repetição inválida." };
  const ajuste = (campos.ajuste ?? "").trim() || "ADIAR";
  if (!AJUSTES_DO_DIA.some((a) => a.valor === ajuste)) return { ok: false, erro: "Ajuste de fim de semana inválido." };

  const tipo = (campos.fim ?? "").trim() || "VEZES";
  let fim: FimDaSerie;
  if (tipo === "VEZES") {
    const vezes = Number((campos.vezes ?? "").trim());
    if (!Number.isInteger(vezes) || vezes < 2) return { ok: false, erro: "Informe quantas vezes repete — duas ou mais, contando esta." };
    if (vezes > MAXIMO_DE_OCORRENCIAS) return { ok: false, erro: `No máximo ${MAXIMO_DE_OCORRENCIAS} vezes — para mais, use "sem data de fim".` };
    fim = { tipo: "VEZES", vezes };
  } else if (tipo === "ATE") {
    const dataKey = dataValida((campos.ate ?? "").trim());
    if (!dataKey) return { ok: false, erro: "Informe até que dia a conta repete." };
    fim = { tipo: "ATE", dataKey };
  } else if (tipo === "SEM_FIM") {
    fim = { tipo: "SEM_FIM" };
  } else {
    return { ok: false, erro: "Fim da repetição inválido." };
  }
  return { ok: true, repeticao: { frequencia: frequencia as Frequencia, ajuste: ajuste as AjusteDoDia, fim } };
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

/** "3/12" — a posição da conta na série; "3/∞" na sem data de fim; sem série, nada. */
export function rotuloDaSerie(conta: { recurrenceIndex: number | null; recurrenceTotal: number | null }): string | null {
  if (!conta.recurrenceIndex) return null;
  return `${conta.recurrenceIndex}/${conta.recurrenceTotal ?? "∞"}`;
}

/** A conta tem próximas na série — o "cancelar esta e as próximas" faz sentido. */
export function temProximasNaSerie(conta: { recurrenceId: string | null; recurrenceIndex: number | null; recurrenceTotal: number | null }): boolean {
  if (!conta.recurrenceId || !conta.recurrenceIndex) return false;
  return conta.recurrenceTotal === null || conta.recurrenceIndex < conta.recurrenceTotal;
}

/**
 * Até onde a série sem número de vezes nasce agora — e até onde o agendador a
 * mantém: o que o fluxo de caixa precisa ver, sem criar anos de contas de uma
 * vez. Conta pelo vencimento antes do ajuste do dia.
 */
export function horizonteDaSerie(frequencia: Frequencia, hojeKey: string): string {
  const meses = frequencia === "DIARIA" ? 2 : frequencia === "SEMANAL" || frequencia === "QUINZENAL" ? 6 : frequencia === "ANUAL" ? 36 : 12;
  return somarMeses(hojeKey, meses, Number(hojeKey.slice(8, 10)));
}

/** O próximo dia útil depois de `k` — o passo do "todo dia útil". */
function proximoDiaUtil(k: string, feriados: ReadonlySet<string>): string {
  let d = somarDias(k, 1);
  for (let i = 0; i < 15 && naoUtil(d, feriados); i++) d = somarDias(d, 1);
  return d;
}

/**
 * As ocorrências da série, a primeira inclusa — ela fica como a pessoa
 * digitou; as seguintes andam na frequência e, caindo em fim de semana ou
 * feriado, são ajustadas. O "todo dia útil" anda de dia útil em dia útil.
 *
 * A competência anda junto com o mês do vencimento **sem o ajuste**: o
 * aluguel de 31/10 que cai num sábado e vai para 02/11 continua sendo de
 * outubro.
 *
 * Param no fim da série — o número de vezes, ou a data final — e, se vier,
 * em `limiteKey`: o horizonte da série sem fim, pelo vencimento sem ajuste.
 * Sem número de vezes nem limite, param no teto `MAXIMO_ATE_A_DATA + 1`, que
 * é o que diz a `totalDaSerie` que a data passou do teto.
 */
export function ocorrenciasDaRepeticao(
  primeira: { vencimentoKey: string; competencia: string },
  r: Repeticao,
  feriados: ReadonlySet<string> = new Set(),
  limiteKey?: string
): Ocorrencia[] {
  if (!dataValida(primeira.vencimentoKey)) return [];
  const ancora = Number(primeira.vencimentoKey.slice(8, 10));
  const vezes = r.fim.tipo === "VEZES" ? r.fim.vezes : MAXIMO_ATE_A_DATA + 1;
  const ate = [r.fim.tipo === "ATE" ? r.fim.dataKey : null, limiteKey ?? null].filter((k): k is string => Boolean(k)).sort()[0] ?? null;
  const saida: Ocorrencia[] = [];
  let anteriorDiaria = primeira.vencimentoKey;
  for (let i = 0; i < vezes; i++) {
    let bruta: string;
    if (r.frequencia === "DIARIA") {
      bruta = i === 0 ? primeira.vencimentoKey : proximoDiaUtil(anteriorDiaria, feriados);
      anteriorDiaria = bruta;
    } else {
      bruta =
        r.frequencia === "MENSAL"
          ? somarMeses(primeira.vencimentoKey, i, ancora)
          : r.frequencia === "ANUAL"
            ? somarMeses(primeira.vencimentoKey, i * 12, ancora)
            : somarDias(primeira.vencimentoKey, i * (r.frequencia === "SEMANAL" ? 7 : 15));
    }
    // A primeira sempre entra: é a conta que a pessoa lançou.
    if (i > 0 && ate && bruta > ate) break;
    saida.push({
      indice: i + 1,
      vencimentoKey: i === 0 || r.frequencia === "DIARIA" ? bruta : ajustarDia(bruta, r.ajuste, feriados),
      competencia: somarMesesNaCompetencia(primeira.competencia, mesesEntre(primeira.vencimentoKey, bruta)),
    });
  }
  return saida;
}

/**
 * Quantas contas a série tem ao todo: o número de vezes, as que cabem até a
 * data final, ou nulo na sem fim ("3/∞"). Recusa a data final antes do
 * primeiro vencimento e a que passa do teto.
 */
export function totalDaSerie(
  primeira: { vencimentoKey: string; competencia: string },
  r: Repeticao,
  feriados: ReadonlySet<string> = new Set()
): { ok: true; total: number | null } | { ok: false; erro: string } {
  if (r.fim.tipo === "VEZES") return { ok: true, total: r.fim.vezes };
  if (r.fim.tipo === "SEM_FIM") return { ok: true, total: null };
  if (r.fim.dataKey <= primeira.vencimentoKey) return { ok: false, erro: "A data final da repetição precisa ser depois do vencimento." };
  const n = ocorrenciasDaRepeticao(primeira, r, feriados).length;
  if (n > MAXIMO_ATE_A_DATA) return { ok: false, erro: `Até essa data são mais de ${MAXIMO_ATE_A_DATA} contas — confira a data, ou use "sem data de fim".` };
  if (n < 2) return { ok: false, erro: "Até essa data a conta não chega a repetir — escolha uma data mais adiante." };
  return { ok: true, total: n };
}
