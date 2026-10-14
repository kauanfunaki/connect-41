// Os dias da linha do tempo da auditoria e o período do filtro — no fuso do
// escritório (São Paulo, UTC-3 fixo desde 2019), não no do servidor.
//
// Puro, sem banco.

import { DIAS_DA_SEMANA, MESES, atalhosDePeriodo, dataBR, diaDaSemana, hojeIso, lerIso, somarDias } from "@/lib/datas/calendario";

/** O dia (AAAA-MM-DD) em que o instante caiu em São Paulo. */
export function diaEmSaoPaulo(instante: Date): string {
  return hojeIso(instante);
}

/** 00:00 do dia em São Paulo, como instante. */
export function inicioDoDia(iso: string): Date {
  return new Date(`${iso}T03:00:00.000Z`);
}

/** 00:00 do dia seguinte em São Paulo — o fim, aberto, de um intervalo. */
export function fimDoDia(iso: string): Date {
  return inicioDoDia(somarDias(iso, 1));
}

export type DiaDaLinha = { dia: string; total: number };

/** Conta as ações por dia de São Paulo, do mais recente para o mais antigo. */
export function contarPorDia(instantes: Iterable<Date>): DiaDaLinha[] {
  const n = new Map<string, number>();
  for (const i of instantes) {
    const d = diaEmSaoPaulo(i);
    n.set(d, (n.get(d) ?? 0) + 1);
  }
  return [...n.entries()].map(([dia, total]) => ({ dia, total })).sort((a, b) => (a.dia < b.dia ? 1 : -1));
}

/** Agrupa linhas já ordenadas (mais recente primeiro) pelo dia de São Paulo. */
export function agruparPorDia<T extends { createdAt: Date }>(linhas: readonly T[]): { dia: string; linhas: T[] }[] {
  const grupos: { dia: string; linhas: T[] }[] = [];
  for (const l of linhas) {
    const dia = diaEmSaoPaulo(l.createdAt);
    const ultimo = grupos[grupos.length - 1];
    if (ultimo && ultimo.dia === dia) ultimo.linhas.push(l);
    else grupos.push({ dia, linhas: [l] });
  }
  return grupos;
}

function plural(n: number, um: string, varios: string): string {
  return `${new Intl.NumberFormat("pt-BR").format(n)} ${n === 1 ? um : varios}`;
}

/** "terça, 14 de outubro" — e o ano, quando não é o de hoje. */
export function diaPorExtenso(iso: string, hoje: string): string {
  const d = lerIso(iso);
  const h = lerIso(hoje);
  if (!d) return iso;
  const semana = DIAS_DA_SEMANA[diaDaSemana(iso)].replace("-feira", "");
  return `${semana}, ${d.dia} de ${MESES[d.mes - 1]}${h && h.ano !== d.ano ? ` de ${d.ano}` : ""}`;
}

/**
 * O cabeçalho do dia: "Hoje" / "terça, 14 de outubro · 37 ações". Os dias
 * mais antigos levam a data no título.
 */
export function cabecalhoDoDia(iso: string, total: number, hoje: string): { titulo: string; apoio: string } {
  const extenso = diaPorExtenso(iso, hoje);
  const acoes = plural(total, "ação", "ações");
  if (iso === hoje) return { titulo: "Hoje", apoio: `${extenso} · ${acoes}` };
  if (iso === somarDias(hoje, -1)) return { titulo: "Ontem", apoio: `${extenso} · ${acoes}` };
  return { titulo: extenso.charAt(0).toUpperCase() + extenso.slice(1), apoio: acoes };
}

/** "hoje" / "ontem" / "de terça" — para o "Mostrar mais N ações de hoje". */
export function nomeCurtoDoDia(iso: string, hoje: string): string {
  if (iso === hoje) return "hoje";
  if (iso === somarDias(hoje, -1)) return "ontem";
  const d = lerIso(iso);
  return d ? `de ${dataBR(iso).slice(0, 5)}` : "";
}

// ─── Período do filtro ───────────────────────────────────────────────────────

export type ChaveDoPeriodo = "hoje" | "7d" | "30d" | "90d" | "mes" | "mes-passado" | "datas";

export const PERIODO_PADRAO: ChaveDoPeriodo = "7d";

export const OPCOES_DE_PERIODO: ReadonlyArray<{ chave: Exclude<ChaveDoPeriodo, "datas">; rotulo: string }> = [
  { chave: "hoje", rotulo: "Hoje" },
  { chave: "7d", rotulo: "Últimos 7 dias" },
  { chave: "30d", rotulo: "Últimos 30 dias" },
  { chave: "90d", rotulo: "Últimos 90 dias" },
  { chave: "mes", rotulo: "Este mês" },
  { chave: "mes-passado", rotulo: "Mês passado" },
];

export type Periodo = { chave: ChaveDoPeriodo; de: string; ate: string; rotulo: string };

/**
 * O período escolhido, em dias de São Paulo (as duas pontas inclusas). Datas
 * soltas valem só quando as duas são válidas; invertidas, trocam de lugar.
 * Sem escolha, os últimos 7 dias.
 */
export function resolverPeriodo(chave: string | null | undefined, de: string | null | undefined, ate: string | null | undefined, hoje: string): Periodo {
  if (chave === "datas" && lerIso(de) && lerIso(ate)) {
    const [a, b] = de! <= ate! ? [de!, ate!] : [ate!, de!];
    return { chave: "datas", de: a, ate: b, rotulo: a === b ? dataBR(a) : `${dataBR(a)} a ${dataBR(b)}` };
  }
  const atalhos = atalhosDePeriodo(hoje);
  const pelo = (rotulo: string) => atalhos.find((x) => x.rotulo === rotulo)!;
  switch (chave) {
    case "hoje":
      return { chave: "hoje", de: hoje, ate: hoje, rotulo: "Hoje" };
    case "30d":
      return { chave: "30d", de: pelo("Últimos 30 dias").de, ate: hoje, rotulo: "Últimos 30 dias" };
    case "90d":
      return { chave: "90d", de: somarDias(hoje, -89), ate: hoje, rotulo: "Últimos 90 dias" };
    case "mes":
      return { chave: "mes", de: pelo("Este mês").de, ate: hoje, rotulo: "Este mês" };
    case "mes-passado": {
      const m = pelo("Mês passado");
      return { chave: "mes-passado", de: m.de, ate: m.ate, rotulo: "Mês passado" };
    }
    default:
      return { chave: "7d", de: somarDias(hoje, -6), ate: hoje, rotulo: "Últimos 7 dias" };
  }
}

/** "01/10 a 14/10" — o apoio do cartão "Ações no período". */
export function periodoCurto(p: Pick<Periodo, "de" | "ate">): string {
  if (p.de === p.ate) return dataBR(p.de);
  return `${dataBR(p.de).slice(0, 5)} a ${dataBR(p.ate).slice(0, 5)}`;
}
