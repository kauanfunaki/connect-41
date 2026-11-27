// DP 2 (11/11/2026) — o que lê e grava no banco. As regras e o motor moram
// nos arquivos puros ao lado (`mensal.ts`, `tabelas.ts`…); aqui só se junta o
// que eles precisam e se guarda o que devolvem.

import { salarioNoMes } from "./reajuste";
import { periodoNaEmpresa } from "./transferencia";
import { avisosDeVencimento } from "./avisos";
import { lerDadosEsocial } from "./esocial/cadastro";
import { mesesDoSaldoInicial } from "./saldoInicial";
import { separarFixasDoMes, type RubricaFixa } from "./rubricasFixas";
import { diasDeSuspensaoNoMes } from "./ocorrencias";
import { adicionalDaAposentadoriaEspecial, diasDeLicencaPagosNoMes } from "./licencaPremio";
import { afastamentosDosXml, afastamentosNoMes, type AfastamentoNoMes } from "./afastamentos";
import { feriasNoMes, periodosAquisitivos, type FeriasNoMes, type PeriodoAquisitivo } from "./periodosDeFerias";
import { aplicarAjustes, type AjusteAplicado } from "./ajustesDoCalculo";
import type { Prisma } from "@/generated/prisma/client";
import { getPrisma } from "@/lib/prisma";
import { r2 } from "@/lib/rescisao/constantes";
import { diasDoMes } from "./calendario";
import { CONVENCAO_DA_CLT, type CalculoDaPessoa, type ConvencaoDoMotor, type EmpresaDoMotor, type Insalubridade, type ItemDoHolerite, type VinculoDoMotor } from "./mensal";
import { calcularDecimo } from "./decimo";
import { calcularMesDaCategoria } from "./semVinculo";
import { semVinculo as categoriaSemVinculo } from "./categorias";
import { mediaDeVariaveis, type MesDaMedia, type TipoDeMedia } from "./medias";
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
  mediaFerias: boolean;
  mediaDecimo: boolean;
  mediaRescisao: boolean;
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
    mediaFerias: r.mediaFerias,
    mediaDecimo: r.mediaDecimo,
    mediaRescisao: r.mediaRescisao,
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
      mediaFerias: r.mediaFerias,
      mediaDecimo: r.mediaDecimo,
      mediaRescisao: r.mediaRescisao,
      entraNaMedia: r.mediaFerias || r.mediaDecimo || r.mediaRescisao,
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

export type ConfigDaEmpresa = {
  empresa: EmpresaDoMotor;
  convencao: ConvencaoDoMotor;
  convencaoId: string | null;
  configurada: boolean;
  /** PIS sobre a folha (1%), das entidades sem fins lucrativos (funcionalidade-769). */
  pisSobreFolha: boolean;
  /** Adiantamento salarial (vale) da empresa (funcionalidade-758); nulo = não paga. */
  adiantamento: { percentual: number; dia: number } | null;
  pagadora: ContaPagadora | null;
  esocial: { fpas: string | null; codTercs: string | null; classTrib: string | null } | null;
};

export async function configDaEmpresa(tenantId: string, companyId: string): Promise<ConfigDaEmpresa> {
  const c = await getPrisma().dp2EmpresaConfig.findFirst({ where: { tenantId, companyId }, include: { convencao: true } });
  if (!c) {
    return { empresa: { patronalNoDas: false, ratAliquota: 2, fap: 1, terceirosAliquota: 5.8 }, convencao: CONVENCAO_DA_CLT, convencaoId: null, configurada: false, pisSobreFolha: false, adiantamento: null, pagadora: null, esocial: null };
  }
  return {
    empresa: { patronalNoDas: c.patronalNoDas, ratAliquota: dec(c.ratAliquota), fap: dec(c.fap), terceirosAliquota: dec(c.terceirosAliquota) },
    convencao: c.convencao
      ? {
          he50: dec(c.convencao.he50),
          he100: dec(c.convencao.he100),
          noturno: dec(c.convencao.noturno),
          piso: decOuNulo(c.convencao.piso),
          nome: c.convencao.nome,
          contribuicaoMes: c.convencao.contribuicaoMes,
          contribuicaoPercentual: decOuNulo(c.convencao.contribuicaoPercentual),
        }
      : CONVENCAO_DA_CLT,
    convencaoId: c.convencaoId,
    configurada: true,
    pisSobreFolha: c.pisSobreFolha,
    adiantamento: c.adiantamentoPercentual != null && c.adiantamentoDia != null ? { percentual: dec(c.adiantamentoPercentual), dia: c.adiantamentoDia } : null,
    esocial: { fpas: c.fpas, codTercs: c.codTercs, classTrib: c.classTrib },
    pagadora: { bancoCodigo: c.bancoCodigo, agencia: c.agencia, agenciaDigito: c.agenciaDigito, conta: c.conta, contaDigito: c.contaDigito, convenio: c.convenio },
  };
}

// ─── Colaboradores e vínculos ───────────────────────────────────────────────

export function vinculoDoMotor(v: {
  salarioBase: Prisma.Decimal | number;
  tipoSalario: string;
  horasMensais: number;
  aulasSemanais?: number | null;
  dependentesIrrf: number;
  filhosSalarioFamilia: number;
  insalubridade: string;
  periculosidade: boolean;
  previdenciaComplementar?: unknown;
  contribuicaoSindical?: boolean;
  valeTransporte: boolean;
  vtCustoDiario?: unknown;
  aprendiz: boolean;
  categoria?: string;
  grauExposicao?: string | null;
}): VinculoDoMotor {
  return {
    salarioBase: dec(v.salarioBase),
    tipoSalario: v.tipoSalario === "HORISTA" ? "HORISTA" : v.tipoSalario === "HORA_AULA" ? "HORA_AULA" : "MENSAL",
    aulasSemanais: v.aulasSemanais ?? null,
    horasMensais: v.horasMensais > 0 ? v.horasMensais : 220,
    dependentesIrrf: v.dependentesIrrf,
    filhosSalarioFamilia: v.filhosSalarioFamilia,
    insalubridade: (["NENHUM", "MINIMO", "MEDIO", "MAXIMO"].includes(v.insalubridade) ? v.insalubridade : "NENHUM") as Insalubridade,
    periculosidade: v.periculosidade,
    previdenciaComplementar: v.previdenciaComplementar == null ? null : Number(v.previdenciaComplementar),
    contribuicaoSindical: v.contribuicaoSindical ?? false,
    valeTransporte: v.valeTransporte,
    vtCustoDiario: v.vtCustoDiario == null ? null : Number(v.vtCustoDiario),
    aprendiz: v.aprendiz,
    categoria: v.categoria ?? "101",
    grauExposicao: v.grauExposicao ?? null,
  };
}

/**
 * Os colaboradores da empresa que contam na competência: os dela no cadastro
 * de pessoas, admitidos até o fim do mês e não desligados antes do começo.
 */
/**
 * Os colaboradores da folha da empresa no mês. Na folha mensal, a
 * transferência entre empresas do grupo (funcionalidade-771) divide o mês:
 * quem saiu da empresa no mês entra até a véspera da transferência, e quem
 * chegou entra a partir do dia dela (admissão e desligamento do trecho, para o
 * proporcional). As outras folhas (13º) seguem a empresa atual do contrato.
 */
export async function colaboradoresDaCompetencia(tenantId: string, companyId: string, ano: number, mes: number, tipo: string = "MENSAL") {
  const inicio = new Date(Date.UTC(ano, mes - 1, 1));
  const fim = new Date(Date.UTC(ano, mes, 0));
  const prisma = getPrisma();
  const select = { id: true, name: true, cpf: true, currentCompanyId: true, admissionDate: true, dismissalDate: true, currentSalary: true, dp2Vinculo: true } as const;
  const atuais = await prisma.person.findMany({
    where: {
      tenantId,
      currentCompanyId: companyId,
      isInternal: false,
      type: "COLABORADOR",
      OR: [{ admissionDate: null }, { admissionDate: { lte: fim } }],
      AND: [{ OR: [{ dismissalDate: null }, { dismissalDate: { gte: inicio } }] }],
    },
    select,
    orderBy: { name: "asc" },
  });
  type Linha = (typeof atuais)[number] & { transferencia: { entrou: string | null; saiu: string | null } | null };
  const semTransferencia = (p: (typeof atuais)[number]): Linha => ({ ...p, transferencia: null });
  if (tipo !== "MENSAL") return atuais.map(semTransferencia);
  const comPassagem = await prisma.dp2Transferencia.findMany({ where: { tenantId, OR: [{ companyId }, { deCompanyId: companyId }] }, select: { personId: true } });
  if (comPassagem.length === 0) return atuais.map(semTransferencia);
  const ids = [...new Set(comPassagem.map((t) => t.personId))];
  const jaNaLista = new Set(atuais.map((p) => p.id));
  const [passagens, quemSaiu] = await Promise.all([
    prisma.dp2Transferencia.findMany({ where: { tenantId, personId: { in: ids } }, select: { personId: true, data: true, deCompanyId: true, companyId: true } }),
    prisma.person.findMany({ where: { tenantId, id: { in: ids.filter((id) => !jaNaLista.has(id)) }, isInternal: false, type: "COLABORADOR" }, select }),
  ]);
  const isoDe = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : null);
  const dataDe = (s: string | null) => (s ? new Date(`${s}T00:00:00.000Z`) : null);
  const linhas: Linha[] = [];
  for (const p of [...atuais, ...quemSaiu]) {
    const daPessoa = passagens.filter((t) => t.personId === p.id).map((t) => ({ data: isoDe(t.data)!, deCompanyId: t.deCompanyId, paraCompanyId: t.companyId }));
    if (daPessoa.length === 0) {
      linhas.push(semTransferencia(p));
      continue;
    }
    const periodo = periodoNaEmpresa(daPessoa, { companyIdAtual: p.currentCompanyId ?? "", admissao: isoDe(p.admissionDate), desligamento: isoDe(p.dismissalDate) }, companyId, ano, mes);
    if (!periodo) continue;
    if (!periodo.entrou && !periodo.saiu) {
      linhas.push(semTransferencia(p));
      continue;
    }
    linhas.push({ ...p, admissionDate: dataDe(periodo.admissao), dismissalDate: dataDe(periodo.desligamento), transferencia: { entrou: periodo.entrou, saiu: periodo.saiu } });
  }
  return linhas.sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));
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
      education: true,
      dp2Vinculo: true,
    },
    orderBy: [{ active: "desc" }, { name: "asc" }],
  });
}

// ─── Rubricas fixas do contrato (19/11/2026, funcionalidade-767) ────────────

/** As rubricas fixas que valem na competência "AAAA-MM" para as pessoas dadas. */
export async function rubricasFixasDoMes(tenantId: string, personIds: string[], competencia: string) {
  if (personIds.length === 0) return [];
  return getPrisma().dp2RubricaFixa.findMany({
    where: { tenantId, personId: { in: personIds }, inicio: { lte: competencia }, OR: [{ fim: null }, { fim: { gte: competencia } }] },
    include: { rubrica: true },
    orderBy: { createdAt: "asc" },
  });
}

/**
 * As férias gravadas das pessoas que caem no mês (funcionalidade-745), já na
 * parte de cada mês. O gozo tem até 30 dias: começa no mês ou no anterior.
 */
export async function feriasDoMes(tenantId: string, personIds: string[], ano: number, mes: number): Promise<Map<string, FeriasNoMes[]>> {
  const porPessoa = new Map<string, FeriasNoMes[]>();
  if (personIds.length === 0) return porPessoa;
  const gravadas = await getPrisma().dp2Ferias.findMany({
    where: { tenantId, personId: { in: personIds }, inicioGozo: { gte: new Date(Date.UTC(ano, mes - 2, 1)), lte: new Date(Date.UTC(ano, mes, 0)) } },
    orderBy: { inicioGozo: "asc" },
  });
  for (const g of gravadas) {
    const parte = feriasNoMes(
      { inicioGozo: g.inicioGozo, diasGozo: g.diasGozo, ferias: dec(g.ferias), terco: dec(g.terco), abono: dec(g.abono), tercoAbono: dec(g.tercoAbono), inss: dec(g.inss), irrf: dec(g.irrf) },
      ano,
      mes
    );
    if (parte) porPessoa.set(g.personId, [...(porPessoa.get(g.personId) ?? []), parte]);
  }
  return porPessoa;
}

/**
 * Os afastamentos das pessoas que caem no mês (funcionalidade-749), lidos dos
 * S-2230 gerados no DP 2 (os rejeitados ficam de fora).
 */
export async function afastamentosDoMes(tenantId: string, personIds: string[], ano: number, mes: number): Promise<Map<string, AfastamentoNoMes[]>> {
  const porPessoa = new Map<string, AfastamentoNoMes[]>();
  if (personIds.length === 0) return porPessoa;
  const eventos = await getPrisma().dp2EventoEsocial.findMany({
    where: { tenantId, tipo: "S-2230", personId: { in: personIds }, situacao: { not: "REJEITADO" } },
    select: { personId: true, xml: true },
    orderBy: { createdAt: "asc" },
  });
  const xmls = new Map<string, string[]>();
  for (const e of eventos) if (e.personId) xmls.set(e.personId, [...(xmls.get(e.personId) ?? []), e.xml]);
  for (const [personId, lista] of xmls) {
    const doMes = afastamentosNoMes(afastamentosDosXml(lista), ano, mes);
    if (doMes.length > 0) porPessoa.set(personId, doMes);
  }
  return porPessoa;
}

/** Os períodos aquisitivos da pessoa com as férias gravadas (funcionalidade-745). */
export async function periodosDaPessoa(tenantId: string, p: { id: string; admissionDate: Date | null; dismissalDate: Date | null }, hoje: Date = new Date()): Promise<PeriodoAquisitivo[]> {
  if (!p.admissionDate) return [];
  const gravadas = await getPrisma().dp2Ferias.findMany({ where: { tenantId, personId: p.id }, select: { aquisitivoInicio: true, diasGozo: true, diasAbono: true, faltas: true, terco: true, tercoAbono: true } });
  return periodosAquisitivos(
    p.admissionDate,
    hoje,
    gravadas.map((g) => ({ aquisitivoInicio: g.aquisitivoInicio.toISOString().slice(0, 10), diasGozo: g.diasGozo, diasAbono: g.diasAbono, faltas: g.faltas, terco: dec(g.terco), tercoAbono: dec(g.tercoAbono) })),
    p.dismissalDate
  );
}

/** Troca as rubricas fixas do contrato da pessoa pelas do formulário (nenhuma = apaga todas). */
export async function gravarRubricasFixas(tenantId: string, personId: string, fixas: readonly RubricaFixa[], userId: string, tx?: Prisma.TransactionClient) {
  const db = tx ?? getPrisma();
  await db.dp2RubricaFixa.deleteMany({ where: { tenantId, personId } });
  if (fixas.length === 0) return;
  await db.dp2RubricaFixa.createMany({
    data: fixas.map((f) => ({ tenantId, personId, rubricaId: f.rubricaId, quantidade: f.quantidade, valor: f.valor, inicio: f.inicio, fim: f.fim, observacao: f.observacao, criadoPorId: userId })),
  });
}

// ─── Médias ─────────────────────────────────────────────────────────────────

/**
 * A média das variáveis da pessoa para um cálculo (férias, 13º ou rescisão) nas
 * competências mensais fechadas até `ate` ("AAAA-MM"), em até 12 meses.
 */
export async function mediaDaPessoa(tenantId: string, personId: string, ate: string, tipo: TipoDeMedia, meses = 12) {
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
  // Os meses de antes do DP 2, do saldo inicial conferido (funcionalidade-747).
  const desde = competenciaDe(de.getUTCFullYear(), de.getUTCMonth() + 1);
  const saldo = await getPrisma().dp2SaldoInicialMedia.findMany({
    where: { tenantId, personId, conferidoEm: { not: null }, competencia: { gte: desde, lte: ate } },
    select: { competencia: true, valor: true, rubricaId: true },
  });
  if (saldo.length > 0) {
    const rubricas = await getPrisma().dp2Rubrica.findMany({
      where: { tenantId, id: { in: [...new Set(saldo.map((l) => l.rubricaId))] } },
      select: { id: true, tipo: true, mediaFerias: true, mediaDecimo: true, mediaRescisao: true },
    });
    const porId = new Map(rubricas.map((r) => [r.id, r]));
    const anteriores = mesesDoSaldoInicial(
      saldo.flatMap((l) => (porId.has(l.rubricaId) ? [{ competencia: l.competencia, valor: Number(l.valor), rubrica: porId.get(l.rubricaId)! }] : [])),
      new Set(doPeriodo.map((m) => m.competencia))
    );
    doPeriodo.push(...anteriores);
    doPeriodo.sort((x, y) => x.competencia.localeCompare(y.competencia));
  }
  return mediaDeVariaveis(doPeriodo, tipo);
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
  /** Quem tem rescisão gravada no mês e saiu da folha mensal (funcionalidade-746). */
  rescindidos?: string[];
  /** Ajustes manuais que entraram no cálculo (funcionalidade-768). */
  ajustes?: number;
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

  const [linhasDeRubrica, cfg, pessoas, eventos, outrasBases, ajustes] = await Promise.all([
    listarRubricas(tenantId),
    configDaEmpresa(tenantId, comp.companyId),
    colaboradoresDaCompetencia(tenantId, comp.companyId, comp.ano, comp.mes, comp.tipo),
    prisma.dp2Evento.findMany({ where: { tenantId, competenciaId }, include: { rubrica: true } }),
    // Outras bases de INSS de quem tem mais de um vínculo (funcionalidade-769).
    prisma.dp2OutraBaseInss.findMany({ where: { tenantId, competenciaId }, select: { personId: true, remuneracao: true } }),
    // Os ajustes manuais (funcionalidade-768) entram por cima do motor: recalcular mantém.
    prisma.dp2AjusteDeCalculo.findMany({ where: { tenantId, competenciaId }, orderBy: { createdAt: "asc" } }),
  ]);
  const outrasDe = (personId: string) => r2(outrasBases.filter((o) => o.personId === personId).reduce((s, o) => s + dec(o.remuneracao), 0));
  // As rubricas fixas do contrato que valem no mês entram como eventos (funcionalidade-767),
  // menos as que o DP lançou no mês para a mesma pessoa e rubrica: aí vale o lançamento.
  const { entram: fixas } = separarFixasDoMes(
    comp.tipo === "MENSAL" ? await rubricasFixasDoMes(tenantId, pessoas.map((p) => p.id), competencia) : [],
    eventos
  );
  const rubricas = rubricasPorPapel(linhasDeRubrica);
  const { diasUteis, diasDeDescanso } = diasDoMes(comp.ano, comp.mes);
  // Férias gravadas que caem no mês (funcionalidade-745).
  const feriasDe = comp.tipo === "MENSAL" ? await feriasDoMes(tenantId, pessoas.map((p) => p.id), comp.ano, comp.mes) : new Map<string, FeriasNoMes[]>();
  // Suspensões disciplinares do mês (funcionalidade-763).
  const suspensoes =
    comp.tipo === "MENSAL"
      ? await getPrisma().dp2Ocorrencia.findMany({
          where: { tenantId, personId: { in: pessoas.map((p) => p.id) }, tipo: "SUSPENSAO", data: { gte: new Date(Date.UTC(comp.ano, comp.mes - 2, 1)), lte: new Date(Date.UTC(comp.ano, comp.mes, 0)) } },
          select: { personId: true, data: true, dias: true },
        })
      : [];
  const suspensaoDe = (personId: string) =>
    diasDeSuspensaoNoMes(
      suspensoes.filter((s) => s.personId === personId).map((s) => ({ tipo: "SUSPENSAO" as const, data: s.data.toISOString().slice(0, 10), dias: s.dias })),
      comp.ano,
      comp.mes
    );
  // Licença-prêmio paga em dinheiro no mês e aposentadorias registradas (funcionalidade-763).
  const ocorrenciasDoContrato =
    comp.tipo === "MENSAL"
      ? await getPrisma().dp2Ocorrencia.findMany({
          where: { tenantId, personId: { in: pessoas.map((p) => p.id) }, tipo: { in: ["LICENCA_PREMIO_PAGA", "APOSENTADORIA"] }, data: { lte: new Date(Date.UTC(comp.ano, comp.mes, 0)) } },
          select: { personId: true, tipo: true, data: true, dias: true, detalhe: true },
          orderBy: { data: "asc" },
        })
      : [];
  const licencaPagaDe = (personId: string) => {
    const r = rubricas.get("LICENCA_PREMIO_INDENIZADA");
    const dias = diasDeLicencaPagosNoMes(
      ocorrenciasDoContrato.filter((o) => o.personId === personId && o.tipo === "LICENCA_PREMIO_PAGA").map((o) => ({ tipo: "LICENCA_PREMIO_PAGA" as const, data: o.data.toISOString().slice(0, 10), dias: o.dias })),
      comp.ano,
      comp.mes
    );
    return r && dias > 0 ? [{ rubrica: r, quantidade: dias, valor: null }] : [];
  };
  const aposentadoriaDe = (personId: string) => {
    const a = ocorrenciasDoContrato.filter((o) => o.personId === personId && o.tipo === "APOSENTADORIA").at(-1);
    return a ? { tipo: a.detalhe ?? "", desde: a.data.toISOString().slice(0, 10) } : null;
  };
  // Afastamentos do mês, dos S-2230 (funcionalidade-749).
  const afastamentosDe = comp.tipo === "MENSAL" ? await afastamentosDoMes(tenantId, pessoas.map((p) => p.id), comp.ano, comp.mes) : new Map<string, AfastamentoNoMes[]>();

  // Rescisão gravada com desligamento no mês (funcionalidade-746): as verbas do mês
  // estão na rescisão e vão no S-2299, então a pessoa sai da folha mensal.
  const rescindidos =
    comp.tipo === "MENSAL"
      ? new Set(
          (
            await prisma.dp2Rescisao.findMany({
              where: { tenantId, personId: { in: pessoas.map((p) => p.id) }, desligamento: { gte: new Date(Date.UTC(comp.ano, comp.mes - 1, 1)), lte: new Date(Date.UTC(comp.ano, comp.mes, 0)) } },
              select: { personId: true },
            })
          ).map((r) => r.personId)
        )
      : new Set<string>();
  const nomesRescindidos: string[] = [];
  // Diferenças retroativas lançadas na competência (funcionalidade-760): uma rubrica para
  // as diferenças, uma para o INSS delas (apurado mês a mês) e uma para o salário-família.
  const diferencas =
    comp.tipo === "MENSAL" ? await prisma.dp2DiferencaRetroativa.findMany({ where: { tenantId, competenciaId }, orderBy: [{ perRef: "asc" }] }) : [];
  const eventosDasDiferencas = (personId: string) => {
    const daPessoa = diferencas.filter((d) => d.personId === personId);
    if (daPessoa.length === 0) return [];
    const soma = (ls: typeof daPessoa, campo: "valor" | "inss") => Math.round(ls.reduce((t, d) => t + Number(d[campo]), 0) * 100) / 100;
    const salariais = daPessoa.filter((d) => d.origem !== "SALARIO_FAMILIA");
    const familia = daPessoa.filter((d) => d.origem === "SALARIO_FAMILIA");
    const saida: { rubrica: RubricaDoMotor; quantidade: null; valor: number; memoria: string }[] = [];
    const add = (papel: PapelDaRubrica, valor: number, memoria: string) => {
      const r = rubricas.get(papel);
      if (r && valor > 0) saida.push({ rubrica: r, quantidade: null, valor, memoria: memoria.slice(0, 900) });
    };
    add("DIFERENCA_RETROATIVA", soma(salariais, "valor"), salariais.map((d) => `${d.descricao}: ${d.memoria.split("; INSS")[0]}`).join(" | "));
    add("INSS_DIFERENCA", soma(salariais, "inss"), salariais.map((d) => `${d.perRef}: R$ ${Number(d.inss).toFixed(2).replace(".", ",")}`).join("; ") + " (INSS pela tabela de cada mês)");
    add("SALARIO_FAMILIA_RETROATIVO", soma(familia, "valor"), familia.map((d) => d.memoria).join(" | "));
    return saida;
  };
  // Histórico salarial (funcionalidade-760): o salário de cada um no mês.
  const fimDoMesIso = new Date(Date.UTC(comp.ano, comp.mes, 0)).toISOString().slice(0, 10);
  const historicoSalarial =
    comp.tipo === "MENSAL"
      ? await prisma.dp2HistoricoSalarial.findMany({ where: { tenantId, personId: { in: pessoas.map((p) => p.id) } }, select: { personId: true, data: true, salario: true, salarioAnterior: true } })
      : [];
  const historicoDe = (personId: string) =>
    historicoSalarial
      .filter((h) => h.personId === personId)
      .map((h) => ({ data: h.data.toISOString().slice(0, 10), salario: Number(h.salario), salarioAnterior: h.salarioAnterior === null ? null : Number(h.salarioAnterior) }));

  const resultados: { personId: string; c: CalculoDaPessoa; aplicados: AjusteAplicado[] }[] = [];
  let semVinculo = 0;
  for (const p of pessoas) {
    if (!p.dp2Vinculo) {
      semVinculo++;
      continue;
    }
    if (rescindidos.has(p.id)) {
      nomesRescindidos.push(p.name);
      continue;
    }
    // O salário vigente no mês, pelo histórico salarial (funcionalidade-760).
    const vinculo = { ...vinculoDoMotor(p.dp2Vinculo), ...(comp.tipo === "MENSAL" ? { salarioBase: salarioNoMes(historicoDe(p.id), fimDoMesIso, Number(p.dp2Vinculo.salarioBase)) } : {}) };
    // 13º é só de empregado: sócio, autônomo e estagiário ficam fora.
    if (comp.tipo !== "MENSAL" && categoriaSemVinculo(vinculo.categoria)) continue;
    const daPessoa = eventos.filter((e) => e.personId === p.id);
    let c: CalculoDaPessoa;
    if (comp.tipo === "MENSAL") {
      c = calcularMesDaCategoria({
        ano: comp.ano,
        mes: comp.mes,
        admissao: p.admissionDate,
        desligamento: p.dismissalDate,
        vinculo,
        eventos: [
          ...daPessoa.map((e) => ({ rubrica: rubricaDoMotor(e.rubrica), quantidade: decOuNulo(e.quantidade), valor: decOuNulo(e.valor) })),
          ...fixas
            .filter((f) => f.personId === p.id && f.rubrica.ativa)
            .map((f) => ({ rubrica: rubricaDoMotor(f.rubrica), quantidade: decOuNulo(f.quantidade), valor: decOuNulo(f.valor), origem: "FIXA" as const })),
          ...eventosDasDiferencas(p.id),
          ...licencaPagaDe(p.id),
        ],
        rubricas,
        tabelas: tab.tabelas,
        convencao: cfg.convencao,
        empresa: cfg.empresa,
        diasUteis,
        diasDeDescanso,
        ferias: feriasDe.get(p.id),
        diasDeSuspensao: suspensaoDe(p.id),
        afastamentos: afastamentosDe.get(p.id),
        outrasBasesInss: outrasDe(p.id),
        aposentadoria: aposentadoriaDe(p.id),
      });
      // Transferência no mês (funcionalidade-771): o fim do trecho não é desligamento.
      if (p.transferencia) {
        const br = (d: string) => d.split("-").reverse().join("/");
        c.alertas = c.alertas.filter((a) => !a.startsWith("Desligamento no mês"));
        if (p.transferencia.saiu) c.alertas.push(`Transferido(a) para outra empresa do grupo em ${br(p.transferencia.saiu)}: esta folha paga até a véspera, sem rescisão.`);
        if (p.transferencia.entrou) c.alertas.push(`Veio de outra empresa do grupo em ${br(p.transferencia.entrou)}: esta folha paga a partir do dia da transferência.`);
      }
    } else {
      c = await calcularDecimoDaPessoa(tenantId, comp.companyId, comp.ano, comp.mes, comp.tipo === "DECIMO_1" ? 1 : 2, p, vinculo, rubricas, tab.tabelas, cfg.empresa);
    }
    const { calculo, aplicados } = aplicarAjustes(
      c,
      ajustes.filter((a) => a.personId === p.id).map((a) => ({ campo: a.campo, valor: dec(a.valor), motivo: a.motivo }))
    );
    resultados.push({ personId: p.id, c: calculo, aplicados });
  }

  const totais: TotaisDaCompetencia = { pessoas: resultados.length, proventos: 0, descontos: 0, liquido: 0, inss: 0, irrf: 0, fgts: 0, encargos: 0, provisoes: 0, alertas: 0, semVinculo, ...(nomesRescindidos.length ? { rescindidos: nomesRescindidos } : {}) };
  totais.ajustes = resultados.reduce((s, r) => s + r.aplicados.length, 0);
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
      data: resultados.map(({ personId, c, aplicados }) => ({
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
        memoria: json({
          inss: c.inss.memoria,
          irrf: c.irrf.memoria,
          diasTrabalhados: c.diasTrabalhados,
          ajustes: aplicados,
          ...(c.inss.indMV ? { infoMV: { indMV: c.inss.indMV, outrasBases: c.inss.outrasBases ?? 0 } } : {}),
        }),
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
  const media = await mediaDaPessoa(tenantId, p.id, competenciaDe(ano, Math.max(1, mes - 1)), "DECIMO", mes);
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
  // Aposentadoria especial (funcionalidade-763): o adicional também incide sobre o 13º.
  const especial = adicionalDaAposentadoriaEspecial(baseEncargos, empresa.patronalNoDas ? null : vinculo.grauExposicao);
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
      ...(especial.valor > 0 ? { aposentadoriaEspecial: especial.valor } : {}),
      fgts: d.fgts,
      total: r2(patronal + especial.valor + d.fgts),
      memoria: [
        ...d.memoria,
        `Média de variáveis: ${media.memoria}`,
        parcela === 2 ? `Patronal sobre o 13º: ${encargoPct.toFixed(2)}%` : "Patronal do 13º sai na 2ª parcela",
        ...(especial.valor > 0 ? [`Adicional da aposentadoria especial: ${especial.aliquota}% sobre o 13º = R$ ${especial.valor.toFixed(2).replace(".", ",")}`] : []),
      ],
    },
    provisoes: { base: 0, ferias: 0, tercoFerias: 0, decimo: 0, encargosFerias: 0, encargosDecimo: 0, total: 0, memoria: ["O 13º pago baixa a provisão"] },
    diasTrabalhados: d.avos,
    alertas: d.alertas,
  };
}

// ─── Avisos (25/11/2026, funcionalidade-757) ────────────────────────────────

/** Os avisos de vencimento dos colaboradores com contrato no DP 2 das empresas pedidas. */
export async function avisosDasEmpresas(tenantId: string, companyIds: readonly string[], hoje: string) {
  if (companyIds.length === 0) return [];
  const vinculos = await getPrisma().dp2Vinculo.findMany({
    where: { tenantId, companyId: { in: [...companyIds] }, person: { active: true } },
    select: {
      companyId: true,
      dadosEsocial: true,
      person: {
        select: {
          id: true,
          name: true,
          admissionDate: true,
          dismissalDate: true,
          dependentes: { select: { name: true, birthDate: true, relationship: true, isIRDependent: true, isSalarioFamilia: true } },
          dp2Ferias: { select: { aquisitivoInicio: true, diasGozo: true, diasAbono: true, faltas: true, terco: true, tercoAbono: true } },
        },
      },
    },
  });
  const dia = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : null);
  return avisosDeVencimento(
    vinculos.map((v) => {
      const es = lerDadosEsocial(v.dadosEsocial);
      return {
        personId: v.person.id,
        nome: v.person.name,
        companyId: v.companyId,
        admissao: dia(v.person.admissionDate),
        desligamento: dia(v.person.dismissalDate),
        tipoContrato: es.tipoContrato,
        dataTermino: es.dataTermino,
        estagioPrevisaoTermino: es.estagioPrevisaoTermino,
        ferias: v.person.dp2Ferias.map((f) => ({ aquisitivoInicio: dia(f.aquisitivoInicio)!, diasGozo: f.diasGozo, diasAbono: f.diasAbono, faltas: f.faltas, terco: Number(f.terco), tercoAbono: Number(f.tercoAbono) })),
        dependentes: v.person.dependentes.map((d) => ({ nome: d.name, nascimento: dia(d.birthDate), relacao: d.relationship, irrf: d.isIRDependent, salarioFamilia: d.isSalarioFamilia })),
      };
    }),
    hoje
  );
}
