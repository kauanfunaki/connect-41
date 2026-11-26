// INSS do empregado e IRRF do DP 2 (11/11/2026), com a memória de cada passo.
//
// O INSS é progressivo por faixa desde a EC 103/2019: cada pedaço do salário
// paga a alíquota da sua faixa, e o que passa do teto não paga. A soma dos
// pedaços arredonda uma vez, no fim.
//
// O IRRF compara as deduções legais (INSS, dependentes, pensão) com o desconto
// simplificado e fica com a que der menos imposto — a regra da Receita desde
// maio/2023. A partir de 2026 entra a redução da Lei 15.270/2025.
//
// Puro, sem banco.

import { r2 } from "@/lib/rescisao/constantes";
import { reais, pct, fator } from "./formato";
import type { TabelaInss, TabelaIrrf } from "./tabelas";

export type FaixaAplicada = { de: number; ate: number; aliquota: number; base: number; valor: number };

export type ResultadoInss = {
  base: number;
  /** A base depois do teto. */
  baseLimitada: number;
  teto: number;
  valor: number;
  faixas: FaixaAplicada[];
  memoria: string[];
  /** Mais de um vínculo (funcionalidade-769): o indMV do S-1200 e a soma das outras bases. */
  indMV?: IndicadorDeMultiplosVinculos | null;
  outrasBases?: number;
};

export function calcularInss(base: number, tabela: TabelaInss): ResultadoInss {
  const teto = tabela.faixas[tabela.faixas.length - 1].ate;
  const baseLimitada = Math.max(0, Math.min(base, teto));
  const faixas: FaixaAplicada[] = [];
  let anterior = 0;
  let soma = 0;
  for (const f of tabela.faixas) {
    if (baseLimitada <= anterior) break;
    const pedaco = Math.min(baseLimitada, f.ate) - anterior;
    const valor = (pedaco * f.aliquota) / 100;
    faixas.push({ de: anterior, ate: f.ate, aliquota: f.aliquota, base: r2(pedaco), valor: r2(valor) });
    soma += valor;
    anterior = f.ate;
  }
  const valor = r2(soma);
  const memoria = faixas.map((f) => `${reais(f.base)} × ${pct(f.aliquota)} = ${reais(f.valor)} (faixa até ${reais(f.ate)})`);
  if (base > teto) memoria.unshift(`Base ${reais(base)} acima do teto: limitada a ${reais(teto)}`);
  memoria.push(`INSS = ${reais(valor)}`);
  return { base: r2(base), baseLimitada: r2(baseLimitada), teto, valor, faixas, memoria };
}

/** O indicador do eSocial (S-1200, infoMV/indMV) de quem tem mais de um vínculo. */
export type IndicadorDeMultiplosVinculos = 1 | 2 | 3;

/**
 * INSS do segurado com outras bases (25/11/2026, funcionalidade-769): o
 * colaborador tem remuneração em outra(s) empresa(s) no mês. Pela Nota
 * Orientativa eSocial 2019.20 (tabela progressiva), o desconto daqui é o INSS
 * da faixa que esta remuneração ocupa depois das outras — o INSS do total
 * (até o teto) menos o INSS das outras bases:
 * - indMV 1: total até o teto — desconto sobre toda a remuneração daqui;
 * - indMV 2: total passa do teto — base daqui = teto − outras bases;
 * - indMV 3: as outras bases já chegam ao teto — sem desconto aqui.
 * Sem outras bases, é o `calcularInss` de sempre.
 */
export function calcularInssComOutrasBases(base: number, outrasBases: number, tabela: TabelaInss): ResultadoInss {
  const outras = r2(Math.max(0, outrasBases));
  if (outras <= 0) return { ...calcularInss(base, tabela), indMV: null, outrasBases: 0 };
  const teto = tabela.faixas[tabela.faixas.length - 1].ate;
  const piso = Math.min(outras, teto);
  const topo = Math.max(piso, Math.min(r2(outras + Math.max(0, base)), teto));
  const indMV: IndicadorDeMultiplosVinculos = outras >= teto ? 3 : outras + base > teto ? 2 : 1;
  const faixas: FaixaAplicada[] = [];
  let anterior = 0;
  let soma = 0;
  for (const f of tabela.faixas) {
    const de = Math.max(anterior, piso);
    const ate = Math.min(f.ate, topo);
    if (ate > de) {
      const valor = ((ate - de) * f.aliquota) / 100;
      faixas.push({ de: r2(de), ate: f.ate, aliquota: f.aliquota, base: r2(ate - de), valor: r2(valor) });
      soma += valor;
    }
    anterior = f.ate;
  }
  const valor = r2(soma);
  const memoria = [`Outras empresas no mês: ${reais(outras)} (mais de um vínculo)`];
  if (indMV === 3) memoria.push(`As outras bases já chegam ao teto de ${reais(teto)}: sem desconto aqui (indMV 3)`);
  else {
    if (indMV === 2) memoria.push(`Total ${reais(outras + base)} acima do teto: base daqui limitada a ${reais(teto)} − ${reais(outras)} = ${reais(topo - piso)} (indMV 2)`);
    else memoria.push(`Faixas a partir de ${reais(outras)}, a remuneração das outras empresas (indMV 1)`);
    memoria.push(...faixas.map((f) => `${reais(f.base)} × ${pct(f.aliquota)} = ${reais(f.valor)} (faixa até ${reais(f.ate)})`));
  }
  memoria.push(`INSS = ${reais(valor)}`);
  return { base: r2(base), baseLimitada: r2(topo - piso), teto, valor, faixas, memoria, indMV, outrasBases: outras };
}

export type EntradaIrrf = {
  /** Rendimentos tributáveis do mês (proventos menos descontos com incidência). */
  rendimentos: number;
  inss: number;
  dependentes: number;
  pensao: number;
  /** Contribuição do empregado à previdência complementar (funcionalidade-762): dedução legal. */
  previdenciaComplementar?: number;
  /** 13º: tributação exclusiva — a redução da Lei 15.270 só entra se a tabela disser. */
  decimo?: boolean;
};

export type ResultadoIrrf = {
  rendimentos: number;
  /** "LEGAL" (INSS + dependentes + pensão) ou "SIMPLIFICADO". */
  deducaoUsada: "LEGAL" | "SIMPLIFICADO";
  deducao: number;
  base: number;
  aliquota: number;
  parcelaADeduzir: number;
  impostoDaTabela: number;
  reducao: number;
  /** O devido, antes do mínimo de retenção. */
  devido: number;
  /** O que se desconta no holerite (zero quando o devido não chega ao mínimo). */
  valor: number;
  naoRetido: boolean;
  memoria: string[];
};

function impostoPelaTabela(base: number, tabela: TabelaIrrf) {
  const faixa = tabela.faixas.find((f) => f.ate === null || base <= f.ate) ?? tabela.faixas[tabela.faixas.length - 1];
  const imposto = Math.max(0, r2((base * faixa.aliquota) / 100 - faixa.deducao));
  return { faixa, imposto };
}

export function calcularIrrf(e: EntradaIrrf, tabela: TabelaIrrf): ResultadoIrrf {
  const rendimentos = r2(Math.max(0, e.rendimentos));
  // A previdência complementar do empregado é dedução legal (Lei 9.250/1995, art. 4º, V; funcionalidade-762).
  const previdencia = r2(Math.max(0, e.previdenciaComplementar ?? 0));
  const legal = r2(e.inss + e.dependentes * tabela.deducaoDependente + e.pensao + previdencia);
  const simplificado = tabela.descontoSimplificado;
  const usaSimplificado = simplificado > legal;
  const deducao = usaSimplificado ? simplificado : legal;
  const base = r2(Math.max(0, rendimentos - deducao));
  const { faixa, imposto } = impostoPelaTabela(base, tabela);

  const memoria: string[] = [`Rendimentos tributáveis ${reais(rendimentos)}`];
  memoria.push(
    `Deduções legais ${reais(legal)} (INSS ${reais(e.inss)} + ${e.dependentes} dependente(s) × ${reais(tabela.deducaoDependente)}${e.pensao > 0 ? ` + pensão ${reais(e.pensao)}` : ""}${previdencia > 0 ? ` + previdência complementar ${reais(previdencia)}` : ""}) × desconto simplificado ${reais(simplificado)}: usa ${usaSimplificado ? "o simplificado" : "as legais"}`
  );
  memoria.push(`Base ${reais(rendimentos)} − ${reais(deducao)} = ${reais(base)}`);
  memoria.push(
    faixa.aliquota === 0
      ? `Faixa isenta (até ${reais(faixa.ate ?? 0)})`
      : `${reais(base)} × ${pct(faixa.aliquota)} − ${reais(faixa.deducao)} = ${reais(imposto)}`
  );

  let reducao = 0;
  const r = tabela.reducao;
  if (r && imposto > 0 && (!e.decimo || r.noDecimo)) {
    if (rendimentos <= r.isentoAte) reducao = Math.min(imposto, r.reducaoMaxima);
    else if (rendimentos <= r.ate) reducao = Math.min(imposto, Math.max(0, r2(r.constante - r.fator * rendimentos)));
    if (reducao > 0) {
      memoria.push(
        rendimentos <= r.isentoAte
          ? `Redução da Lei 15.270 (rendimentos até ${reais(r.isentoAte)}): − ${reais(reducao)}`
          : `Redução da Lei 15.270: ${reais(r.constante)} − ${fator(r.fator)} × ${reais(rendimentos)} = − ${reais(reducao)}`
      );
    }
  } else if (r && e.decimo && !r.noDecimo && imposto > 0) {
    memoria.push("Redução da Lei 15.270 não aplicada ao 13º (tabela do escritório diz que não vale para o 13º)");
  }
  const devido = r2(imposto - reducao);
  const naoRetido = devido > 0 && devido < tabela.minimoRetencao;
  const valor = naoRetido ? 0 : devido;
  if (naoRetido) memoria.push(`Devido ${reais(devido)} abaixo de ${reais(tabela.minimoRetencao)}: não é retido`);
  memoria.push(`IRRF = ${reais(valor)}`);

  return {
    rendimentos,
    deducaoUsada: usaSimplificado ? "SIMPLIFICADO" : "LEGAL",
    deducao,
    base,
    aliquota: faixa.aliquota,
    parcelaADeduzir: faixa.deducao,
    impostoDaTabela: imposto,
    reducao: r2(reducao),
    devido,
    valor,
    naoRetido,
    memoria,
  };
}
