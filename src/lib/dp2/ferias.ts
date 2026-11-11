// Férias no DP 2 (11/11/2026): o recibo de férias de uma pessoa.
//
// - Remuneração: salário cheio + insalubridade/periculosidade + média das
//   variáveis do período aquisitivo.
// - Férias = remuneração ÷ 30 × dias de gozo, mais 1/3 (CF art. 7º, XVII).
// - Abono pecuniário (até 1/3 do direito, CLT art. 143) e o 1/3 dele: sem INSS,
//   IRRF e FGTS (natureza indenizatória).
// - INSS e IRRF das férias calculados em separado do salário do mês (o IRRF
//   das férias é sempre separado; o INSS do mês soma salário e férias, e isso
//   é ajustado quando a competência do mês for calculada — aviso no recibo).
// - Pagamento até 2 dias antes do início (CLT art. 145).
//
// Puro, sem banco.

import { r2 } from "@/lib/rescisao/constantes";
import { diasDeFeriasPorFaltas } from "@/lib/rescisao/constantes";
import { calcularInss, calcularIrrf, type ResultadoInss, type ResultadoIrrf } from "./impostos";
import { reais, pct } from "./formato";
import { adicionaisFixos, FGTS_ALIQUOTA, FGTS_ALIQUOTA_APRENDIZ, salarioMensalCheio, type VinculoDoMotor } from "./mensal";
import type { TabelasDaCompetencia } from "./tabelas";

export type EntradaDeFerias = {
  inicio: Date;
  diasDeGozo: number;
  diasDeAbono: number;
  /** Faltas injustificadas no período aquisitivo (reduzem o direito, CLT art. 130). */
  faltas: number;
  vinculo: VinculoDoMotor;
  mediaVariaveis: number;
  tabelas: TabelasDaCompetencia;
};

export type LinhaDoRecibo = { nome: string; referencia: string; valor: number; tipo: "PROVENTO" | "DESCONTO"; memoria: string };

export type CalculoDeFerias =
  | { ok: false; erro: string }
  | {
      ok: true;
      direito: number;
      fim: Date;
      pagamentoAte: Date;
      remuneracao: number;
      linhas: LinhaDoRecibo[];
      proventos: number;
      descontos: number;
      liquido: number;
      inss: ResultadoInss;
      irrf: ResultadoIrrf;
      baseFgts: number;
      fgts: number;
      memoria: string[];
      alertas: string[];
    };

const DIA = 24 * 60 * 60 * 1000;

export function calcularFerias(e: EntradaDeFerias): CalculoDeFerias {
  const direito = diasDeFeriasPorFaltas(Math.max(0, e.faltas));
  if (direito === 0) return { ok: false, erro: "Mais de 32 faltas injustificadas no período: não há direito a férias (CLT art. 130)." };
  if (e.diasDeGozo < 5) return { ok: false, erro: "As férias precisam ter ao menos 5 dias corridos (CLT art. 134, § 1º)." };
  if (e.diasDeAbono < 0 || e.diasDeAbono > Math.floor(direito / 3)) {
    return { ok: false, erro: `O abono vai até 1/3 do direito: no máximo ${Math.floor(direito / 3)} dias.` };
  }
  if (e.diasDeGozo + e.diasDeAbono > direito) {
    return { ok: false, erro: `Gozo e abono somam ${e.diasDeGozo + e.diasDeAbono} dias, mas o direito é de ${direito}.` };
  }

  const v = e.vinculo;
  const { insalubridade, periculosidade } = adicionaisFixos(v, e.tabelas.salarioMinimo.dados.valor);
  const cheio = salarioMensalCheio(v);
  const remuneracao = r2(cheio + insalubridade + periculosidade + e.mediaVariaveis);
  const dia = remuneracao / 30;
  const memoria = [
    `Direito: ${direito} dias${e.faltas > 5 ? ` (${e.faltas} faltas no período)` : ""}`,
    `Remuneração ${reais(remuneracao)} = salário ${reais(cheio)}${insalubridade ? ` + insalubridade ${reais(insalubridade)}` : ""}${periculosidade ? ` + periculosidade ${reais(periculosidade)}` : ""}${e.mediaVariaveis ? ` + média de variáveis ${reais(e.mediaVariaveis)}` : ""}`,
  ];

  const ferias = r2(dia * e.diasDeGozo);
  const terco = r2(ferias / 3);
  const abono = r2(dia * e.diasDeAbono);
  const tercoAbono = r2(abono / 3);
  const linhas: LinhaDoRecibo[] = [
    { nome: "Férias", referencia: `${e.diasDeGozo} dias`, valor: ferias, tipo: "PROVENTO", memoria: `${reais(remuneracao)} ÷ 30 × ${e.diasDeGozo}` },
    { nome: "1/3 constitucional", referencia: "1/3", valor: terco, tipo: "PROVENTO", memoria: `${reais(ferias)} ÷ 3` },
  ];
  if (abono > 0) {
    linhas.push({ nome: "Abono pecuniário", referencia: `${e.diasDeAbono} dias`, valor: abono, tipo: "PROVENTO", memoria: `${reais(remuneracao)} ÷ 30 × ${e.diasDeAbono} (isento)` });
    linhas.push({ nome: "1/3 do abono", referencia: "1/3", valor: tercoAbono, tipo: "PROVENTO", memoria: `${reais(abono)} ÷ 3 (isento)` });
  }

  const tributavel = r2(ferias + terco);
  const inss = calcularInss(tributavel, e.tabelas.inss.dados);
  if (inss.valor > 0) linhas.push({ nome: "INSS sobre férias", referencia: "", valor: inss.valor, tipo: "DESCONTO", memoria: inss.memoria.join("; ") });
  const irrf = calcularIrrf({ rendimentos: tributavel, inss: inss.valor, dependentes: v.dependentesIrrf, pensao: 0 }, e.tabelas.irrf.dados);
  if (irrf.valor > 0) linhas.push({ nome: "IRRF sobre férias", referencia: pct(irrf.aliquota), valor: irrf.valor, tipo: "DESCONTO", memoria: irrf.memoria.join("; ") });

  const aliquotaFgts = v.aprendiz ? FGTS_ALIQUOTA_APRENDIZ : FGTS_ALIQUOTA;
  const fgts = r2((tributavel * aliquotaFgts) / 100);
  const proventos = r2(ferias + terco + abono + tercoAbono);
  const descontos = r2(inss.valor + irrf.valor);
  const fim = new Date(e.inicio.getTime() + (e.diasDeGozo - 1) * DIA);
  const pagamentoAte = new Date(e.inicio.getTime() - 2 * DIA);
  const alertas = ["O INSS do mês soma o salário e as férias: a competência do mês ajusta a diferença."];
  if (e.inicio.getUTCDay() === 5 || e.inicio.getUTCDay() === 6) {
    alertas.push("Férias não podem começar nos dois dias antes de feriado ou do descanso semanal (CLT art. 134, § 3º).");
  }
  return {
    ok: true,
    direito,
    fim,
    pagamentoAte,
    remuneracao,
    linhas,
    proventos,
    descontos,
    liquido: r2(proventos - descontos),
    inss,
    irrf,
    baseFgts: tributavel,
    fgts,
    memoria,
    alertas,
  };
}
