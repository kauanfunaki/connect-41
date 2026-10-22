// As datas de uma obrigação por regime (22/10/2026): competência → data legal
// → ajuste ao dia útil → prazo interno. Puro, sem banco: o motor
// (./geracao.ts) passa os feriados do escritório — os nacionais, calculados,
// mais as exceções de /admin/feriados (`feriadosDoEscritorio`).
//
// Todas as datas são "AAAA-MM-DD" e as competências "AAAA-MM", como no resto
// do Connect (src/lib/datas/calendario.ts). A competência trimestral é o último
// mês do trimestre (03, 06, 09, 12) e a anual é dezembro: assim a chave única
// da obrigação gerada é a mesma coluna para as três periodicidades, e a conta
// do vencimento é uma só — "N meses depois do último mês da competência".

import { diasNoMes, ehFimDeSemana, paraIso, somarDias, somarMeses } from "@/lib/datas/calendario";

export type Periodicidade = "MENSAL" | "TRIMESTRAL" | "ANUAL";
export type Ajuste = "ANTECIPAR" | "ADIAR";

/** Datas "AAAA-MM-DD" que não são dia útil, além de sábado e domingo. */
export type Feriados = ReadonlySet<string>;

/** O que o modelo diz sobre as datas. */
export type RegraDeData = {
  periodicidade: Periodicidade;
  /** Meses entre o último mês da competência e o mês do vencimento (0 a 24). */
  mesesAposCompetencia: number;
  /** 1..31; nulo = último dia útil do mês. */
  diaLegal: number | null;
  /** O prazo interno: quantos dias úteis antes da data legal (0 = a própria). */
  diasUteisAntes: number;
  /** Dia legal que cai em fim de semana ou feriado: antecipa ou adia. */
  ajuste: Ajuste;
};

export type DatasDaObrigacao = {
  competencia: string;
  /** O dia que a lei diz, antes do ajuste (no "último dia útil", já é o ajustado). */
  dataBase: string;
  /** A data legal, já em dia útil. */
  dataLegal: string;
  /** O prazo interno da equipe, em dia útil. */
  prazoInterno: string;
};

/** Meses de cada competência. */
export const MESES_DA_PERIODICIDADE: Record<Periodicidade, number> = { MENSAL: 1, TRIMESTRAL: 3, ANUAL: 12 };

/**
 * Quantas competências à frente o motor mantém geradas: os próximos três meses
 * da mensal; a próxima ocorrência da trimestral e da anual.
 */
export const OCORRENCIAS_A_FRENTE: Record<Periodicidade, number> = { MENSAL: 3, TRIMESTRAL: 1, ANUAL: 1 };

/** Limite defensivo dos laços de dia útil — não existem 30 dias seguidos de folga. */
const LIMITE_DE_DIAS = 30;

const p2 = (n: number) => String(n).padStart(2, "0");

export function ehDiaUtil(iso: string, feriados: Feriados): boolean {
  return !ehFimDeSemana(iso) && !feriados.has(iso);
}

/** O próprio dia, se útil; senão o útil anterior (antecipar) ou o seguinte (adiar). */
export function ajustarAoDiaUtil(iso: string, ajuste: Ajuste, feriados: Feriados): string {
  const passo = ajuste === "ANTECIPAR" ? -1 : 1;
  let d = iso;
  for (let i = 0; i < LIMITE_DE_DIAS && !ehDiaUtil(d, feriados); i++) d = somarDias(d, passo);
  return d;
}

export function ultimoDiaUtilDoMes(ano: number, mes: number, feriados: Feriados): string {
  return ajustarAoDiaUtil(paraIso({ ano, mes, dia: diasNoMes(ano, mes) }), "ANTECIPAR", feriados);
}

/** N dias úteis antes de `iso` (0 = o próprio `iso`). */
export function voltarDiasUteis(iso: string, n: number, feriados: Feriados): string {
  let d = iso;
  let faltam = Math.max(0, Math.floor(n));
  for (let i = 0; faltam > 0 && i < faltam * 7 + LIMITE_DE_DIAS; i++) {
    d = somarDias(d, -1);
    if (ehDiaUtil(d, feriados)) faltam--;
  }
  return d;
}

function lerCompetencia(comp: string): { ano: number; mes: number } | null {
  const m = /^(\d{4})-(\d{2})$/.exec(comp);
  if (!m) return null;
  const ano = Number(m[1]);
  const mes = Number(m[2]);
  return mes >= 1 && mes <= 12 ? { ano, mes } : null;
}

/** "AAAA-MM" que existe nesta periodicidade (trimestral: 03/06/09/12; anual: 12). */
export function competenciaValida(periodicidade: Periodicidade, comp: string): boolean {
  const c = lerCompetencia(comp);
  if (!c) return false;
  return c.mes % MESES_DA_PERIODICIDADE[periodicidade] === 0;
}

/** A competência da periodicidade que contém o mês dado (o fim do trimestre, dezembro). */
export function competenciaQueContem(periodicidade: Periodicidade, ano: number, mes: number): string {
  const tamanho = MESES_DA_PERIODICIDADE[periodicidade];
  const fim = Math.ceil(mes / tamanho) * tamanho;
  return `${ano}-${p2(fim)}`;
}

export function somarCompetencias(periodicidade: Periodicidade, comp: string, n: number): string {
  const c = lerCompetencia(comp);
  if (!c) return comp;
  const r = somarMeses(c.ano, c.mes, n * MESES_DA_PERIODICIDADE[periodicidade]);
  return `${r.ano}-${p2(r.mes)}`;
}

/** As datas de uma competência. `null` se a competência não vale para a periodicidade. */
export function datasDaCompetencia(regra: RegraDeData, comp: string, feriados: Feriados): DatasDaObrigacao | null {
  if (!competenciaValida(regra.periodicidade, comp)) return null;
  const c = lerCompetencia(comp)!;
  const { ano, mes } = somarMeses(c.ano, c.mes, regra.mesesAposCompetencia);

  let dataBase: string;
  let dataLegal: string;
  if (regra.diaLegal === null) {
    dataLegal = ultimoDiaUtilDoMes(ano, mes, feriados);
    dataBase = dataLegal;
  } else {
    // Dia 31 em fevereiro, abril…: o último dia do mês (como a obrigação recorrente).
    dataBase = paraIso({ ano, mes, dia: Math.min(Math.max(1, regra.diaLegal), diasNoMes(ano, mes)) });
    dataLegal = ajustarAoDiaUtil(dataBase, regra.ajuste, feriados);
  }
  return { competencia: comp, dataBase, dataLegal, prazoInterno: voltarDiasUteis(dataLegal, regra.diasUteisAntes, feriados) };
}

/**
 * As próximas competências a gerar: as primeiras cuja data legal ainda não
 * passou (hoje conta), quantas `OCORRENCIAS_A_FRENTE` pedir. A que venceu
 * ontem já não entra — o motor nunca cria obrigação vencida.
 */
export function proximasOcorrencias(regra: RegraDeData, hoje: string, feriados: Feriados): DatasDaObrigacao[] {
  const [ano, mes] = [Number(hoje.slice(0, 4)), Number(hoje.slice(5, 7))];
  // Começa um período antes do mês cujo vencimento cairia hoje: a antecipação
  // pode puxar a data para o mês anterior.
  const inicio = somarMeses(ano, mes, -regra.mesesAposCompetencia - MESES_DA_PERIODICIDADE[regra.periodicidade]);
  let comp = competenciaQueContem(regra.periodicidade, inicio.ano, inicio.mes);
  const quantas = OCORRENCIAS_A_FRENTE[regra.periodicidade];
  const lista: DatasDaObrigacao[] = [];
  for (let i = 0; lista.length < quantas && i < 60; i++) {
    const datas = datasDaCompetencia(regra, comp, feriados);
    if (datas && datas.dataLegal >= hoje) lista.push(datas);
    comp = somarCompetencias(regra.periodicidade, comp, 1);
  }
  return lista;
}

const ORDINAIS = ["1º", "2º", "3º", "4º"];

/** "09/2026", "3º trimestre de 2026", "2026". */
export function rotuloDaCompetencia(periodicidade: Periodicidade, comp: string): string {
  const c = lerCompetencia(comp);
  if (!c) return comp;
  if (periodicidade === "ANUAL") return String(c.ano);
  if (periodicidade === "TRIMESTRAL") return `${ORDINAIS[Math.ceil(c.mes / 3) - 1]} trimestre de ${c.ano}`;
  return `${p2(c.mes)}/${c.ano}`;
}

function quandoVence(meses: number, periodicidade: Periodicidade): string {
  const depois = periodicidade === "MENSAL" ? "da competência" : periodicidade === "TRIMESTRAL" ? "do fim do trimestre" : "do fim do ano";
  if (meses === 0) return `no mês ${periodicidade === "MENSAL" ? "da competência" : periodicidade === "TRIMESTRAL" ? "do fim do trimestre" : "de dezembro"}`;
  if (meses === 1 && periodicidade === "MENSAL") return "no mês seguinte";
  return `${meses} ${meses === 1 ? "mês" : "meses"} depois ${depois}`;
}

/** A regra de datas em uma frase, para a lista: "dia 20, no mês seguinte · adia · prazo interno 2 dias úteis antes". */
export function descreverRegraDeData(regra: RegraDeData): string {
  const dia = regra.diaLegal === null ? "último dia útil" : `dia ${regra.diaLegal}`;
  const partes = [`${dia}, ${quandoVence(regra.mesesAposCompetencia, regra.periodicidade)}`];
  if (regra.diaLegal !== null) partes.push(regra.ajuste === "ANTECIPAR" ? "antecipa se não for dia útil" : "adia se não for dia útil");
  if (regra.diasUteisAntes > 0) {
    partes.push(`prazo interno ${regra.diasUteisAntes} ${regra.diasUteisAntes === 1 ? "dia útil" : "dias úteis"} antes`);
  }
  return partes.join(" · ");
}
