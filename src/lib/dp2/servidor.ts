// DP 2 (11/11/2026) — o que lê e grava no banco. As regras e o motor moram
// nos arquivos puros ao lado (`mensal.ts`, `tabelas.ts`…); aqui só se junta o
// que eles precisam e se guarda o que devolvem.

import type { Prisma } from "@/generated/prisma/client";
import { getPrisma } from "@/lib/prisma";
import { r2 } from "@/lib/rescisao/constantes";
import { diasDoMes } from "./calendario";
import { calcularMes, CONVENCAO_DA_CLT, type CalculoDaPessoa, type ConvencaoDoMotor, type EmpresaDoMotor, type Insalubridade, type ItemDoHolerite, type VinculoDoMotor } from "./mensal";
import { calcularDecimo } from "./decimo";
import { mediaDeVariaveis, type MesDaMedia } from "./medias";
import { ehPapel, rubricasQueFaltam, type LancamentoDaRubrica, type PapelDaRubrica, type RubricaDoMotor, type TipoDaRubrica } from "./rubricas";
import { competenciaDe, lerDadosDaTabela, tabelasDaCompetencia, TIPOS_DE_TABELA, type TipoDeTabela, type VersaoDaTabela } from "./tabelas";

const dec = (v: Prisma.Decimal | number | null | undefined): number => (v === null || v === undefined ? 0 : Number(v));
const decOuNulo = (v: Prisma.Decimal | number | null | undefined): number | null => (v === null || v === undefined ? null : Number(v));

// ─── Rubricas ───────────────────────────────────────────────────────────────

type LinhaDeRubrica = {
  id: string;
  codigo: string;
  nome: string;
  tipo: string;
  papel: string | null;
  lancamento: string;
  incideInss: boolean;
  incideFgts: boolean;
  incideIrrf: boolean;
  entraNaMedia: boolean;
  ativa: boolean;
};

export function rubricaDoMotor(r: LinhaDeRubrica): RubricaDoMotor {
  return {
    codigo: r.codigo,
    nome: r.nome,
    tipo: r.tipo as TipoDaRubrica,
    papel: ehPapel(r.papel) ? r.papel : null,
    lancamento: r.lancamento as LancamentoDaRubrica,
    incideInss: r.incideInss,
    incideFgts: r.incideFgts,
    incideIrrf: r.incideIrrf,
    entraNaMedia: r.entraNaMedia,
  };
}

/** Cria as rubricas do motor que faltam (no primeiro acesso, a lista padrão inteira). */
export async function garantirRubricas(tenantId: string): Promise<void> {
  const prisma = getPrisma();
  const existentes = await prisma.dp2Rubrica.findMany({ where: { tenantId }, select: { codigo: true, papel: true } });
  const faltam = rubricasQueFaltam(existentes);
  if (faltam.length === 0) return;
  const codigos = new Set(existentes.map((r) => r.codigo));
  await prisma.dp2Rubrica.createMany({
    data: faltam.map((r) => ({
      tenantId,
      // Código ocupado por uma rubrica livre do escritório: a do motor vai para o fim.
      codigo: codigos.has(r.codigo) ? `9${r.codigo}` : r.codigo,
      nome: r.nome,
      tipo: r.tipo,
      papel: r.papel,
      lancamento: r.lancamento,
      incideInss: r.incideInss,
      incideFgts: r.incideFgts,
      incideIrrf: r.incideIrrf,
      entraNaMedia: r.entraNaMedia,
    })),
    skipDuplicates: true,
  });
}

export async function listarRubricas(tenantId: string) {
  await garantirRubricas(tenantId);
  return getPrisma().dp2Rubrica.findMany({ where: { tenantId }, orderBy: { codigo: "asc" } });
}

export function rubricasPorPapel(linhas: readonly LinhaDeRubrica[]): Map<PapelDaRubrica, RubricaDoMotor> {
  const mapa = new Map<PapelDaRubrica, RubricaDoMotor>();
  for (const r of linhas) {
    const m = rubricaDoMotor(r);
    if (m.papel && !mapa.has(m.papel)) mapa.set(m.papel, m);
  }
  return mapa;
}

// ─── Tabelas ────────────────────────────────────────────────────────────────

export async function tabelasDoEscritorio(tenantId: string): Promise<VersaoDaTabela[]> {
  const linhas = await getPrisma().dp2TabelaOficial.findMany({ where: { tenantId }, orderBy: [{ tipo: "asc" }, { vigencia: "asc" }] });
  const versoes: VersaoDaTabela[] = [];
  for (const l of linhas) {
    if (!(TIPOS_DE_TABELA as readonly string[]).includes(l.tipo)) continue;
    const lida = lerDadosDaTabela(l.tipo as TipoDeTabela, l.dados);
    if (!lida.ok) continue;
    versoes.push({ tipo: l.tipo as TipoDeTabela, vigencia: l.vigencia, dados: lida.dados, origem: "ESCRITORIO", fundamento: l.observacao ?? "Gravada pelo escritório" } as VersaoDaTabela);
  }
  return versoes;
}

// ─── Empresa ────────────────────────────────────────────────────────────────

export type ContaPagadora = { bancoCodigo: string | null; agencia: string | null; agenciaDigito: string | null; conta: string | null; contaDigito: string | null; convenio: string | null };

export type ConfigDaEmpresa = { empresa: EmpresaDoMotor; convencao: ConvencaoDoMotor; convencaoId: string | null; configurada: boolean; pagadora: ContaPagadora | null };

export async function configDaEmpresa(tenantId: string, companyId: string): Promise<ConfigDaEmpresa> {
  const c = await getPrisma().dp2EmpresaConfig.findFirst({ where: { tenantId, companyId }, include: { convencao: true } });
  if (!c) return { empresa: { patronalNoDas: false, ratAliquota: 2, fap: 1, terceirosAliquota: 5.8 }, convencao: CONVENCAO_DA_CLT, convencaoId: null, configurada: false, pagadora: null };
  return {
    empresa: { patronalNoDas: c.patronalNoDas, ratAliquota: dec(c.ratAliquota), fap: dec(c.fap), terceirosAliquota: dec(c.terceirosAliquota) },
    convencao: c.convencao
      ? { he50: dec(c.convencao.he50), he100: dec(c.convencao.he100), noturno: dec(c.convencao.noturno), piso: decOuNulo(c.convencao.piso), nome: c.convencao.nome }
      : CONVENCAO_DA_CLT,
    convencaoId: c.convencaoId,
    configurada: true,
    pagadora: { bancoCodigo: c.bancoCodigo, agencia: c.agencia, agenciaDigito: c.agenciaDigito, conta: c.conta, contaDigito: c.contaDigito, convenio: c.convenio },
  };
}

// ─── Colaboradores e vínculos ───────────────────────────────────────────────

export function vinculoDoMotor(v: {
  salarioBase: Prisma.Decimal | number;
  tipoSalario: string;
  horasMensais: number;
  dependentesIrrf: number;
  filhosSalarioFamilia: number;
  insalubridade: string;
  periculosidade: boolean;
  valeTransporte: boolean;
  aprendiz: boolean;
}): VinculoDoMotor {
  return {
    salarioBase: dec(v.salarioBase),
    tipoSalario: v.tipoSalario === "HORISTA" ? "HORISTA" : "MENSAL",
    horasMensais: v.horasMensais > 0 ? v.horasMensais : 220,
    dependentesIrrf: v.dependentesIrrf,
    filhosSalarioFamilia: v.filhosSalarioFamilia,
    insalubridade: (["NENHUM", "MINIMO", "MEDIO", "MAXIMO"].includes(v.insalubridade) ? v.insalubridade : "NENHUM") as Insalubridade,
    periculosidade: v.periculosidade,
    valeTransporte: v.valeTransporte,
    aprendiz: v.aprendiz,
  };
}

/**
 * Os colaboradores da empresa que contam na competência: os dela no cadastro
 * de pessoas, admitidos até o fim do mês e não desligados antes do começo.
 */
export async function colaboradoresDaCompetencia(tenantId: string, companyId: string, ano: number, mes: number) {
  const inicio = new Date(Date.UTC(ano, mes - 1, 1));
  const fim = new Date(Date.UTC(ano, mes, 0));
  return getPrisma().person.findMany({
    where: {
      tenantId,
      currentCompanyId: companyId,
      isInternal: false,
      type: "COLABORADOR",
      OR: [{ admissionDate: null }, { admissionDate: { lte: fim } }],
      AND: [{ OR: [{ dismissalDate: null }, { dismissalDate: { gte: inicio } }] }],
    },
    select: { id: true, name: true, cpf: true, admissionDate: true, dismissalDate: true, currentSalary: true, dp2Vinculo: true },
    orderBy: { name: "asc" },
  });
}

/** Todos os colaboradores da empresa (ativos primeiro), com o vínculo do DP 2. */
export async function colaboradoresDaEmpresa(tenantId: string, companyId: string) {
  return getPrisma().person.findMany({
    where: { tenantId, currentCompanyId: companyId, isInternal: false, type: "COLABORADOR" },
    select: {
      id: true,
      name: true,
      cpf: true,
      active: true,
      admissionDate: true,
      dismissalDate: true,
      currentSalary: true,
      bankName: true,
      bankAgency: true,
      bankAccount: true,
      bankAccountType: true,
      dp2Vinculo: true,
    },
    orderBy: [{ active: "desc" }, { name: "asc" }],
  });
}

// ─── Médias ─────────────────────────────────────────────────────────────────

/** A média das variáveis da pessoa nas competências mensais fechadas até `ate` ("AAAA-MM"), em até 12 meses. */
export async function mediaDaPessoa(tenantId: string, personId: string, ate: string, meses = 12) {
  const [anoAte, mesAte] = ate.split("-").map(Number);
  const de = new Date(Date.UTC(anoAte, mesAte - meses, 1));
  const calculos = await getPrisma().dp2Calculo.findMany({
    where: {
      tenantId,
      personId,
      competencia: {
        tipo: "MENSAL",
        situacao: "FECHADA",
        OR: [{ ano: { gt: de.getUTCFullYear() } }, { ano: de.getUTCFullYear(), mes: { gte: de.getUTCMonth() + 1 } }],
      },
    },
    select: { itens: true, competencia: { select: { ano: true, mes: true } } },
  });
  const doPeriodo: MesDaMedia[] = calculos
    .filter((c) => competenciaDe(c.competencia.ano, c.competencia.mes) <= ate)
    .sort((a, b) => a.competencia.ano - b.competencia.ano || a.competencia.mes - b.competencia.mes)
    .map((c) => ({ competencia: competenciaDe(c.competencia.ano, c.competencia.mes), itens: (c.itens as unknown as ItemDoHolerite[]) ?? [] }));
  return mediaDeVariaveis(doPeriodo);
}

// ─── Competência ────────────────────────────────────────────────────────────

export type TotaisDaCompetencia = {
  pessoas: number;
  proventos: number;
  descontos: number;
  liquido: number;
  inss: number;
  irrf: number;
  fgts: number;
  encargos: number;
  provisoes: number;
  alertas: number;
  semVinculo: number;
};

export type ResultadoDoCalculo = { ok: true; totais: TotaisDaCompetencia } | { ok: false; erro: string };

const json = (v: unknown) => v as Prisma.InputJsonValue;

/**
 * Calcula a competência inteira e grava o resultado de cada pessoa (o cálculo
 * anterior sai). Só calcula competência aberta ou já calculada; fechada pede
 * reabrir antes.
 */
export async function calcularCompetencia(tenantId: string, competenciaId: string): Promise<ResultadoDoCalculo> {
  const prisma = getPrisma();
  const comp = await prisma.dp2Competencia.findFirst({ where: { id: competenciaId, tenantId } });
  if (!comp) return { ok: false, erro: "Competência não encontrada." };
  if (comp.situacao === "FECHADA") return { ok: false, erro: "Competência fechada: reabra para calcular de novo." };

  const competencia = competenciaDe(comp.ano, comp.mes);
  const tab = tabelasDaCompetencia(competencia, await tabelasDoEscritorio(tenantId));
  if (!tab.ok) return { ok: false, erro: `Faltam tabelas para ${competencia}: ${tab.faltam.join(", ")}.` };

  const [linhasDeRubrica, cfg, pessoas, eventos] = await Promise.all([
    listarRubricas(tenantId),
    configDaEmpresa(tenantId, comp.companyId),
    colaboradoresDaCompetencia(tenantId, comp.companyId, comp.ano, comp.mes),
    prisma.dp2Evento.findMany({ where: { tenantId, competenciaId }, include: { rubrica: true } }),
  ]);
  const rubricas = rubricasPorPapel(linhasDeRubrica);
  const { diasUteis, diasDeDescanso } = diasDoMes(comp.ano, comp.mes);

  const resultados: { personId: string; c: CalculoDaPessoa }[] = [];
  let semVinculo = 0;
  for (const p of pessoas) {
    if (!p.dp2Vinculo) {
      semVinculo++;
      continue;
    }
    const vinculo = vinculoDoMotor(p.dp2Vinculo);
    const daPessoa = eventos.filter((e) => e.personId === p.id);
    let c: CalculoDaPessoa;
    if (comp.tipo === "MENSAL") {
      c = calcularMes({
        ano: comp.ano,
        mes: comp.mes,
        admissao: p.admissionDate,
        desligamento: p.dismissalDate,
        vinculo,
        eventos: daPessoa.map((e) => ({ rubrica: rubricaDoMotor(e.rubrica), quantidade: decOuNulo(e.quantidade), valor: decOuNulo(e.valor) })),
        rubricas,
        tabelas: tab.tabelas,
        convencao: cfg.convencao,
        empresa: cfg.empresa,
        diasUteis,
        diasDeDescanso,
      });
    } else {
      c = await calcularDecimoDaPessoa(tenantId, comp.companyId, comp.ano, comp.mes, comp.tipo === "DECIMO_1" ? 1 : 2, p, vinculo, rubricas, tab.tabelas, cfg.empresa);
    }
    resultados.push({ personId: p.id, c });
  }

  const totais: TotaisDaCompetencia = { pessoas: resultados.length, proventos: 0, descontos: 0, liquido: 0, inss: 0, irrf: 0, fgts: 0, encargos: 0, provisoes: 0, alertas: 0, semVinculo };
  for (const { c } of resultados) {
    totais.proventos += c.proventos;
    totais.descontos += c.descontos;
    totais.liquido += c.liquido;
    totais.inss += c.inss.valor;
    totais.irrf += c.irrf.valor;
    totais.fgts += c.fgts;
    totais.encargos += c.encargos.total;
    totais.provisoes += c.provisoes.total;
    totais.alertas += c.alertas.length;
  }
  for (const k of ["proventos", "descontos", "liquido", "inss", "irrf", "fgts", "encargos", "provisoes"] as const) totais[k] = r2(totais[k]);

  await prisma.$transaction([
    prisma.dp2Calculo.deleteMany({ where: { tenantId, competenciaId } }),
    prisma.dp2Calculo.createMany({
      data: resultados.map(({ personId, c }) => ({
        tenantId,
        competenciaId,
        personId,
        proventos: c.proventos,
        descontos: c.descontos,
        liquido: c.liquido,
        baseInss: c.baseInss,
        inss: c.inss.valor,
        baseIrrf: c.irrf.base,
        irrf: c.irrf.valor,
        baseFgts: c.baseFgts,
        fgts: c.fgts,
        itens: json(c.itens),
        memoria: json({ inss: c.inss.memoria, irrf: c.irrf.memoria, diasTrabalhados: c.diasTrabalhados }),
        encargos: json(c.encargos),
        provisoes: json(c.provisoes),
        alertas: json(c.alertas),
      })),
    }),
    prisma.dp2Competencia.update({ where: { id: competenciaId }, data: { situacao: "CALCULADA", calculadaEm: new Date(), totais: json(totais) } }),
  ]);
  return { ok: true, totais };
}

/**
 * Uma parcela do 13º no formato do cálculo mensal, para a mesma tela de
 * competência mostrar: média das variáveis do ano e, na 2ª, a 1ª já paga.
 */
async function calcularDecimoDaPessoa(
  tenantId: string,
  companyId: string,
  ano: number,
  mes: number,
  parcela: 1 | 2,
  p: { id: string; admissionDate: Date | null; dismissalDate: Date | null },
  vinculo: VinculoDoMotor,
  rubricas: Map<PapelDaRubrica, RubricaDoMotor>,
  tabelas: Parameters<typeof calcularDecimo>[0]["tabelas"],
  empresa: EmpresaDoMotor
): Promise<CalculoDaPessoa> {
  const media = await mediaDaPessoa(tenantId, p.id, competenciaDe(ano, Math.max(1, mes - 1)), mes);
  let primeira = 0;
  if (parcela === 2) {
    const anterior = await getPrisma().dp2Calculo.findFirst({
      where: { tenantId, personId: p.id, competencia: { companyId, ano, tipo: "DECIMO_1" } },
      select: { proventos: true },
    });
    primeira = dec(anterior?.proventos);
  }
  const d = calcularDecimo({
    parcela,
    ano,
    mesDoPagamento: mes,
    admissao: p.admissionDate,
    desligamento: p.dismissalDate,
    vinculo,
    mediaVariaveis: media.media,
    primeiraParcelaPaga: primeira,
    rubricas,
    tabelas,
  });
  const vazioInss = { base: 0, baseLimitada: 0, teto: 0, valor: 0, faixas: [], memoria: ["Sem INSS na 1ª parcela"] };
  const vazioIrrf = {
    rendimentos: 0,
    deducaoUsada: "LEGAL" as const,
    deducao: 0,
    base: 0,
    aliquota: 0,
    parcelaADeduzir: 0,
    impostoDaTabela: 0,
    reducao: 0,
    devido: 0,
    valor: 0,
    naoRetido: false,
    memoria: ["Sem IRRF na 1ª parcela"],
  };
  const encargoPct = empresa.patronalNoDas ? 0 : 20 + empresa.ratAliquota * empresa.fap + empresa.terceirosAliquota;
  const baseEncargos = parcela === 2 ? d.integral : 0;
  const patronal = r2((baseEncargos * encargoPct) / 100);
  return {
    itens: d.itens,
    proventos: d.proventos,
    descontos: d.descontos,
    liquido: d.liquido,
    baseInss: d.inss?.base ?? 0,
    baseFgts: d.baseFgts,
    inss: d.inss ?? vazioInss,
    irrf: d.irrf ?? vazioIrrf,
    fgts: d.fgts,
    encargos: {
      base: baseEncargos,
      inssEmpresa: patronal,
      rat: 0,
      terceiros: 0,
      fgts: d.fgts,
      total: r2(patronal + d.fgts),
      memoria: [...d.memoria, `Média de variáveis: ${media.memoria}`, parcela === 2 ? `Patronal sobre o 13º: ${encargoPct.toFixed(2)}%` : "Patronal do 13º sai na 2ª parcela"],
    },
    provisoes: { base: 0, ferias: 0, tercoFerias: 0, decimo: 0, encargosFerias: 0, encargosDecimo: 0, total: 0, memoria: ["O 13º pago baixa a provisão"] },
    diasTrabalhados: d.avos,
    alertas: d.alertas,
  };
}
