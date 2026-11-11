// 13º salário no DP 2 (11/11/2026) — as duas parcelas, por pessoa.
//
// - Avos: um por mês do ano com 15 dias ou mais de contrato (Lei 4.090/1962).
// - Remuneração: salário do mês cheio + insalubridade e periculosidade + média
//   das variáveis do ano.
// - 1ª parcela (até 30/11): metade do 13º proporcional até o mês do pagamento;
//   sem INSS e sem IRRF, com FGTS.
// - 2ª parcela (até 20/12): o 13º do ano inteiro, com INSS próprio (tabela do
//   mês, separado do salário) e IRRF exclusivo na fonte; desconta a 1ª.
//   FGTS sobre o que se paga agora (o total menos a 1ª).
//
// Puro, sem banco.

import { r2 } from "@/lib/rescisao/constantes";
import { contarAvos } from "@/lib/rescisao/avos";
import { calcularInss, calcularIrrf, type ResultadoInss, type ResultadoIrrf } from "./impostos";
import { reais, pct } from "./formato";
import {
  adicionaisFixos,
  FGTS_ALIQUOTA,
  FGTS_ALIQUOTA_APRENDIZ,
  itemDaRubrica,
  salarioMensalCheio,
  type ItemDoHolerite,
  type VinculoDoMotor,
} from "./mensal";
import type { PapelDaRubrica, RubricaDoMotor } from "./rubricas";
import type { TabelasDaCompetencia } from "./tabelas";

export type EntradaDoDecimo = {
  parcela: 1 | 2;
  ano: number;
  /** Mês do pagamento: até ele contam os avos da 1ª parcela. */
  mesDoPagamento: number;
  admissao: Date | null;
  desligamento: Date | null;
  vinculo: VinculoDoMotor;
  mediaVariaveis: number;
  /** O que já foi pago na 1ª parcela (só na 2ª). */
  primeiraParcelaPaga: number;
  rubricas: ReadonlyMap<PapelDaRubrica, RubricaDoMotor>;
  tabelas: TabelasDaCompetencia;
};

export type CalculoDoDecimo = {
  avos: number;
  remuneracao: number;
  /** O 13º proporcional do ano (na 1ª parcela, até o mês do pagamento). */
  integral: number;
  itens: ItemDoHolerite[];
  proventos: number;
  descontos: number;
  liquido: number;
  inss: ResultadoInss | null;
  irrf: ResultadoIrrf | null;
  baseFgts: number;
  fgts: number;
  memoria: string[];
  alertas: string[];
};

/** Avos de 13º no ano, até o fim do mês dado (ou o desligamento, se antes). */
export function avosNoAno(ano: number, ateMes: number, admissao: Date | null, desligamento: Date | null): number {
  const inicioDoAno = new Date(Date.UTC(ano, 0, 1));
  const fimDoPeriodo = new Date(Date.UTC(ano, ateMes, 0));
  const inicio = admissao && admissao > inicioDoAno ? admissao : inicioDoAno;
  const fim = desligamento && desligamento < fimDoPeriodo ? desligamento : fimDoPeriodo;
  if (fim < inicio) return 0;
  return Math.min(12, contarAvos(inicio, fim));
}

function rubrica(rubricas: ReadonlyMap<PapelDaRubrica, RubricaDoMotor>, papel: PapelDaRubrica, nome: string, tipo: RubricaDoMotor["tipo"]): RubricaDoMotor {
  return (
    rubricas.get(papel) ?? {
      codigo: "—",
      nome,
      tipo,
      papel,
      lancamento: "VALOR",
      incideInss: false,
      incideFgts: false,
      incideIrrf: false,
      entraNaMedia: false,
    }
  );
}

export function calcularDecimo(e: EntradaDoDecimo): CalculoDoDecimo {
  const v = e.vinculo;
  const memoria: string[] = [];
  const alertas: string[] = [];
  const itens: ItemDoHolerite[] = [];
  const { insalubridade, periculosidade } = adicionaisFixos(v, e.tabelas.salarioMinimo.dados.valor);
  const cheio = salarioMensalCheio(v);
  const remuneracao = r2(cheio + insalubridade + periculosidade + e.mediaVariaveis);
  memoria.push(
    `Remuneração ${reais(remuneracao)} = salário ${reais(cheio)}${insalubridade ? ` + insalubridade ${reais(insalubridade)}` : ""}${periculosidade ? ` + periculosidade ${reais(periculosidade)}` : ""}${e.mediaVariaveis ? ` + média de variáveis ${reais(e.mediaVariaveis)}` : ""}`
  );
  const aliquotaFgts = v.aprendiz ? FGTS_ALIQUOTA_APRENDIZ : FGTS_ALIQUOTA;

  if (e.parcela === 1) {
    const avos = avosNoAno(e.ano, e.mesDoPagamento, e.admissao, e.desligamento);
    const integral = r2((remuneracao * avos) / 12);
    const valor = r2(integral / 2);
    memoria.push(`${avos}/12 avos até ${String(e.mesDoPagamento).padStart(2, "0")}/${e.ano}: ${reais(remuneracao)} × ${avos}/12 = ${reais(integral)}`);
    memoria.push(`1ª parcela = metade = ${reais(valor)}`);
    const r = rubrica(e.rubricas, "DECIMO_PRIMEIRA", "13º salário — 1ª parcela", "PROVENTO");
    if (valor > 0) itens.push(itemDaRubrica(r, valor, `${avos}/12`, `${reais(remuneracao)} × ${avos}/12 ÷ 2`));
    const fgts = r2((valor * aliquotaFgts) / 100);
    if (fgts > 0) itens.push(itemDaRubrica(rubrica(e.rubricas, "FGTS", "FGTS do mês", "INFORMATIVA"), fgts, pct(aliquotaFgts), `${reais(valor)} × ${pct(aliquotaFgts)}`));
    if (avos === 0) alertas.push("Sem avos de 13º até o mês do pagamento.");
    return { avos, remuneracao, integral, itens, proventos: valor, descontos: 0, liquido: valor, inss: null, irrf: null, baseFgts: valor, fgts, memoria, alertas };
  }

  const avos = avosNoAno(e.ano, 12, e.admissao, e.desligamento);
  const integral = r2((remuneracao * avos) / 12);
  memoria.push(`${avos}/12 avos no ano: ${reais(remuneracao)} × ${avos}/12 = ${reais(integral)}`);
  itens.push(itemDaRubrica(rubrica(e.rubricas, "DECIMO_SEGUNDA", "13º salário", "PROVENTO"), integral, `${avos}/12`, `${reais(remuneracao)} × ${avos}/12`));
  if (e.primeiraParcelaPaga > 0) {
    itens.push(
      itemDaRubrica(rubrica(e.rubricas, "DECIMO_ADIANTADO", "Adiantamento do 13º", "DESCONTO"), e.primeiraParcelaPaga, "", "1ª parcela já paga")
    );
  }
  const inss = calcularInss(integral, e.tabelas.inss.dados);
  if (inss.valor > 0) itens.push(itemDaRubrica(rubrica(e.rubricas, "INSS_DECIMO", "INSS sobre o 13º", "DESCONTO"), inss.valor, "", inss.memoria.join("; ")));
  const irrf = calcularIrrf({ rendimentos: integral, inss: inss.valor, dependentes: v.dependentesIrrf, pensao: 0, decimo: true }, e.tabelas.irrf.dados);
  if (irrf.valor > 0) itens.push(itemDaRubrica(rubrica(e.rubricas, "IRRF_DECIMO", "IRRF sobre o 13º", "DESCONTO"), irrf.valor, pct(irrf.aliquota), irrf.memoria.join("; ")));
  const baseFgts = r2(Math.max(0, integral - e.primeiraParcelaPaga));
  const fgts = r2((baseFgts * aliquotaFgts) / 100);
  if (fgts > 0) itens.push(itemDaRubrica(rubrica(e.rubricas, "FGTS", "FGTS do mês", "INFORMATIVA"), fgts, pct(aliquotaFgts), `(${reais(integral)} − ${reais(e.primeiraParcelaPaga)}) × ${pct(aliquotaFgts)}`));
  const descontos = r2(e.primeiraParcelaPaga + inss.valor + irrf.valor);
  const liquido = r2(integral - descontos);
  if (irrf.naoRetido) alertas.push(`IRRF de ${reais(irrf.devido)} não retido (abaixo do mínimo).`);
  if (liquido < 0) alertas.push("Líquido negativo: a 1ª parcela passou do 13º devido.");
  return { avos, remuneracao, integral, itens, proventos: integral, descontos, liquido, inss, irrf, baseFgts, fgts, memoria, alertas };
}
