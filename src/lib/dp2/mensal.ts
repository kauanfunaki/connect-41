// O cálculo da folha mensal do DP 2 (11/11/2026), uma pessoa por vez.
//
// Ordem: proventos e descontos do mês → bases → INSS → FGTS → IRRF → líquido →
// encargos da empresa → provisões. Cada linha do holerite leva a conta que a
// gerou (`memoria`), para o DP conferir sem abrir planilha.
//
// Regras escolhidas (e onde mudar se o escritório discordar):
// - Mês comercial de 30 dias; admissão ou desligamento no mês proporcionalizam.
// - Hora extra e adicional noturno sobre a hora com insalubridade e
//   periculosidade (Súm. 132 e OJ 47 SDI-1 do TST).
// - DSR sobre horas extras e adicional noturno: variáveis ÷ dias úteis × dias
//   de descanso (Súm. 172 do TST).
// - Falta e DSR da falta descontam o dia do salário contratual.
// - Vale-transporte: 6% do salário do mês (Lei 7.418/1985, art. 4º).
// - Encargos da empresa sobre a base do INSS sem teto; zero quando a
//   contribuição patronal vai no DAS (Simples, anexos I a III e V).
// - Provisão do mês: 1/12 da remuneração do mês para férias (com 1/3) e 13º,
//   mais os encargos sobre elas.
//
// Puro, sem banco.

import { r2 } from "@/lib/rescisao/constantes";
import { calcularInss, calcularIrrf, type ResultadoInss, type ResultadoIrrf } from "./impostos";
import { reais, pct, num } from "./formato";
import type { PapelDaRubrica, RubricaDoMotor } from "./rubricas";
import type { TabelasDaCompetencia } from "./tabelas";

export type Insalubridade = "NENHUM" | "MINIMO" | "MEDIO" | "MAXIMO";

export const PERCENTUAL_DA_INSALUBRIDADE: Record<Insalubridade, number> = { NENHUM: 0, MINIMO: 10, MEDIO: 20, MAXIMO: 40 };

export type VinculoDoMotor = {
  salarioBase: number;
  tipoSalario: "MENSAL" | "HORISTA";
  horasMensais: number;
  dependentesIrrf: number;
  filhosSalarioFamilia: number;
  insalubridade: Insalubridade;
  periculosidade: boolean;
  valeTransporte: boolean;
  aprendiz: boolean;
};

export type ConvencaoDoMotor = { he50: number; he100: number; noturno: number; piso: number | null; nome: string | null };

export const CONVENCAO_DA_CLT: ConvencaoDoMotor = { he50: 50, he100: 100, noturno: 20, piso: null, nome: null };

export type EmpresaDoMotor = { patronalNoDas: boolean; ratAliquota: number; fap: number; terceirosAliquota: number };

export type EventoDoMotor = { rubrica: RubricaDoMotor; quantidade: number | null; valor: number | null };

export type ItemDoHolerite = {
  codigo: string;
  nome: string;
  tipo: RubricaDoMotor["tipo"];
  papel: PapelDaRubrica | null;
  /** "30 dias", "10 h", "7,5%"… */
  referencia: string;
  valor: number;
  memoria: string;
  incideInss: boolean;
  incideFgts: boolean;
  incideIrrf: boolean;
  entraNaMedia: boolean;
};

export type Encargos = {
  base: number;
  inssEmpresa: number;
  rat: number;
  terceiros: number;
  fgts: number;
  total: number;
  memoria: string[];
};

export type Provisoes = {
  base: number;
  ferias: number;
  tercoFerias: number;
  decimo: number;
  encargosFerias: number;
  encargosDecimo: number;
  total: number;
  memoria: string[];
};

export type CalculoDaPessoa = {
  itens: ItemDoHolerite[];
  proventos: number;
  descontos: number;
  liquido: number;
  baseInss: number;
  baseFgts: number;
  inss: ResultadoInss;
  irrf: ResultadoIrrf;
  fgts: number;
  encargos: Encargos;
  provisoes: Provisoes;
  diasTrabalhados: number;
  alertas: string[];
};

export type EntradaMensal = {
  ano: number;
  mes: number;
  admissao: Date | null;
  desligamento: Date | null;
  vinculo: VinculoDoMotor;
  eventos: EventoDoMotor[];
  /** As rubricas do motor do escritório, pelo papel (o nome e o código do holerite). */
  rubricas: ReadonlyMap<PapelDaRubrica, RubricaDoMotor>;
  tabelas: TabelasDaCompetencia;
  convencao: ConvencaoDoMotor;
  empresa: EmpresaDoMotor;
  diasUteis: number;
  diasDeDescanso: number;
};

export const FGTS_ALIQUOTA = 8;
export const FGTS_ALIQUOTA_APRENDIZ = 2;
export const INSS_EMPRESA_ALIQUOTA = 20;
export const VALE_TRANSPORTE_PCT = 6;

/** Dias do mês comercial (até 30) em que a pessoa esteve contratada. */
export function diasNoMes(ano: number, mes: number, admissao: Date | null, desligamento: Date | null): number {
  const inicio = Date.UTC(ano, mes - 1, 1);
  const ultimoDia = new Date(Date.UTC(ano, mes, 0)).getUTCDate();
  const fim = Date.UTC(ano, mes - 1, ultimoDia);
  if (admissao && admissao.getTime() > fim) return 0;
  if (desligamento && desligamento.getTime() < inicio) return 0;
  const de = admissao && admissao.getTime() > inicio ? admissao.getUTCDate() : 1;
  const ate = desligamento && desligamento.getTime() < fim ? desligamento.getUTCDate() : ultimoDia;
  if (de === 1 && ate === ultimoDia) return 30;
  // Mês incompleto: os dias corridos, com o dia 31 contando só quando a
  // pessoa entrou nele (fevereiro inteiro já vale 30 acima).
  return Math.max(0, Math.min(30, ate - de + 1));
}

function rubricaDoPapel(rubricas: ReadonlyMap<PapelDaRubrica, RubricaDoMotor>, papel: PapelDaRubrica): RubricaDoMotor {
  const r = rubricas.get(papel);
  if (r) return r;
  // Sem a rubrica no escritório (não deveria: a semeadura cria todas), o motor
  // segue com um nome neutro para não perder o valor.
  return {
    codigo: "—",
    nome: papel,
    tipo: ["FALTA", "DSR_FALTA", "ATRASO", "INSS", "IRRF", "VALE_TRANSPORTE", "ADIANTAMENTO", "PENSAO", "DECIMO_ADIANTADO", "INSS_DECIMO", "IRRF_DECIMO"].includes(papel)
      ? "DESCONTO"
      : papel === "FGTS"
        ? "INFORMATIVA"
        : "PROVENTO",
    papel,
    lancamento: "VALOR",
    incideInss: false,
    incideFgts: false,
    incideIrrf: false,
    entraNaMedia: false,
  };
}

export function itemDaRubrica(r: RubricaDoMotor, valor: number, referencia: string, memoria: string): ItemDoHolerite {
  return {
    codigo: r.codigo,
    nome: r.nome,
    tipo: r.tipo,
    papel: r.papel,
    referencia,
    valor: r2(valor),
    memoria,
    incideInss: r.incideInss,
    incideFgts: r.incideFgts,
    incideIrrf: r.incideIrrf,
    entraNaMedia: r.entraNaMedia,
  };
}

/** O salário do mês cheio (no horista, a hora × as horas do mês). */
export function salarioMensalCheio(v: VinculoDoMotor): number {
  return v.tipoSalario === "HORISTA" ? r2(v.salarioBase * v.horasMensais) : v.salarioBase;
}

/** Insalubridade e periculosidade do mês cheio. */
export function adicionaisFixos(v: VinculoDoMotor, salarioMinimo: number): { insalubridade: number; periculosidade: number } {
  const insalubridade = r2((salarioMinimo * PERCENTUAL_DA_INSALUBRIDADE[v.insalubridade]) / 100);
  const periculosidade = v.periculosidade ? r2(salarioMensalCheio(v) * 0.3) : 0;
  return { insalubridade, periculosidade };
}

/** Soma por incidência: proventos somam, descontos subtraem. */
export function baseDe(itens: readonly ItemDoHolerite[], campo: "incideInss" | "incideFgts" | "incideIrrf"): number {
  let total = 0;
  for (const i of itens) {
    if (!i[campo]) continue;
    if (i.tipo === "PROVENTO") total += i.valor;
    else if (i.tipo === "DESCONTO") total -= i.valor;
  }
  return r2(Math.max(0, total));
}

export function aliquotaPatronal(empresa: EmpresaDoMotor): number {
  if (empresa.patronalNoDas) return 0;
  return INSS_EMPRESA_ALIQUOTA + empresa.ratAliquota * empresa.fap + empresa.terceirosAliquota;
}

export function calcularEncargos(base: number, fgts: number, empresa: EmpresaDoMotor): Encargos {
  const memoria: string[] = [];
  if (empresa.patronalNoDas) {
    memoria.push("Contribuição patronal no DAS (Simples): só o FGTS");
    memoria.push(`FGTS ${reais(fgts)}`);
    return { base, inssEmpresa: 0, rat: 0, terceiros: 0, fgts, total: fgts, memoria };
  }
  const inssEmpresa = r2((base * INSS_EMPRESA_ALIQUOTA) / 100);
  const rat = r2((base * empresa.ratAliquota * empresa.fap) / 100);
  const terceiros = r2((base * empresa.terceirosAliquota) / 100);
  memoria.push(`INSS da empresa: ${reais(base)} × ${pct(INSS_EMPRESA_ALIQUOTA)} = ${reais(inssEmpresa)}`);
  memoria.push(`RAT ajustado: ${reais(base)} × ${pct(empresa.ratAliquota)} × FAP ${num(empresa.fap)} = ${reais(rat)}`);
  memoria.push(`Terceiros: ${reais(base)} × ${pct(empresa.terceirosAliquota)} = ${reais(terceiros)}`);
  memoria.push(`FGTS ${reais(fgts)}`);
  return { base, inssEmpresa, rat, terceiros, fgts, total: r2(inssEmpresa + rat + terceiros + fgts), memoria };
}

export function calcularProvisoes(base: number, empresa: EmpresaDoMotor, aprendiz: boolean): Provisoes {
  const ferias = r2(base / 12);
  const tercoFerias = r2(ferias / 3);
  const decimo = r2(base / 12);
  const encargoPct = aliquotaPatronal(empresa) + (aprendiz ? FGTS_ALIQUOTA_APRENDIZ : FGTS_ALIQUOTA);
  const encargosFerias = r2(((ferias + tercoFerias) * encargoPct) / 100);
  const encargosDecimo = r2((decimo * encargoPct) / 100);
  const memoria = [
    `Férias: ${reais(base)} ÷ 12 = ${reais(ferias)}; 1/3 = ${reais(tercoFerias)}`,
    `13º: ${reais(base)} ÷ 12 = ${reais(decimo)}`,
    `Encargos sobre as provisões: ${pct(r2(encargoPct))} (patronal + FGTS)`,
  ];
  return {
    base,
    ferias,
    tercoFerias,
    decimo,
    encargosFerias,
    encargosDecimo,
    total: r2(ferias + tercoFerias + decimo + encargosFerias + encargosDecimo),
    memoria,
  };
}

export function calcularMes(e: EntradaMensal): CalculoDaPessoa {
  const v = e.vinculo;
  const R = (p: PapelDaRubrica) => rubricaDoPapel(e.rubricas, p);
  const itens: ItemDoHolerite[] = [];
  const alertas: string[] = [];
  const salarioMinimo = e.tabelas.salarioMinimo.dados.valor;

  const dias = diasNoMes(e.ano, e.mes, e.admissao, e.desligamento);
  const cheio = salarioMensalCheio(v);
  const { insalubridade, periculosidade } = adicionaisFixos(v, salarioMinimo);
  const horaNormal = v.tipoSalario === "HORISTA" ? v.salarioBase : cheio / v.horasMensais;
  const horaComAdicionais = horaNormal + (insalubridade + periculosidade) / v.horasMensais;
  const diaDoSalario = cheio / 30;

  // ── Salário e adicionais fixos ──
  const salario = (cheio * dias) / 30;
  itens.push(
    itemDaRubrica(
      R("SALARIO"),
      salario,
      `${dias} dias`,
      v.tipoSalario === "HORISTA"
        ? `${reais(v.salarioBase)}/h × ${v.horasMensais} h${dias < 30 ? ` × ${dias}/30` : ""}`
        : dias < 30
          ? `${reais(cheio)} × ${dias}/30`
          : `${reais(cheio)} (mês cheio)`
    )
  );
  if (insalubridade > 0) {
    itens.push(
      itemDaRubrica(
        R("INSALUBRIDADE"),
        (insalubridade * dias) / 30,
        pct(PERCENTUAL_DA_INSALUBRIDADE[v.insalubridade]),
        `${pct(PERCENTUAL_DA_INSALUBRIDADE[v.insalubridade])} × salário mínimo ${reais(salarioMinimo)}${dias < 30 ? ` × ${dias}/30` : ""}`
      )
    );
  }
  if (periculosidade > 0) {
    itens.push(itemDaRubrica(R("PERICULOSIDADE"), (periculosidade * dias) / 30, "30%", `30% × ${reais(cheio)}${dias < 30 ? ` × ${dias}/30` : ""}`));
  }

  // ── Eventos do mês ──
  let variaveisParaDsr = 0;
  let pensao = 0;
  const horaTxt = reais(r2(horaComAdicionais));
  for (const ev of e.eventos) {
    const r = ev.rubrica;
    const q = ev.quantidade ?? 0;
    switch (r.papel) {
      case "HE50":
      case "HE100": {
        const pctHe = r.papel === "HE50" ? e.convencao.he50 : e.convencao.he100;
        const valor = q * horaComAdicionais * (1 + pctHe / 100);
        variaveisParaDsr += r2(valor);
        itens.push(itemDaRubrica(r, valor, `${num(q)} h`, `${num(q)} h × ${horaTxt} × ${num(1 + pctHe / 100)}`));
        break;
      }
      case "NOTURNO": {
        const valor = (q * horaComAdicionais * e.convencao.noturno) / 100;
        variaveisParaDsr += r2(valor);
        itens.push(itemDaRubrica(r, valor, `${num(q)} h`, `${num(q)} h × ${horaTxt} × ${pct(e.convencao.noturno)}`));
        break;
      }
      case "FALTA":
      case "DSR_FALTA":
        itens.push(itemDaRubrica(r, q * diaDoSalario, `${num(q)} dias`, `${num(q)} × ${reais(cheio)} ÷ 30`));
        break;
      case "ATRASO":
        itens.push(itemDaRubrica(r, q * horaNormal, `${num(q)} h`, `${num(q)} h × ${reais(r2(horaNormal))}`));
        break;
      case "PENSAO":
        pensao += ev.valor ?? 0;
        itens.push(itemDaRubrica(r, ev.valor ?? 0, "", "Valor informado (deduz da base do IRRF)"));
        break;
      default:
        // Rubrica livre (ou adiantamento): o valor que o DP informou.
        if (ev.valor === null) {
          alertas.push(`${r.nome}: lançamento sem valor, ignorado.`);
          break;
        }
        itens.push(itemDaRubrica(r, ev.valor, "", "Valor informado"));
    }
  }

  if (variaveisParaDsr > 0 && e.diasUteis > 0) {
    const dsr = (variaveisParaDsr / e.diasUteis) * e.diasDeDescanso;
    itens.push(
      itemDaRubrica(R("DSR"), dsr, `${e.diasDeDescanso}/${e.diasUteis}`, `${reais(r2(variaveisParaDsr))} ÷ ${e.diasUteis} dias úteis × ${e.diasDeDescanso} domingos e feriados`)
    );
  }

  // ── Vale-transporte ──
  if (v.valeTransporte && salario > 0) {
    const vt = (salario * VALE_TRANSPORTE_PCT) / 100;
    itens.push(itemDaRubrica(R("VALE_TRANSPORTE"), vt, pct(VALE_TRANSPORTE_PCT), `${pct(VALE_TRANSPORTE_PCT)} × ${reais(r2(salario))} (limitado ao custo do benefício)`));
  }

  // ── Bases, INSS e salário-família ──
  const baseInss = baseDe(itens, "incideInss");
  const inss = calcularInss(baseInss, e.tabelas.inss.dados);
  const sf = e.tabelas.salarioFamilia.dados;
  if (v.filhosSalarioFamilia > 0 && baseInss <= sf.limite && dias > 0) {
    const valor = (v.filhosSalarioFamilia * sf.cota * dias) / 30;
    itens.push(
      itemDaRubrica(
        R("SALARIO_FAMILIA"),
        valor,
        `${v.filhosSalarioFamilia} filho(s)`,
        `${v.filhosSalarioFamilia} × ${reais(sf.cota)}${dias < 30 ? ` × ${dias}/30` : ""} (remuneração ${reais(baseInss)} até ${reais(sf.limite)})`
      )
    );
  }
  if (inss.valor > 0) itens.push(itemDaRubrica(R("INSS"), inss.valor, inss.faixas.length ? pct(r2((inss.valor / inss.baseLimitada) * 100)) : "", inss.memoria.join("; ")));

  // ── FGTS ──
  const baseFgts = baseDe(itens, "incideFgts");
  const aliquotaFgts = v.aprendiz ? FGTS_ALIQUOTA_APRENDIZ : FGTS_ALIQUOTA;
  const fgts = r2((baseFgts * aliquotaFgts) / 100);
  if (fgts > 0) itens.push(itemDaRubrica(R("FGTS"), fgts, pct(aliquotaFgts), `${reais(baseFgts)} × ${pct(aliquotaFgts)}`));

  // ── IRRF ──
  const rendimentos = baseDe(itens, "incideIrrf");
  const irrf = calcularIrrf({ rendimentos, inss: inss.valor, dependentes: v.dependentesIrrf, pensao }, e.tabelas.irrf.dados);
  if (irrf.valor > 0) itens.push(itemDaRubrica(R("IRRF"), irrf.valor, pct(irrf.aliquota), irrf.memoria.join("; ")));
  if (irrf.naoRetido) alertas.push(`IRRF de ${reais(irrf.devido)} não retido (abaixo do mínimo de ${reais(e.tabelas.irrf.dados.minimoRetencao)}).`);

  // ── Totais ──
  let proventos = 0;
  let descontos = 0;
  for (const i of itens) {
    if (i.tipo === "PROVENTO") proventos += i.valor;
    else if (i.tipo === "DESCONTO") descontos += i.valor;
  }
  proventos = r2(proventos);
  descontos = r2(descontos);
  const liquido = r2(proventos - descontos);

  // ── Conferências ──
  if (v.tipoSalario === "MENSAL" && v.horasMensais >= 220 && v.salarioBase < salarioMinimo && !v.aprendiz) {
    alertas.push(`Salário ${reais(v.salarioBase)} abaixo do mínimo de ${reais(salarioMinimo)}.`);
  }
  if (e.convencao.piso !== null && cheio < e.convencao.piso && !v.aprendiz) {
    alertas.push(`Salário ${reais(cheio)} abaixo do piso da convenção${e.convencao.nome ? ` ${e.convencao.nome}` : ""} (${reais(e.convencao.piso)}).`);
  }
  if (liquido < 0) alertas.push("Líquido negativo: os descontos passaram dos proventos.");
  if (dias < 30 && dias > 0) alertas.push(`Mês proporcional: ${dias} dias.`);
  if (e.desligamento && dias > 0) alertas.push("Desligamento no mês: as verbas rescisórias saem na tela de Rescisões.");

  const encargos = calcularEncargos(baseInss, fgts, e.empresa);
  const provisoes = calcularProvisoes(baseInss, e.empresa, v.aprendiz);

  return { itens, proventos, descontos, liquido, baseInss, baseFgts, inss, irrf, fgts, encargos, provisoes, diasTrabalhados: dias, alertas };
}
