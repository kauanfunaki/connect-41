// Períodos aquisitivos e a parte das férias de cada mês (25/11/2026,
// funcionalidade-745, entrega 2.1). "Processos › Férias › Períodos Aquisitivos"
// e "Controle de Valores Adicional de 1/3" da Domínio.
//
// - Período aquisitivo: 12 meses a partir da admissão (CLT art. 130); o
//   concessivo são os 12 meses seguintes (art. 134). Passado o concessivo com
//   saldo, as férias são devidas em dobro (art. 137).
// - As férias gravadas abatem o saldo do período (gozo + abono). O direito cai
//   com as faltas injustificadas do período (art. 130).
// - A parte de cada mês: o recibo é pago antes do gozo, mas na folha do mês
//   o salário cai nos dias de férias e as férias entram para o INSS e o FGTS
//   (o IRRF das férias é separado). Gozo que passa para o mês seguinte divide
//   as férias, o 1/3 e o INSS pelos dias corridos de cada mês; abono, 1/3 do
//   abono e IRRF ficam no mês em que o gozo começa (o do pagamento).
//
// Puro, sem banco.

import { diasDeFeriasPorFaltas } from "@/lib/rescisao/constantes";

const DIA = 24 * 60 * 60 * 1000;
const r2 = (n: number) => Math.round(n * 100) / 100;
const iso = (d: Date) => d.toISOString().slice(0, 10);

/** Mesmo dia, `anos` depois (29/02 cai em 28/02 no ano que não é bissexto). */
function somarAnos(d: Date, anos: number): Date {
  const ano = d.getUTCFullYear() + anos;
  const mes = d.getUTCMonth();
  const ultimo = new Date(Date.UTC(ano, mes + 1, 0)).getUTCDate();
  return new Date(Date.UTC(ano, mes, Math.min(d.getUTCDate(), ultimo)));
}

export type SituacaoDoPeriodo = "EM_AQUISICAO" | "A_GOZAR" | "EM_DOBRO" | "QUITADO";
export const NOME_DA_SITUACAO_DO_PERIODO: Record<SituacaoDoPeriodo, string> = {
  EM_AQUISICAO: "Em aquisição",
  A_GOZAR: "Vencido, a gozar",
  EM_DOBRO: "Em dobro (passou do concessivo)",
  QUITADO: "Quitado",
};

export type FeriasDoPeriodo = { aquisitivoInicio: string; diasGozo: number; diasAbono: number; faltas: number; terco: number; tercoAbono: number };

export type PeriodoAquisitivo = {
  /** "AAAA-MM-DD". */
  inicio: string;
  fim: string;
  /** Último dia para conceder sem dobra. */
  concessivoFim: string;
  direito: number;
  usados: number;
  saldo: number;
  /** O adicional de 1/3 já pago no período (férias + abono). */
  tercoPago: number;
  situacao: SituacaoDoPeriodo;
};

/**
 * Os períodos aquisitivos da admissão até hoje, do mais antigo ao mais novo,
 * com o que as férias gravadas já usaram. Desligado: só até o desligamento.
 */
export function periodosAquisitivos(admissao: Date, hoje: Date, ferias: readonly FeriasDoPeriodo[], desligamento?: Date | null): PeriodoAquisitivo[] {
  const limite = desligamento && desligamento < hoje ? desligamento : hoje;
  const periodos: PeriodoAquisitivo[] = [];
  for (let k = 0; k < 80; k++) {
    const inicio = somarAnos(admissao, k);
    if (inicio > limite) break;
    const fim = new Date(somarAnos(admissao, k + 1).getTime() - DIA);
    const concessivoFim = new Date(somarAnos(admissao, k + 2).getTime() - DIA);
    const doPeriodo = ferias.filter((f) => f.aquisitivoInicio === iso(inicio));
    const faltas = doPeriodo.length ? Math.max(...doPeriodo.map((f) => f.faltas)) : 0;
    const direito = diasDeFeriasPorFaltas(faltas);
    const usados = doPeriodo.reduce((s, f) => s + f.diasGozo + f.diasAbono, 0);
    const saldo = Math.max(0, direito - usados);
    const tercoPago = r2(doPeriodo.reduce((s, f) => s + f.terco + f.tercoAbono, 0));
    const situacao: SituacaoDoPeriodo = hoje <= fim ? "EM_AQUISICAO" : saldo <= 0 ? "QUITADO" : hoje > concessivoFim ? "EM_DOBRO" : "A_GOZAR";
    periodos.push({ inicio: iso(inicio), fim: iso(fim), concessivoFim: iso(concessivoFim), direito, usados, saldo, tercoPago, situacao });
  }
  return periodos;
}

/** O período em que as férias novas entram: o mais antigo já vencido com saldo. */
export function periodoSugerido(periodos: readonly PeriodoAquisitivo[]): PeriodoAquisitivo | null {
  return periodos.find((p) => p.situacao !== "EM_AQUISICAO" && p.situacao !== "QUITADO") ?? null;
}

export type FeriasGravadasParaOMes = {
  inicioGozo: Date;
  diasGozo: number;
  ferias: number;
  terco: number;
  abono: number;
  tercoAbono: number;
  inss: number;
  irrf: number;
};

export type FeriasNoMes = {
  /** Dias de férias no mês comercial de 30 dias: o salário do mês paga 30 − isto. */
  diasDeFerias: number;
  /** Dias corridos de gozo no mês, para a memória. */
  diasCorridos: number;
  primeiroMes: boolean;
  ferias: number;
  terco: number;
  abono: number;
  tercoAbono: number;
  /** INSS das férias já descontado no recibo, na parte deste mês. */
  inssRetido: number;
  /** IRRF das férias (separado, no mês do pagamento). */
  irrfRetido: number;
  /** O que o recibo já pagou desta parte: entra como desconto na folha. */
  liquidoPago: number;
  /** "dd/mm a dd/mm", o gozo inteiro. */
  periodo: string;
};

const ddmm = (d: Date) => `${String(d.getUTCDate()).padStart(2, "0")}/${String(d.getUTCMonth() + 1).padStart(2, "0")}`;

/** A parte das férias que cai no mês, ou null se o gozo não passa por ele. */
export function feriasNoMes(f: FeriasGravadasParaOMes, ano: number, mes: number): FeriasNoMes | null {
  const inicio = f.inicioGozo;
  const fim = new Date(inicio.getTime() + (f.diasGozo - 1) * DIA);
  const mesIni = new Date(Date.UTC(ano, mes - 1, 1));
  const mesFim = new Date(Date.UTC(ano, mes, 0));
  if (fim < mesIni || inicio > mesFim) return null;
  const de = inicio > mesIni ? inicio : mesIni;
  const ate = fim < mesFim ? fim : mesFim;
  const diasCorridos = Math.round((ate.getTime() - de.getTime()) / DIA) + 1;
  // Mês comercial: dias antes do gozo + dias depois dele, contados até o dia 30.
  const antes = inicio > mesIni ? inicio.getUTCDate() - 1 : 0;
  const depois = fim < mesFim ? Math.max(0, 30 - fim.getUTCDate()) : 0;
  const diasDeFerias = Math.max(0, 30 - Math.min(30, antes + depois));

  const primeiroMes = inicio >= mesIni;
  // O mês do início leva a fração dos dias dele; o outro, o resto (a soma fecha com o recibo).
  const diasNoPrimeiro = primeiroMes ? diasCorridos : f.diasGozo - diasCorridos;
  const parte = (total: number) => {
    const doPrimeiro = r2((total * diasNoPrimeiro) / f.diasGozo);
    return primeiroMes ? doPrimeiro : r2(total - doPrimeiro);
  };
  const ferias = parte(f.ferias);
  const terco = parte(f.terco);
  const inssRetido = parte(f.inss);
  const abono = primeiroMes ? f.abono : 0;
  const tercoAbono = primeiroMes ? f.tercoAbono : 0;
  const irrfRetido = primeiroMes ? f.irrf : 0;
  return {
    diasDeFerias,
    diasCorridos,
    primeiroMes,
    ferias,
    terco,
    abono,
    tercoAbono,
    inssRetido,
    irrfRetido,
    liquidoPago: r2(ferias + terco + abono + tercoAbono - inssRetido - irrfRetido),
    periodo: `${ddmm(inicio)} a ${ddmm(fim)}`,
  };
}
