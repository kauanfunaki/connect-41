// Quanto custa a hora de cada setor, e quanto cada cliente custa de verdade.
//
// Veio da "Calculadora de preço" e das "Horas de operação" do 41-gestao
// (29/09/2026), com uma diferença decidida pelo Kauan: **não há um segundo
// cadastro de custos**. O custo da hora sai do Valora — custo mensal da equipe
// do setor ÷ horas produtivas, mais o rateio das despesas fixas —, o mesmo
// número que precifica a proposta. E o honorário do cliente é o preço da
// proposta que ele fechou no Valora.
//
// Custo por pessoa (que exigiria salário, dado sensível) ficou para depois.

import { custoPorMinuto, rateioPorMinuto, type Catalogo, type ParametrosPreco } from "@/lib/valora/motor";

/** Setor do Connect → setor do catálogo do Valora. Setor fora daqui não tem custo no Valora. */
export const SETOR_DO_VALORA: Record<string, string> = {
  fiscal: "FIS",
  dp: "DP",
  dprh: "DP",
  societario: "SOC",
  contabil: "CTB",
};

export type CustoDaHora = { direto: number; rateio: number; total: number };

/** O custo de uma hora do setor, ou `null` quando o Valora não tem o custo da equipe dele. */
export function custoDaHora(catalogo: Catalogo, parametros: ParametrosPreco, setorDoConnect: string): CustoDaHora | null {
  const codigo = SETOR_DO_VALORA[setorDoConnect];
  const setor = codigo ? catalogo.setores.find((s) => s.codigo === codigo) : undefined;
  if (!setor) return null;
  const direto = custoPorMinuto(setor) * 60;
  if (direto <= 0) return null;
  const rateio = rateioPorMinuto(catalogo, parametros) * 60;
  return { direto, rateio, total: direto + rateio };
}

// ─── Horas de operação ───────────────────────────────────────────────────────

export type Apontamento = { setor: string; userId: string; minutos: number; companyId: string | null };

export type TotalDeHoras = { minutos: number; custo: number | null };

export type ResumoDeHoras = {
  total: TotalDeHoras;
  porSetor: ({ setor: string } & TotalDeHoras)[];
  porPessoa: ({ userId: string } & TotalDeHoras)[];
  /** Minutos em setor que o Valora não sabe custear — o custo total os deixa de fora. */
  minutosSemCusto: number;
};

/**
 * Soma as horas por setor e por pessoa, com o custo de cada uma. Custo nulo
 * quando nenhuma das horas daquele grupo tem custo conhecido.
 */
export function resumirHoras(apontamentos: Apontamento[], custoDe: (setor: string) => CustoDaHora | null): ResumoDeHoras {
  const somar = (mapa: Map<string, TotalDeHoras>, chave: string, minutos: number, custo: number | null) => {
    const atual = mapa.get(chave) ?? { minutos: 0, custo: null };
    atual.minutos += minutos;
    if (custo !== null) atual.custo = (atual.custo ?? 0) + custo;
    mapa.set(chave, atual);
  };
  const porSetor = new Map<string, TotalDeHoras>();
  const porPessoa = new Map<string, TotalDeHoras>();
  let minutos = 0;
  let custoTotal: number | null = null;
  let minutosSemCusto = 0;
  for (const a of apontamentos) {
    const c = custoDe(a.setor);
    const custo = c ? (a.minutos / 60) * c.total : null;
    if (custo === null) minutosSemCusto += a.minutos;
    else custoTotal = (custoTotal ?? 0) + custo;
    minutos += a.minutos;
    somar(porSetor, a.setor, a.minutos, custo);
    somar(porPessoa, a.userId, a.minutos, custo);
  }
  const ordenar = <T extends TotalDeHoras>(xs: T[]) => xs.sort((x, y) => y.minutos - x.minutos);
  return {
    total: { minutos, custo: custoTotal },
    porSetor: ordenar([...porSetor].map(([setor, t]) => ({ setor, ...t }))),
    porPessoa: ordenar([...porPessoa].map(([userId, t]) => ({ userId, ...t }))),
    minutosSemCusto,
  };
}

// ─── Diagnóstico da carteira (a calculadora do 41-gestao, dentro do Valora) ─

export type PropostaGanha = { companyId: string; cliente: string; honorario: number; alvo: number | null };

export type LinhaDoDiagnostico = {
  companyId: string;
  cliente: string;
  honorario: number;
  /** Horas reais por mês, na média do período. */
  horasMes: number;
  /** Custo real por mês — só das horas em setor com custo conhecido. */
  custoMes: number;
  /** Honorário menos impostos, inadimplência e comissão (as variáveis do Valora). */
  liquido: number;
  /** (líquido − custo) ÷ honorário, em %. */
  margemPct: number | null;
  /** O preço alvo que o Valora calculou na proposta. */
  alvo: number | null;
  /** Horas em setor sem custo no Valora: o custo real está subestimado. */
  temHoraSemCusto: boolean;
};

/**
 * Para cada cliente com proposta fechada, o que ele paga contra o que custou
 * de verdade no período. Pior margem primeiro. Cliente sem hora apontada não
 * entra — sem apontamento não há o que comparar.
 */
export function diagnosticarCarteira(
  propostas: PropostaGanha[],
  apontamentos: Apontamento[],
  custoDe: (setor: string) => CustoDaHora | null,
  parametros: ParametrosPreco,
  meses: number
): LinhaDoDiagnostico[] {
  const porEmpresa = new Map<string, Apontamento[]>();
  for (const a of apontamentos) {
    if (!a.companyId) continue;
    porEmpresa.set(a.companyId, [...(porEmpresa.get(a.companyId) ?? []), a]);
  }
  const linhas: LinhaDoDiagnostico[] = [];
  for (const p of propostas) {
    const aps = porEmpresa.get(p.companyId);
    if (!aps || aps.length === 0) continue;
    const r = resumirHoras(aps, custoDe);
    const custoMes = (r.total.custo ?? 0) / meses;
    const liquido = p.honorario * (1 - parametros.variaveisPct / 100);
    linhas.push({
      companyId: p.companyId,
      cliente: p.cliente,
      honorario: p.honorario,
      horasMes: r.total.minutos / 60 / meses,
      custoMes,
      liquido,
      margemPct: p.honorario > 0 ? ((liquido - custoMes) / p.honorario) * 100 : null,
      alvo: p.alvo,
      temHoraSemCusto: r.minutosSemCusto > 0,
    });
  }
  return linhas.sort((a, b) => (a.margemPct ?? Infinity) - (b.margemPct ?? Infinity));
}
