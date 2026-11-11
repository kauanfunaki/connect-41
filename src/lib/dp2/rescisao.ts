// Rescisão no DP 2 (11/11/2026): as verbas vêm do cálculo de rescisão que já
// existe no Connect (`src/lib/rescisao/calculo.ts`, o da conferência do TRCT);
// o DP 2 soma o que lá ficou de fora — INSS, IRRF e FGTS — com as tabelas do
// DP 2.
//
// Incidências (as exceções que tornavam a rescisão difícil):
// - Saldo de salário: INSS, IRRF e FGTS, como um mês comum.
// - 13º proporcional: INSS e IRRF próprios (tributação exclusiva), FGTS.
// - Aviso prévio indenizado: só FGTS (sem INSS, Lei 8.212 art. 28 § 9º e
//   jurisprudência do STJ; sem IRRF por ser indenização).
// - Férias vencidas e proporcionais indenizadas, com 1/3: sem INSS, IRRF e
//   FGTS (Súm. 386 do STJ).
// - Desconto do aviso não cumprido (pedido de demissão): só desconta.
//
// Puro, sem banco.

import { r2 } from "@/lib/rescisao/constantes";
import { calcularRescisao, type PeriodoFerias, type VerbaCalculada } from "@/lib/rescisao/calculo";
import { CONFIG_PADRAO } from "@/lib/rescisao/config";
import type { MotivoCanonico } from "@/lib/rescisao/motivos";
import { calcularInss, calcularIrrf, type ResultadoInss, type ResultadoIrrf } from "./impostos";
import { reais, pct } from "./formato";
import { FGTS_ALIQUOTA, FGTS_ALIQUOTA_APRENDIZ, salarioMensalCheio, type VinculoDoMotor } from "./mensal";
import type { TabelasDaCompetencia } from "./tabelas";

export type EntradaDaRescisao = {
  motivo: MotivoCanonico;
  admissao: Date;
  desligamento: Date;
  avisoIndenizado: boolean;
  avisoDispensado: boolean;
  vinculo: VinculoDoMotor;
  mediaVariaveis: number;
  /** Quantos períodos aquisitivos completos estão vencidos e não gozados. */
  periodosVencidos: number;
  faltas: number;
  saldoFgts: number | null;
  decimoAdiantado: number;
  tabelas: TabelasDaCompetencia;
};

export type LinhaDaRescisao = {
  chave: string;
  nome: string;
  tipo: "PROVENTO" | "DESCONTO" | "INFORMATIVA";
  valor: number;
  memoria: string;
  /** Por que não entrou, quando não entrou. */
  motivo: string | null;
};

export type CalculoDaRescisao = {
  linhas: LinhaDaRescisao[];
  proventos: number;
  descontos: number;
  liquido: number;
  inssMes: ResultadoInss;
  irrfMes: ResultadoIrrf;
  inssDecimo: ResultadoInss;
  irrfDecimo: ResultadoIrrf;
  baseFgts: number;
  fgts: number;
  multaFgts: number | null;
  faltando: string[];
  alertas: string[];
};

const NOMES: Record<string, string> = {
  saldo_salario: "Saldo de salário",
  aviso_previo: "Aviso prévio indenizado",
  decimo_terceiro: "13º salário proporcional",
  ferias_vencidas: "Férias vencidas indenizadas",
  ferias_proporcionais: "Férias proporcionais indenizadas",
  terco_constitucional: "1/3 sobre férias indenizadas",
};

const DIA = 24 * 60 * 60 * 1000;

/** O período aquisitivo em curso: o último aniversário da admissão até o desligamento. */
export function inicioDoPeriodoAtual(admissao: Date, desligamento: Date): Date {
  let ano = desligamento.getUTCFullYear();
  let inicio = new Date(Date.UTC(ano, admissao.getUTCMonth(), admissao.getUTCDate()));
  if (inicio > desligamento) {
    ano -= 1;
    inicio = new Date(Date.UTC(ano, admissao.getUTCMonth(), admissao.getUTCDate()));
  }
  return inicio < admissao ? admissao : inicio;
}

/** Os períodos vencidos, contados para trás a partir do período em curso. */
export function periodosVencidosAte(inicioAtual: Date, quantos: number): PeriodoFerias[] {
  const periodos: PeriodoFerias[] = [];
  for (let i = quantos; i >= 1; i--) {
    const inicio = new Date(Date.UTC(inicioAtual.getUTCFullYear() - i, inicioAtual.getUTCMonth(), inicioAtual.getUTCDate()));
    const fim = new Date(Date.UTC(inicioAtual.getUTCFullYear() - i + 1, inicioAtual.getUTCMonth(), inicioAtual.getUTCDate()) - DIA);
    periodos.push({ inicio, fim });
  }
  return periodos;
}

function valorDe(v: VerbaCalculada | undefined): number {
  return v && v.situacao === "CALCULADO" && v.valor !== null ? v.valor : 0;
}

export function calcularRescisaoDoDp2(e: EntradaDaRescisao): CalculoDaRescisao {
  const v = e.vinculo;
  const inicioAtual = inicioDoPeriodoAtual(e.admissao, e.desligamento);
  const base = calcularRescisao(
    {
      motivo: e.motivo,
      admissao: e.admissao,
      desligamento: e.desligamento,
      avisoIndenizado: e.avisoIndenizado,
      avisoDispensado: e.avisoDispensado,
      salarioBase: salarioMensalCheio(v),
      feriasVencidas: periodosVencidosAte(inicioAtual, Math.max(0, Math.min(2, e.periodosVencidos))),
      inicioPeriodoAquisitivoAtual: inicioAtual,
      faltasInjustificadas: e.faltas,
      mediaVariaveis: e.mediaVariaveis,
      saldoFgtsInformado: e.saldoFgts,
      // O adiantamento sai como desconto aqui: o INSS e o IRRF do 13º são
      // sobre o 13º inteiro, não sobre o que sobra dele.
      decimoTerceiroAdiantado: 0,
      aprendiz: v.aprendiz,
    },
    {
      ...CONFIG_PADRAO,
      insalubridadeGrau: v.insalubridade,
      periculosidadeAplica: v.periculosidade,
    }
  );

  const linhas: LinhaDaRescisao[] = [];
  for (const chave of Object.keys(NOMES)) {
    const verba = base.verbas[chave];
    if (!verba) continue;
    const valor = valorDe(verba);
    const desconto = chave === "aviso_previo" && valor < 0;
    linhas.push({
      chave,
      nome: desconto ? "Desconto do aviso prévio não cumprido" : NOMES[chave],
      tipo: desconto ? "DESCONTO" : "PROVENTO",
      valor: Math.abs(valor),
      memoria: verba.formula ?? "",
      motivo: verba.situacao === "CALCULADO" ? null : verba.motivo,
    });
  }

  const saldo = valorDe(base.verbas.saldo_salario);
  const decimo = valorDe(base.verbas.decimo_terceiro);
  const aviso = Math.max(0, valorDe(base.verbas.aviso_previo));

  const inssMes = calcularInss(saldo, e.tabelas.inss.dados);
  const irrfMes = calcularIrrf({ rendimentos: saldo, inss: inssMes.valor, dependentes: v.dependentesIrrf, pensao: 0 }, e.tabelas.irrf.dados);
  const inssDecimo = calcularInss(decimo, e.tabelas.inss.dados);
  const irrfDecimo = calcularIrrf({ rendimentos: decimo, inss: inssDecimo.valor, dependentes: v.dependentesIrrf, pensao: 0, decimo: true }, e.tabelas.irrf.dados);

  const descontosCalculados: [string, string, number, string][] = [
    ["inss_mes", "INSS sobre o saldo de salário", inssMes.valor, inssMes.memoria.join("; ")],
    ["irrf_mes", "IRRF sobre o saldo de salário", irrfMes.valor, irrfMes.memoria.join("; ")],
    ["inss_decimo", "INSS sobre o 13º", inssDecimo.valor, inssDecimo.memoria.join("; ")],
    ["irrf_decimo", "IRRF sobre o 13º", irrfDecimo.valor, irrfDecimo.memoria.join("; ")],
  ];
  for (const [chave, nome, valor, memoria] of descontosCalculados) {
    if (valor > 0) linhas.push({ chave, nome, tipo: "DESCONTO", valor, memoria, motivo: null });
  }
  if (e.decimoAdiantado > 0 && decimo > 0) {
    linhas.push({ chave: "decimo_adiantado", nome: "Adiantamento do 13º", tipo: "DESCONTO", valor: r2(e.decimoAdiantado), memoria: "Já pago na 1ª parcela", motivo: null });
  }

  const aliquotaFgts = v.aprendiz ? FGTS_ALIQUOTA_APRENDIZ : FGTS_ALIQUOTA;
  const baseFgts = r2(saldo + decimo + aviso);
  const fgts = r2((baseFgts * aliquotaFgts) / 100);
  linhas.push({
    chave: "fgts",
    nome: "FGTS da rescisão (guia)",
    tipo: "INFORMATIVA",
    valor: fgts,
    memoria: `(saldo ${reais(saldo)} + 13º ${reais(decimo)} + aviso ${reais(aviso)}) × ${pct(aliquotaFgts)}`,
    motivo: null,
  });
  const multa = base.verbas.fgts_multa;
  const multaFgts = multa && multa.situacao === "CALCULADO" ? multa.valor : null;
  if (multa) {
    linhas.push({ chave: "fgts_multa", nome: "Multa do FGTS (guia)", tipo: "INFORMATIVA", valor: multaFgts ?? 0, memoria: multa.formula ?? "", motivo: multa.situacao === "CALCULADO" ? null : multa.motivo });
  }

  let proventos = 0;
  let descontos = 0;
  for (const l of linhas) {
    if (l.tipo === "PROVENTO") proventos += l.valor;
    else if (l.tipo === "DESCONTO") descontos += l.valor;
  }
  proventos = r2(proventos);
  descontos = r2(descontos);
  const alertas: string[] = [];
  if (irrfMes.naoRetido || irrfDecimo.naoRetido) alertas.push("Há IRRF abaixo do mínimo de retenção, não descontado.");
  return {
    linhas,
    proventos,
    descontos,
    liquido: r2(proventos - descontos),
    inssMes,
    irrfMes,
    inssDecimo,
    irrfDecimo,
    baseFgts,
    fgts,
    multaFgts,
    faltando: base.inputsFaltantes,
    alertas,
  };
}
