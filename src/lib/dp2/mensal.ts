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
import { calcularInssComOutrasBases, calcularIrrf, type ResultadoInss, type ResultadoIrrf } from "./impostos";
import type { FeriasNoMes } from "./periodosDeFerias";
import { reais, pct, num } from "./formato";
import type { PapelDaRubrica, RubricaDoMotor } from "./rubricas";
import type { TabelasDaCompetencia } from "./tabelas";
import { MARCA_DA_FIXA } from "./rubricasFixas";
import { ehDomestico } from "./categorias";
import { diasPeloInss, type AfastamentoNoMes } from "./afastamentos";

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
  /** Contribuição mensal do empregado à previdência complementar (funcionalidade-762). */
  previdenciaComplementar?: number | null;
  /** Autorizou o desconto da contribuição sindical (funcionalidade-774). */
  contribuicaoSindical?: boolean;
  valeTransporte: boolean;
  /** Custo diário do vale-transporte (funcionalidade-753); sem ele, o desconto é 6% sem limite. */
  vtCustoDiario?: number | null;
  aprendiz: boolean;
  /** Categoria do eSocial (Tabela 1); sem ela, empregado (101). Ver categorias.ts. */
  categoria?: string;
};

export type ConvencaoDoMotor = {
  he50: number;
  he100: number;
  noturno: number;
  piso: number | null;
  nome: string | null;
  /** Mês do desconto da contribuição sindical (nulo = março) e o percentual (nulo = um dia), funcionalidade-774. */
  contribuicaoMes?: number | null;
  contribuicaoPercentual?: number | null;
};

export const CONVENCAO_DA_CLT: ConvencaoDoMotor = { he50: 50, he100: 100, noturno: 20, piso: null, nome: null };

export type EmpresaDoMotor = { patronalNoDas: boolean; ratAliquota: number; fap: number; terceirosAliquota: number };

/** `origem` "FIXA" = rubrica fixa do contrato (19/11/2026, funcionalidade-767): só muda a memória do holerite. */
export type EventoDoMotor = { rubrica: RubricaDoMotor; quantidade: number | null; valor: number | null; origem?: "FIXA" };

/**
 * Linha que veio de rubrica fixa (23/11/2026): a memória termina dizendo isso,
 * em qualquer rubrica — também nas de horas, como uma hora extra fixa.
 */
export function marcarFixa(itens: ItemDoHolerite[], antes: number, ev: EventoDoMotor): void {
  if (ev.origem !== "FIXA" || itens.length <= antes) return;
  const ultimo = itens[itens.length - 1];
  itens[itens.length - 1] = { ...ultimo, memoria: `${ultimo.memoria} · ${MARCA_DA_FIXA}` };
}

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
  mediaFerias: boolean;
  mediaDecimo: boolean;
  mediaRescisao: boolean;
};

export type Encargos = {
  base: number;
  /** Doméstico (LC 150/2015, art. 34): a indenização compensatória de 3,2% (o FGTS da multa, depositado todo mês). */
  indenizacaoCompensatoria?: number;
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
  /**
   * Férias gravadas que caem no mês (funcionalidade-745): o salário paga só os
   * dias fora delas, e as férias entram para o INSS e o FGTS do mês.
   */
  ferias?: readonly FeriasNoMes[];
  /**
   * Remuneração do colaborador em outra(s) empresa(s) no mês (funcionalidade-769):
   * o INSS daqui ocupa as faixas depois dela e respeita o teto somando as bases.
   */
  outrasBasesInss?: number;
  /** Dias de suspensão disciplinar no mês (funcionalidade-763): saem do salário. */
  diasDeSuspensao?: number;
  /**
   * Afastamentos (S-2230) que caem no mês (funcionalidade-749): os dias pagos
   * pelo INSS saem do salário; os avisos vão para os alertas.
   */
  afastamentos?: readonly AfastamentoNoMes[];
};

export const FGTS_ALIQUOTA = 8;
export const FGTS_ALIQUOTA_APRENDIZ = 2;
export const INSS_EMPRESA_ALIQUOTA = 20;
export const VALE_TRANSPORTE_PCT = 6;

/**
 * O desconto do vale-transporte (funcionalidade-753): 6% do salário do mês,
 * limitado ao custo do benefício — o custo diário × os dias úteis em que a
 * pessoa trabalhou (os dias úteis do mês na proporção dos dias de salário).
 * Sem o custo diário no contrato, fica nos 6%.
 */
export function descontoDoValeTransporte(salario: number, custoDiario: number | null, diasUteis: number, diasDeSalario: number) {
  const seis = r2((salario * VALE_TRANSPORTE_PCT) / 100);
  if (!custoDiario || custoDiario <= 0) return { valor: seis, limitado: false, diasUteis, custo: null as number | null, memoria: `${pct(VALE_TRANSPORTE_PCT)} × ${reais(r2(salario))} (sem o custo diário no contrato, não limitado ao custo)` };
  const dias = Math.round((diasUteis * Math.min(30, diasDeSalario)) / 30);
  const custo = r2(custoDiario * dias);
  if (custo < seis) return { valor: custo, limitado: true, diasUteis: dias, custo, memoria: `Custo do benefício ${reais(custoDiario)} × ${dias} dias úteis = ${reais(custo)}, menor que ${pct(VALE_TRANSPORTE_PCT)} × ${reais(r2(salario))} = ${reais(seis)}` };
  return { valor: seis, limitado: false, diasUteis: dias, custo, memoria: `${pct(VALE_TRANSPORTE_PCT)} × ${reais(r2(salario))} (custo do benefício: ${reais(custoDiario)} × ${dias} dias úteis = ${reais(custo)})` };
}

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

export function rubricaDoPapel(rubricas: ReadonlyMap<PapelDaRubrica, RubricaDoMotor>, papel: PapelDaRubrica): RubricaDoMotor {
  const r = rubricas.get(papel);
  if (r) return r;
  // Sem a rubrica no escritório (não deveria: a semeadura cria todas), o motor
  // segue com um nome neutro para não perder o valor.
  return {
    codigo: "—",
    nome: papel,
    tipo: ["FALTA", "DSR_FALTA", "ATRASO", "INSS", "IRRF", "VALE_TRANSPORTE", "ADIANTAMENTO", "PENSAO", "DECIMO_ADIANTADO", "INSS_DECIMO", "IRRF_DECIMO", "FERIAS_LIQUIDO_PAGO", "IRRF_FERIAS"].includes(papel)
      ? "DESCONTO"
      : papel === "FGTS"
        ? "INFORMATIVA"
        : "PROVENTO",
    papel,
    lancamento: "VALOR",
    incideInss: false,
    incideFgts: false,
    incideIrrf: false,
    mediaFerias: false,
    mediaDecimo: false,
    mediaRescisao: false,
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
    mediaFerias: r.mediaFerias,
    mediaDecimo: r.mediaDecimo,
    mediaRescisao: r.mediaRescisao,
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

/**
 * Os encargos do empregador doméstico (LC 150/2015, art. 34; 26/11/2026,
 * funcionalidade-777): INSS patronal 8%, GILRAT 0,8%, o FGTS de 8% e a
 * indenização compensatória de 3,2%, tudo no DAE do Simples Doméstico. Sem
 * terceiros e sem FAP.
 */
export const DOMESTICO = { inssPatronal: 8, gilrat: 0.8, indenizacaoCompensatoria: 3.2 } as const;

export function encargosDoDomestico(base: number, fgts: number): Encargos {
  const inssEmpresa = r2((base * DOMESTICO.inssPatronal) / 100);
  const rat = r2((base * DOMESTICO.gilrat) / 100);
  const indenizacaoCompensatoria = r2((base * DOMESTICO.indenizacaoCompensatoria) / 100);
  return {
    base,
    inssEmpresa,
    rat,
    terceiros: 0,
    fgts,
    indenizacaoCompensatoria,
    total: r2(inssEmpresa + rat + fgts + indenizacaoCompensatoria),
    memoria: [
      `Empregador doméstico (LC 150/2015, art. 34), tudo no DAE`,
      `INSS patronal: ${reais(base)} × ${pct(DOMESTICO.inssPatronal)} = ${reais(inssEmpresa)}`,
      `GILRAT: ${reais(base)} × ${pct(DOMESTICO.gilrat)} = ${reais(rat)}`,
      `Indenização compensatória: ${reais(base)} × ${pct(DOMESTICO.indenizacaoCompensatoria)} = ${reais(indenizacaoCompensatoria)}`,
      `FGTS ${reais(fgts)}`,
    ],
  };
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

export function calcularProvisoes(base: number, empresa: EmpresaDoMotor, aprendiz: boolean, domestico = false): Provisoes {
  const ferias = r2(base / 12);
  const tercoFerias = r2(ferias / 3);
  const decimo = r2(base / 12);
  const encargoPct = domestico
    ? DOMESTICO.inssPatronal + DOMESTICO.gilrat + DOMESTICO.indenizacaoCompensatoria + FGTS_ALIQUOTA
    : aliquotaPatronal(empresa) + (aprendiz ? FGTS_ALIQUOTA_APRENDIZ : FGTS_ALIQUOTA);
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
  // Férias no mês (funcionalidade-745): o salário e os adicionais pagam só os dias fora delas.
  const feriasDoMes = e.ferias ?? [];
  const diasDeFerias = Math.min(dias, feriasDoMes.reduce((s, f) => s + f.diasDeFerias, 0));
  // Afastamento (funcionalidade-749): do 16º dia em diante o INSS paga, e esses dias saem do salário.
  const afastamentosDoMes = e.afastamentos ?? [];
  const diasDeAfastamento = Math.min(dias - diasDeFerias, diasPeloInss(afastamentosDoMes));
  for (const a of afastamentosDoMes) if (a.alerta) alertas.push(a.alerta);
  // Suspensão disciplinar (funcionalidade-763): os dias não são remunerados.
  const diasSuspenso = Math.min(dias - diasDeFerias - diasDeAfastamento, Math.max(0, e.diasDeSuspensao ?? 0));
  const diasDeSalario = dias - diasDeFerias - diasDeAfastamento - diasSuspenso;
  const cheio = salarioMensalCheio(v);
  const { insalubridade, periculosidade } = adicionaisFixos(v, salarioMinimo);
  const horaNormal = v.tipoSalario === "HORISTA" ? v.salarioBase : cheio / v.horasMensais;
  const horaComAdicionais = horaNormal + (insalubridade + periculosidade) / v.horasMensais;
  const diaDoSalario = cheio / 30;

  // ── Salário e adicionais fixos ──
  const salario = (cheio * diasDeSalario) / 30;
  const deFerias =
    (diasDeFerias > 0 ? ` (${diasDeFerias} dia(s) de férias)` : "") +
    (diasDeAfastamento > 0 ? ` (${diasDeAfastamento} dia(s) de afastamento pagos pelo INSS)` : "") +
    (diasSuspenso > 0 ? ` (${diasSuspenso} dia(s) de suspensão)` : "");
  itens.push(
    itemDaRubrica(
      R("SALARIO"),
      salario,
      `${diasDeSalario} dias`,
      v.tipoSalario === "HORISTA"
        ? `${reais(v.salarioBase)}/h × ${v.horasMensais} h${diasDeSalario < 30 ? ` × ${diasDeSalario}/30` : ""}${deFerias}`
        : diasDeSalario < 30
          ? `${reais(cheio)} × ${diasDeSalario}/30${deFerias}`
          : `${reais(cheio)} (mês cheio)`
    )
  );
  if (insalubridade > 0) {
    itens.push(
      itemDaRubrica(
        R("INSALUBRIDADE"),
        (insalubridade * diasDeSalario) / 30,
        pct(PERCENTUAL_DA_INSALUBRIDADE[v.insalubridade]),
        `${pct(PERCENTUAL_DA_INSALUBRIDADE[v.insalubridade])} × salário mínimo ${reais(salarioMinimo)}${diasDeSalario < 30 ? ` × ${diasDeSalario}/30` : ""}`
      )
    );
  }
  if (periculosidade > 0) {
    itens.push(itemDaRubrica(R("PERICULOSIDADE"), (periculosidade * diasDeSalario) / 30, "30%", `30% × ${reais(cheio)}${diasDeSalario < 30 ? ` × ${diasDeSalario}/30` : ""}`));
  }

  // ── Férias do mês (funcionalidade-745) ──
  // Pagas antes, no recibo; aqui entram para o INSS e o FGTS do mês (o IRRF das
  // férias é separado), e o que o recibo já pagou sai como desconto.
  const comIncidencia = (i: ItemDoHolerite, inss: boolean): ItemDoHolerite => ({ ...i, incideInss: inss, incideFgts: inss, incideIrrf: false });
  let inssDasFerias = 0;
  let baseDasFerias = 0;
  for (const f of feriasDoMes) {
    const ref = `${f.diasCorridos} dias`;
    itens.push(comIncidencia(itemDaRubrica(R("FERIAS_GOZADAS"), f.ferias, ref, `Férias de ${f.periodo}: parte deste mês (${f.diasCorridos} dias corridos)`), true));
    itens.push(comIncidencia(itemDaRubrica(R("TERCO_FERIAS"), f.terco, "1/3", `1/3 das férias deste mês`), true));
    if (f.abono > 0) itens.push(comIncidencia(itemDaRubrica(R("ABONO_FERIAS"), f.abono, "", "Abono pecuniário (isento)"), false));
    if (f.tercoAbono > 0) itens.push(comIncidencia(itemDaRubrica(R("TERCO_ABONO_FERIAS"), f.tercoAbono, "", "1/3 do abono (isento)"), false));
    inssDasFerias += f.inssRetido;
    baseDasFerias += f.ferias + f.terco;
  }
  inssDasFerias = r2(inssDasFerias);

  // ── Eventos do mês ──
  let variaveisParaDsr = 0;
  let pensao = 0;
  const horaTxt = reais(r2(horaComAdicionais));
  for (const ev of e.eventos) {
    const r = ev.rubrica;
    const q = ev.quantidade ?? 0;
    const antes = itens.length;
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
    marcarFixa(itens, antes, ev);
  }

  if (variaveisParaDsr > 0 && e.diasUteis > 0) {
    const dsr = (variaveisParaDsr / e.diasUteis) * e.diasDeDescanso;
    itens.push(
      itemDaRubrica(R("DSR"), dsr, `${e.diasDeDescanso}/${e.diasUteis}`, `${reais(r2(variaveisParaDsr))} ÷ ${e.diasUteis} dias úteis × ${e.diasDeDescanso} domingos e feriados`)
    );
  }

  // ── Vale-transporte ──
  if (v.valeTransporte && salario > 0) {
    const vt = descontoDoValeTransporte(salario, v.vtCustoDiario ?? null, e.diasUteis, diasDeSalario);
    if (vt.valor > 0) itens.push(itemDaRubrica(R("VALE_TRANSPORTE"), vt.valor, vt.limitado ? `${vt.diasUteis} dias` : pct(VALE_TRANSPORTE_PCT), vt.memoria));
  }

  // ── Contribuição sindical (funcionalidade-774) ──
  // Só com autorização prévia e expressa do empregado (CLT arts. 545 e 578),
  // uma vez por ano, no mês da convenção (março, sem ela): um dia de trabalho
  // (salário ÷ 30) ou o percentual que a convenção fixar.
  if (v.contribuicaoSindical && e.mes === (e.convencao.contribuicaoMes ?? 3) && cheio > 0) {
    const pctDaConvencao = e.convencao.contribuicaoPercentual ?? null;
    const valor = pctDaConvencao !== null ? (cheio * pctDaConvencao) / 100 : cheio / 30;
    itens.push(
      itemDaRubrica(
        R("CONTRIBUICAO_SINDICAL"),
        valor,
        pctDaConvencao !== null ? pct(pctDaConvencao) : "1 dia",
        pctDaConvencao !== null
          ? `${pct(pctDaConvencao)} × ${reais(r2(cheio))} (convenção${e.convencao.nome ? ` ${e.convencao.nome}` : ""}), autorizada pelo empregado`
          : `${reais(r2(cheio))} ÷ 30 = um dia de trabalho, autorizado pelo empregado (CLT arts. 545 e 578)`
      )
    );
  }

  // ── Bases, INSS e salário-família ──
  const baseInss = baseDe(itens, "incideInss");
  const inss = calcularInssComOutrasBases(baseInss, e.outrasBasesInss ?? 0, e.tabelas.inss.dados);
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
  if (inss.valor > 0) {
    const ja = inssDasFerias > 0 ? `; inclui ${reais(inssDasFerias)} já descontados no recibo de férias` : "";
    itens.push(itemDaRubrica(R("INSS"), inss.valor, inss.faixas.length ? pct(r2((inss.valor / inss.baseLimitada) * 100)) : "", `${inss.memoria.join("; ")}${ja}`));
  }

  // ── FGTS ──
  const baseFgts = baseDe(itens, "incideFgts");
  const aliquotaFgts = v.aprendiz ? FGTS_ALIQUOTA_APRENDIZ : FGTS_ALIQUOTA;
  const fgts = r2((baseFgts * aliquotaFgts) / 100);
  if (fgts > 0) itens.push(itemDaRubrica(R("FGTS"), fgts, pct(aliquotaFgts), `${reais(baseFgts)} × ${pct(aliquotaFgts)}`));

  // ── IRRF ──
  const rendimentos = baseDe(itens, "incideIrrf");
  // O INSS das férias já deduziu no IRRF delas (tributação separada).
  // Previdência complementar (funcionalidade-762): desconta na folha e deduz da base do IRRF.
  const previdenciaComplementar = r2(Math.max(0, v.previdenciaComplementar ?? 0));
  if (previdenciaComplementar > 0) {
    itens.push(itemDaRubrica(R("PREVIDENCIA_COMPLEMENTAR"), previdenciaComplementar, "", "Contribuição do empregado à previdência complementar, deduzida da base do IRRF"));
  }
  const irrf = calcularIrrf({ rendimentos, inss: r2(Math.max(0, inss.valor - inssDasFerias)), dependentes: v.dependentesIrrf, pensao, previdenciaComplementar }, e.tabelas.irrf.dados);
  if (irrf.valor > 0) itens.push(itemDaRubrica(R("IRRF"), irrf.valor, pct(irrf.aliquota), irrf.memoria.join("; ")));

  // O recibo de férias já pagou: o líquido dele e o IRRF retido nele saem da folha.
  for (const f of feriasDoMes) {
    if (f.irrfRetido > 0) itens.push(itemDaRubrica(R("IRRF_FERIAS"), f.irrfRetido, "", "IRRF das férias, retido no recibo (tributação separada)"));
    if (f.liquidoPago > 0) {
      itens.push(
        itemDaRubrica(
          R("FERIAS_LIQUIDO_PAGO"),
          f.liquidoPago,
          "",
          `Pago no recibo de férias: ${reais(r2(f.ferias + f.terco + f.abono + f.tercoAbono))} − INSS ${reais(f.inssRetido)}${f.irrfRetido ? ` − IRRF ${reais(f.irrfRetido)}` : ""}`
        )
      );
    }
  }
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

  const encargos = ehDomestico(v.categoria) ? encargosDoDomestico(baseInss, fgts) : calcularEncargos(baseInss, fgts, e.empresa);
  // A provisão é do salário do mês: as férias gozadas não provisionam férias de novo.
  const provisoes = calcularProvisoes(r2(Math.max(0, baseInss - baseDasFerias)), e.empresa, v.aprendiz, ehDomestico(v.categoria));
  if (feriasDoMes.length) alertas.push(`Férias no mês (${feriasDoMes.map((f) => f.periodo).join(", ")}): pagas no recibo; aqui entram no INSS e no FGTS do mês.`);

  return { itens, proventos, descontos, liquido, baseInss, baseFgts, inss, irrf, fgts, encargos, provisoes, diasTrabalhados: dias, alertas };
}
