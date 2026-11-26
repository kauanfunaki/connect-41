// Diferenças retroativas (26/11/2026, funcionalidade-760).
//
// Quando a convenção (ou acordo, dissídio, lei) sai depois da data-base, os
// meses já fechados foram pagos com o salário antigo. A diferença de cada mês
// é o que foi pago nas rubricas ligadas ao salário × (salário novo ÷ salário
// pago − 1); na alteração de uma rubrica (parcela complementar), é o valor
// pago da rubrica × o percentual. O total sai na folha do mês, com FGTS e
// IRRF no mês do pagamento; o INSS é apurado mês a mês, pela tabela de cada
// mês, e no eSocial as diferenças vão no S-1200 do mês, grupo infoPerAnt, com
// o perRef de cada mês e o instrumento (tpAcConv).
//
// O salário-família retroativo segue o mesmo caminho (mês a mês, pela tabela
// de cada mês), mas é benefício: sai no mês, sem incidência, fora do infoPerAnt.
//
// Puro, sem banco.

import { r2 } from "@/lib/rescisao/constantes";
import { calcularInssComOutrasBases } from "./impostos";
import { baseDe, type ItemDoHolerite } from "./mensal";
import { salarioReajustado } from "./reajuste";
import { lerNumero } from "./entrada";

type TabelaInss = Parameters<typeof calcularInssComOutrasBases>[2];

/** Tipos de instrumento do eSocial (S-1200, ideADC/tpAcConv). */
export const INSTRUMENTOS: readonly [string, string][] = [
  ["C", "Convenção coletiva de trabalho"],
  ["A", "Acordo coletivo de trabalho"],
  ["D", "Sentença normativa (dissídio)"],
  ["B", "Legislação federal, estadual, municipal ou distrital"],
  ["G", "Antecipação de diferenças de acordo, convenção ou dissídio"],
  ["J", "Parcelas complementares conhecidas após o fechamento da folha"],
];
/** A data do instrumento é obrigatória nestes tipos (leiaute S-1.3, dtAcConv). */
export const INSTRUMENTO_COM_DATA = new Set(["A", "B", "C", "D", "E"]);

/** As rubricas que acompanham o salário: a diferença do salário reflete nelas. */
export const PAPEIS_SALARIAIS: ReadonlySet<string> = new Set(["SALARIO", "HE50", "HE100", "NOTURNO", "DSR", "PERICULOSIDADE", "FERIAS_GOZADAS", "TERCO_FERIAS", "FALTA", "DSR_FALTA", "ATRASO"]);

export type PedidoDeDiferencas =
  | { tipo: "SALARIO"; instrumento: string; dataInstrumento: string | null; descricao: string; de: string; ate: string; percentual: number; piso: number | null }
  | { tipo: "RUBRICA"; instrumento: string; dataInstrumento: string | null; descricao: string; de: string; ate: string; percentual: number; rubrica: string }
  | { tipo: "SALARIO_FAMILIA"; descricao: string; de: string; ate: string; filhos: number };

const ehMes = (v: string) => /^\d{4}-\d{2}$/.test(v);

export function lerPedidoDeDiferencas(e: {
  tipo: string;
  instrumento: string;
  dataInstrumento: string;
  descricao: string;
  de: string;
  ate: string;
  percentual: string;
  piso: string;
  rubrica: string;
  filhos: string;
}): { ok: true; pedido: PedidoDeDiferencas } | { ok: false; erro: string } {
  if (!ehMes(e.de) || !ehMes(e.ate)) return { ok: false, erro: "Informe o período: o primeiro e o último mês com diferença." };
  if (e.de > e.ate) return { ok: false, erro: "O primeiro mês do período é depois do último." };
  const descricao = e.descricao.trim().slice(0, 255);
  if (e.tipo === "SALARIO_FAMILIA") {
    const filhos = Number(e.filhos);
    if (!Number.isInteger(filhos) || filhos < 1 || filhos > 20) return { ok: false, erro: "Informe quantos filhos dão direito ao salário-família (1 a 20)." };
    return { ok: true, pedido: { tipo: "SALARIO_FAMILIA", descricao: descricao || "Salário-família retroativo", de: e.de, ate: e.ate, filhos } };
  }
  if (!INSTRUMENTOS.some(([k]) => k === e.instrumento)) return { ok: false, erro: "Escolha o instrumento (convenção, acordo, dissídio…)." };
  if (!descricao) return { ok: false, erro: "Descreva o instrumento (ex.: Convenção 2027/2028, cláusula 3ª)." };
  const dataInstrumento = /^\d{4}-\d{2}-\d{2}$/.test(e.dataInstrumento) ? e.dataInstrumento : null;
  if (INSTRUMENTO_COM_DATA.has(e.instrumento) && !dataInstrumento) return { ok: false, erro: "Informe a data de assinatura do instrumento." };
  const percentual = lerNumero(e.percentual) ?? 0;
  if (percentual < 0 || percentual > 100) return { ok: false, erro: "O percentual vai de 0 a 100." };
  if (e.tipo === "RUBRICA") {
    if (!e.rubrica) return { ok: false, erro: "Escolha a rubrica que foi paga a menor." };
    if (percentual <= 0) return { ok: false, erro: "Informe o percentual da diferença da rubrica." };
    return { ok: true, pedido: { tipo: "RUBRICA", instrumento: e.instrumento, dataInstrumento, descricao, de: e.de, ate: e.ate, percentual, rubrica: e.rubrica } };
  }
  const piso = lerNumero(e.piso);
  if (piso !== null && piso <= 0) return { ok: false, erro: "O piso tem de ser maior que zero." };
  if (percentual === 0 && piso === null) return { ok: false, erro: "Informe o percentual, o piso ou os dois." };
  return { ok: true, pedido: { tipo: "SALARIO", instrumento: e.instrumento, dataInstrumento, descricao, de: e.de, ate: e.ate, percentual, piso } };
}

/** Os meses "AAAA-MM" de `de` a `ate`. */
export function mesesDoPeriodo(de: string, ate: string): string[] {
  const meses: string[] = [];
  let [a, m] = de.split("-").map(Number);
  const [af, mf] = ate.split("-").map(Number);
  while (a < af || (a === af && m <= mf)) {
    meses.push(`${a}-${String(m).padStart(2, "0")}`);
    m++;
    if (m > 12) {
      m = 1;
      a++;
    }
  }
  return meses;
}

export type MesPago = {
  perRef: string;
  itens: readonly ItemDoHolerite[];
  /** O salário vigente no mês (histórico salarial), com o tipo do contrato para o piso do horista. */
  salario: number;
  tipoSalario: string;
  horasMensais: number;
};

export type DiferencaDoMes = { perRef: string; valor: number; inss: number; memoria: string };

const REAIS = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const reais = (v: number) => REAIS.format(v);

/** O que foi pago no mês nas rubricas ligadas ao salário (proventos − faltas e atrasos). */
export function pagoNoSalario(itens: readonly ItemDoHolerite[]): number {
  let total = 0;
  for (const i of itens) {
    if (!i.papel || !PAPEIS_SALARIAIS.has(i.papel)) continue;
    total += i.tipo === "DESCONTO" ? -i.valor : i.valor;
  }
  return r2(Math.max(0, total));
}

/** O INSS da diferença no mês: INSS da base do mês com a diferença, menos o INSS da base do mês. */
export function inssDaDiferenca(itens: readonly ItemDoHolerite[], diferenca: number, tabela: TabelaInss): number {
  const base = baseDe(itens, "incideInss");
  return r2(Math.max(0, calcularInssComOutrasBases(r2(base + diferenca), 0, tabela).valor - calcularInssComOutrasBases(base, 0, tabela).valor));
}

/** A diferença de um mês (salário ou rubrica), com o INSS pela tabela do mês. */
export function diferencaDoMes(mes: MesPago, pedido: Exclude<PedidoDeDiferencas, { tipo: "SALARIO_FAMILIA" }>, tabelaInss: TabelaInss): DiferencaDoMes | null {
  let valor = 0;
  let memoria = "";
  if (pedido.tipo === "SALARIO") {
    if (!(mes.salario > 0)) return null;
    const novo = salarioReajustado({ salarioBase: mes.salario, tipoSalario: mes.tipoSalario, horasMensais: mes.horasMensais }, pedido);
    const fator = novo / mes.salario;
    const pago = pagoNoSalario(mes.itens);
    valor = r2(pago * (fator - 1));
    memoria = `${mes.perRef}: ${reais(pago)} pagos nas rubricas do salário × (${reais(novo)} ÷ ${reais(mes.salario)} − 1) = ${reais(valor)}`;
  } else {
    const pago = r2(mes.itens.filter((i) => i.codigo === pedido.rubrica && i.tipo === "PROVENTO").reduce((s, i) => s + i.valor, 0));
    valor = r2((pago * pedido.percentual) / 100);
    memoria = `${mes.perRef}: ${reais(pago)} da rubrica ${pedido.rubrica} × ${pedido.percentual}% = ${reais(valor)}`;
  }
  if (!(valor > 0)) return null;
  const inss = inssDaDiferenca(mes.itens, valor, tabelaInss);
  return { perRef: mes.perRef, valor, inss, memoria: `${memoria}; INSS ${reais(inss)}` };
}

/** O salário-família que faltou no mês: filhos × cota, se a remuneração ficou até o limite, menos o já pago. */
export function salarioFamiliaRetroativo(mes: Pick<MesPago, "perRef" | "itens">, filhos: number, tabela: { cota: number; limite: number }): DiferencaDoMes | null {
  const base = baseDe(mes.itens, "incideInss");
  if (base > tabela.limite) return null;
  const pago = r2(mes.itens.filter((i) => i.papel === "SALARIO_FAMILIA").reduce((s, i) => s + i.valor, 0));
  const valor = r2(filhos * tabela.cota - pago);
  if (!(valor > 0)) return null;
  return { perRef: mes.perRef, valor, inss: 0, memoria: `${mes.perRef}: ${filhos} × ${reais(tabela.cota)}${pago ? ` − ${reais(pago)} já pagos` : ""} = ${reais(valor)} (remuneração ${reais(base)} até ${reais(tabela.limite)})` };
}
