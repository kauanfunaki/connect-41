// Apuração da competência (25/11/2026, funcionalidade-769, parte 2):
// "Processos › Informações" da Domínio — Retenções INSS, Compensações INSS,
// Compensações IRRF, Compensações PIS — e o PIS sobre a folha das entidades
// sem fins lucrativos. Junta o que o cálculo da folha deu com o que o DP
// informa no mês e chega ao que se recolhe:
//
// - Contribuição previdenciária (CP): segurados + patronal + RAT, menos o
//   salário-família pago, as retenções de 11% sofridas (cessão de mão de obra,
//   Lei 9.711/1998) e as compensações de INSS. As deduções não passam do
//   devido: o que sobra fica como saldo para o mês seguinte ou restituição.
// - Terceiros (outras entidades): não abatem retenção nem compensação de INSS.
// - IRRF retido, menos as compensações de IRRF.
// - PIS sobre a folha (1%), só com a opção da empresa, menos as compensações.
//
// Puro, sem banco.

import { lerNumero } from "./entrada";
import { cnpjValido } from "./esocial/documentos";
import { reais } from "./formato";

const r2 = (n: number) => Math.round(n * 100) / 100;

export const TIPOS_DE_INFORMACAO = {
  RETENCAO_INSS: { nome: "Retenção de INSS sofrida (11%, cessão de mão de obra)", curto: "Retenção de INSS" },
  COMPENSACAO_INSS: { nome: "Compensação de INSS", curto: "Compensação de INSS" },
  COMPENSACAO_IRRF: { nome: "Compensação de IRRF", curto: "Compensação de IRRF" },
  COMPENSACAO_PIS: { nome: "Compensação de PIS", curto: "Compensação de PIS" },
} as const;
export type TipoDeInformacao = keyof typeof TIPOS_DE_INFORMACAO;
export const ehTipoDeInformacao = (v: string): v is TipoDeInformacao => v in TIPOS_DE_INFORMACAO;

/** PIS sobre a folha de salários das entidades sem fins lucrativos (MP 2.158-35/2001, art. 13). */
export const PIS_SOBRE_A_FOLHA = 1;

export type InformacaoLida = { tipo: TipoDeInformacao; valor: number; documento: string | null; referencia: string | null; observacao: string | null };

/**
 * Confere uma informação do mês. Retenção pede o CNPJ do tomador e o número da
 * nota; compensação pede o período de origem (AAAA-MM).
 */
export function lerInformacao(campos: { tipo: string; valor: string; documento?: string; referencia?: string; observacao?: string }): { ok: true; info: InformacaoLida } | { ok: false; erro: string } {
  const tipo = campos.tipo.trim();
  if (!ehTipoDeInformacao(tipo)) return { ok: false, erro: "Escolha o tipo da informação." };
  const valor = lerNumero(campos.valor);
  if (valor === null || !Number.isFinite(valor) || valor <= 0) return { ok: false, erro: "Informe o valor." };
  const observacao = (campos.observacao ?? "").trim().slice(0, 300) || null;
  const referencia = (campos.referencia ?? "").trim().slice(0, 30) || null;
  if (tipo === "RETENCAO_INSS") {
    const cnpj = (campos.documento ?? "").replace(/\D/g, "");
    if (!cnpjValido(cnpj)) return { ok: false, erro: "Informe o CNPJ válido do tomador que reteve o INSS." };
    if (!referencia) return { ok: false, erro: "Informe o número da nota fiscal de serviço com a retenção." };
    return { ok: true, info: { tipo, valor: r2(valor), documento: cnpj, referencia, observacao } };
  }
  if (!referencia || !/^\d{4}-(0[1-9]|1[0-2])$/.test(referencia)) return { ok: false, erro: "Informe o período de origem do crédito (mês e ano)." };
  return { ok: true, info: { tipo, valor: r2(valor), documento: null, referencia, observacao } };
}

export type CalculoParaApurar = {
  proventos: number;
  inss: number;
  irrf: number;
  encargos: { inssEmpresa: number; rat: number; terceiros: number; aposentadoriaEspecial?: number };
  itens: readonly { papel: string | null; tipo: string; valor: number }[];
  /** Empregado (CLT): só a folha dos empregados é base do PIS — sem estagiário, sócio e autônomo. */
  empregado?: boolean;
};

export type Apuracao = {
  pessoas: number;
  segurados: number;
  patronal: number;
  rat: number;
  terceiros: number;
  salarioFamilia: number;
  /** Segurados + patronal + RAT. */
  cpDevida: number;
  retencoes: number;
  compensacoesInss: number;
  /** As deduções da CP que couberam no devido (salário-família, retenções, compensações). */
  deducoesUsadas: number;
  cpARecolher: number;
  /** O que sobrou das deduções da CP: saldo para o mês seguinte ou restituição. */
  saldoCp: number;
  /** CP a recolher + terceiros: o INSS da guia (DCTFWeb). */
  inssARecolher: number;
  irrfRetido: number;
  compensacoesIrrf: number;
  irrfARecolher: number;
  saldoIrrf: number;
  pisSobreFolha: boolean;
  basePis: number;
  pisDevido: number;
  compensacoesPis: number;
  pisARecolher: number;
  saldoPis: number;
  memoria: string[];
};

export function apurarCompetencia(e: {
  calculos: readonly CalculoParaApurar[];
  informacoes: readonly { tipo: string; valor: number }[];
  pisSobreFolha: boolean;
}): Apuracao {
  const soma = (f: (c: CalculoParaApurar) => number) => r2(e.calculos.reduce((s, c) => s + f(c), 0));
  const somaInfo = (t: TipoDeInformacao) => r2(e.informacoes.filter((i) => i.tipo === t).reduce((s, i) => s + i.valor, 0));
  const salarioFamiliaDe = (c: CalculoParaApurar) => c.itens.filter((i) => i.papel === "SALARIO_FAMILIA").reduce((s, i) => s + i.valor, 0);

  const segurados = soma((c) => c.inss);
  const patronal = soma((c) => c.encargos.inssEmpresa);
  // O adicional da aposentadoria especial (funcionalidade-763) vai com o GILRAT na DCTFWeb.
  const rat = soma((c) => c.encargos.rat + (c.encargos.aposentadoriaEspecial ?? 0));
  const terceiros = soma((c) => c.encargos.terceiros);
  const salarioFamilia = soma(salarioFamiliaDe);
  const cpDevida = r2(segurados + patronal + rat);
  const retencoes = somaInfo("RETENCAO_INSS");
  const compensacoesInss = somaInfo("COMPENSACAO_INSS");
  const deducoes = r2(salarioFamilia + retencoes + compensacoesInss);
  const deducoesUsadas = Math.min(deducoes, cpDevida);
  const cpARecolher = r2(cpDevida - deducoesUsadas);
  const saldoCp = r2(deducoes - deducoesUsadas);

  const irrfRetido = soma((c) => c.irrf);
  const compensacoesIrrf = somaInfo("COMPENSACAO_IRRF");
  const irrfARecolher = r2(Math.max(0, irrfRetido - compensacoesIrrf));
  const saldoIrrf = r2(Math.max(0, compensacoesIrrf - irrfRetido));

  // A folha de salários dos empregados: os proventos, sem o salário-família (benefício,
  // não salário); bolsa de estágio, pró-labore e RPA ficam fora.
  const basePis = e.pisSobreFolha ? soma((c) => (c.empregado === false ? 0 : c.proventos - salarioFamiliaDe(c))) : 0;
  const pisDevido = r2((basePis * PIS_SOBRE_A_FOLHA) / 100);
  const compensacoesPis = somaInfo("COMPENSACAO_PIS");
  const pisARecolher = r2(Math.max(0, pisDevido - compensacoesPis));
  const saldoPis = r2(Math.max(0, compensacoesPis - pisDevido));

  const memoria = [
    `Contribuição previdenciária: segurados ${reais(segurados)} + patronal ${reais(patronal)} + RAT ${reais(rat)} = ${reais(cpDevida)}`,
    `Deduções: salário-família ${reais(salarioFamilia)} + retenções ${reais(retencoes)} + compensações ${reais(compensacoesInss)} = ${reais(deducoes)}`,
  ];
  if (saldoCp > 0) memoria.push(`As deduções passam do devido: usa ${reais(deducoesUsadas)} e fica saldo de ${reais(saldoCp)}`);
  memoria.push(`INSS a recolher: ${reais(cpARecolher)} + terceiros ${reais(terceiros)} = ${reais(r2(cpARecolher + terceiros))} (terceiros não abatem retenção nem compensação)`);
  memoria.push(`IRRF: retido ${reais(irrfRetido)} − compensações ${reais(compensacoesIrrf)} = ${reais(irrfARecolher)}`);
  if (e.pisSobreFolha) memoria.push(`PIS sobre a folha: ${reais(basePis)} × ${PIS_SOBRE_A_FOLHA}% = ${reais(pisDevido)} − compensações ${reais(compensacoesPis)} = ${reais(pisARecolher)}`);

  return {
    pessoas: e.calculos.length,
    segurados,
    patronal,
    rat,
    terceiros,
    salarioFamilia,
    cpDevida,
    retencoes,
    compensacoesInss,
    deducoesUsadas,
    cpARecolher,
    saldoCp,
    inssARecolher: r2(cpARecolher + terceiros),
    irrfRetido,
    compensacoesIrrf,
    irrfARecolher,
    saldoIrrf,
    pisSobreFolha: e.pisSobreFolha,
    basePis,
    pisDevido,
    compensacoesPis,
    pisARecolher,
    saldoPis,
    memoria,
  };
}
