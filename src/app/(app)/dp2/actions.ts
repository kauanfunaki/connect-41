"use server";

// DP 2 (11/11/2026, funcionalidade-621) — as ações das telas. Cada uma confere
// de novo quem pode (Server Function aceita POST direto): o módulo ligado, o
// nível no setor, o escritório e, nas telas de empresa, a faixa "Trabalhando
// em" (`recusaDoFoco`).

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getAuthContext, type AuthContext } from "@/lib/auth/context";
import { podeNoModulo, type NivelNoModulo } from "@/lib/auth/modulo";
import { getPrisma } from "@/lib/prisma";
import { logAudit } from "@/lib/audit";
import { recusaDoFoco } from "@/lib/empresas/focoServidor";
import { calcularCompetencia, garantirRubricas } from "@/lib/dp2/servidor";
import { PAPEIS_LANCAVEIS, TIPOS_DE_RUBRICA, ehPapel } from "@/lib/dp2/rubricas";
import { lerDadosDaTabela, TIPOS_DE_TABELA, type TipoDeTabela } from "@/lib/dp2/tabelas";
import { lerComparativo } from "@/lib/dp2/comparativo";
import { lerNumero, lerInteiro } from "@/lib/dp2/entrada";
import type { EstadoDoDp2 } from "@/components/dp2/Formulario";
import {
  gerarAdmissao,
  gerarAfastamento,
  gerarAlteracao,
  gerarAso,
  gerarCat,
  gerarCondicaoAmbiental,
  gerarDesligamento,
  gerarPeriodicos,
  gerarTabelas,
} from "@/lib/dp2/esocial/servidor";
import { lerAgentes, lerProcedimentos, lerResponsaveis } from "@/lib/dp2/esocial/sst";
import { lerDadosEsocial } from "@/lib/dp2/esocial/cadastro";
import { MOTIVO_LABEL, type MotivoCanonico } from "@/lib/rescisao/motivos";

type Acesso = { ctx: AuthContext; tenantId: string; userId: string };

async function acesso(modulo: string, nivel: NivelNoModulo): Promise<Acesso | null> {
  const ctx = await getAuthContext();
  if (!ctx.tenantId) return null;
  // A competência serve também ao 13º salário: quem tem um dos dois módulos
  // abre, calcula e fecha as parcelas.
  const modulos = modulo === "dp2_competencia" ? ["dp2_competencia", "dp2_decimo"] : [modulo];
  for (const m of modulos) if (await podeNoModulo(ctx, m, nivel)) return { ctx, tenantId: ctx.tenantId, userId: ctx.userId };
  return null;
}

const texto = (fd: FormData, k: string) => {
  const v = fd.get(k);
  return typeof v === "string" ? v.trim() : "";
};
const marcado = (fd: FormData, k: string) => fd.get(k) === "on" || fd.get(k) === "true";
const erro = (t: string): EstadoDoDp2 => ({ ok: false, texto: t });
const SEM_PERMISSAO = erro("Sem permissão para isto no DP 2.");

async function empresaDoEscritorio(a: Acesso, companyId: string): Promise<string | null> {
  if (!companyId) return "Escolha a empresa.";
  const empresa = await getPrisma().company.findFirst({ where: { id: companyId, tenantId: a.tenantId }, select: { id: true } });
  if (!empresa) return "Empresa não encontrada.";
  return recusaDoFoco(a.ctx, [companyId]);
}

async function competenciaEditavel(a: Acesso, competenciaId: string) {
  const comp = await getPrisma().dp2Competencia.findFirst({ where: { id: competenciaId, tenantId: a.tenantId } });
  if (!comp) return { erro: "Competência não encontrada." } as const;
  const foraDoFoco = await recusaDoFoco(a.ctx, [comp.companyId]);
  if (foraDoFoco) return { erro: foraDoFoco } as const;
  return { comp } as const;
}

function revalidarCompetencia(id?: string) {
  revalidatePath("/dp2");
  revalidatePath("/dp2/competencia");
  revalidatePath("/dp2/decimo-terceiro");
  if (id) revalidatePath(`/dp2/competencia/${id}`);
}

// ─── Competência ────────────────────────────────────────────────────────────

const TIPOS_DE_COMPETENCIA = ["MENSAL", "DECIMO_1", "DECIMO_2"] as const;

export async function abrirCompetenciaAction(_: EstadoDoDp2, fd: FormData): Promise<EstadoDoDp2> {
  const a = await acesso("dp2_competencia", "agir");
  if (!a) return SEM_PERMISSAO;
  const companyId = texto(fd, "companyId");
  const recusa = await empresaDoEscritorio(a, companyId);
  if (recusa) return erro(recusa);
  const m = /^(\d{4})-(\d{2})$/.exec(texto(fd, "competencia"));
  if (!m) return erro("Informe o mês da competência.");
  const ano = Number(m[1]);
  const mes = Number(m[2]);
  if (mes < 1 || mes > 12) return erro("Mês inválido.");
  const tipo = texto(fd, "tipo") || "MENSAL";
  if (!(TIPOS_DE_COMPETENCIA as readonly string[]).includes(tipo)) return erro("Tipo de competência inválido.");
  if (tipo === "DECIMO_2" && mes !== 12) return erro("A 2ª parcela do 13º é de dezembro.");

  const prisma = getPrisma();
  await garantirRubricas(a.tenantId);
  const existente = await prisma.dp2Competencia.findFirst({ where: { companyId, ano, mes, tipo }, select: { id: true } });
  const id =
    existente?.id ??
    (await prisma.dp2Competencia.create({ data: { tenantId: a.tenantId, companyId, ano, mes, tipo, abertaPorId: a.userId }, select: { id: true } })).id;
  if (!existente) {
    await logAudit({
      tenantId: a.tenantId,
      userId: a.userId,
      action: "folha.competencia_aberta",
      entityType: "Dp2Competencia",
      entityId: id,
      metadata: { companyId, ano, mes, tipo },
    });
  }
  revalidarCompetencia();
  redirect(`/dp2/competencia/${id}`);
}

export async function calcularCompetenciaAction(_: EstadoDoDp2, fd: FormData): Promise<EstadoDoDp2> {
  const a = await acesso("dp2_competencia", "agir");
  if (!a) return SEM_PERMISSAO;
  const id = texto(fd, "competenciaId");
  const r0 = await competenciaEditavel(a, id);
  if ("erro" in r0) return erro(r0.erro!);
  const r = await calcularCompetencia(a.tenantId, id);
  if (!r.ok) return erro(r.erro);
  await logAudit({
    tenantId: a.tenantId,
    userId: a.userId,
    action: "folha.competencia_calculada",
    entityType: "Dp2Competencia",
    entityId: id,
    metadata: { pessoas: r.totais.pessoas, liquido: r.totais.liquido },
  });
  revalidarCompetencia(id);
  const sem = r.totais.semVinculo > 0 ? ` ${r.totais.semVinculo} sem contrato no DP 2 ficaram de fora.` : "";
  return { ok: true, texto: `Calculado: ${r.totais.pessoas} pessoa(s).${sem}` };
}

export async function fecharCompetenciaAction(_: EstadoDoDp2, fd: FormData): Promise<EstadoDoDp2> {
  const a = await acesso("dp2_competencia", "agir");
  if (!a) return SEM_PERMISSAO;
  const id = texto(fd, "competenciaId");
  const r0 = await competenciaEditavel(a, id);
  if ("erro" in r0) return erro(r0.erro!);
  if (r0.comp.situacao !== "CALCULADA") return erro("Só fecha competência calculada, depois do último lançamento.");
  await getPrisma().dp2Competencia.update({ where: { id }, data: { situacao: "FECHADA", fechadaEm: new Date(), fechadaPorId: a.userId } });
  await logAudit({
    tenantId: a.tenantId,
    userId: a.userId,
    action: "folha.competencia_fechada",
    entityType: "Dp2Competencia",
    entityId: id,
  });
  revalidarCompetencia(id);
  return { ok: true, texto: "Competência fechada." };
}

/** Reabrir é de quem gere o setor: a competência fechada é a que vale para médias e conferência. */
export async function reabrirCompetenciaAction(_: EstadoDoDp2, fd: FormData): Promise<EstadoDoDp2> {
  const a = await acesso("dp2_competencia", "gerir");
  if (!a) return erro("Só quem gere o DP 2 reabre uma competência fechada.");
  const id = texto(fd, "competenciaId");
  const r0 = await competenciaEditavel(a, id);
  if ("erro" in r0) return erro(r0.erro!);
  if (r0.comp.situacao !== "FECHADA") return erro("A competência não está fechada.");
  const motivo = texto(fd, "motivo");
  if (motivo.length < 5) return erro("Diga por que está reabrindo.");
  await getPrisma().dp2Competencia.update({ where: { id }, data: { situacao: "CALCULADA", fechadaEm: null, fechadaPorId: null } });
  await logAudit({
    tenantId: a.tenantId,
    userId: a.userId,
    action: "folha.competencia_reaberta",
    entityType: "Dp2Competencia",
    entityId: id,
    metadata: { motivo },
  });
  revalidarCompetencia(id);
  return { ok: true, texto: "Competência reaberta." };
}

// ─── Eventos do mês ─────────────────────────────────────────────────────────

export async function lancarEventoAction(_: EstadoDoDp2, fd: FormData): Promise<EstadoDoDp2> {
  const a = await acesso("dp2_competencia", "agir");
  if (!a) return SEM_PERMISSAO;
  const competenciaId = texto(fd, "competenciaId");
  const r0 = await competenciaEditavel(a, competenciaId);
  if ("erro" in r0) return erro(r0.erro!);
  const comp = r0.comp;
  if (comp.situacao === "FECHADA") return erro("Competência fechada: reabra para lançar.");
  if (comp.tipo !== "MENSAL") return erro("Lançamentos variáveis são só da folha mensal.");

  const prisma = getPrisma();
  const personId = texto(fd, "personId");
  const pessoa = await prisma.person.findFirst({ where: { id: personId, tenantId: a.tenantId, currentCompanyId: comp.companyId }, select: { id: true, name: true } });
  if (!pessoa) return erro("Escolha um colaborador desta empresa.");
  const rubrica = await prisma.dp2Rubrica.findFirst({ where: { id: texto(fd, "rubricaId"), tenantId: a.tenantId, ativa: true } });
  if (!rubrica) return erro("Escolha a rubrica.");
  const lancavel = rubrica.papel ? ehPapel(rubrica.papel) && PAPEIS_LANCAVEIS.has(rubrica.papel) : rubrica.tipo !== "INFORMATIVA";
  if (!lancavel) return erro(`${rubrica.nome} é calculada pelo motor, não se lança.`);

  const porQuantidade = rubrica.papel !== null && rubrica.lancamento !== "VALOR";
  const quantidade = porQuantidade ? lerNumero(texto(fd, "quantidade")) : null;
  const valor = porQuantidade ? null : lerNumero(texto(fd, "valor"));
  if (porQuantidade && (quantidade === null || quantidade <= 0)) return erro(`Informe ${rubrica.lancamento === "HORAS" ? "as horas" : "os dias"}.`);
  if (!porQuantidade && (valor === null || valor <= 0)) return erro("Informe o valor.");

  const evento = await prisma.dp2Evento.create({
    data: { tenantId: a.tenantId, competenciaId, personId, rubricaId: rubrica.id, quantidade, valor, origem: "DP", observacao: texto(fd, "observacao").slice(0, 300) || null, criadoPorId: a.userId },
    select: { id: true },
  });
  // Lançamento novo deixa o cálculo velho: a competência volta a "aberta".
  if (comp.situacao === "CALCULADA") await prisma.dp2Competencia.update({ where: { id: competenciaId }, data: { situacao: "ABERTA" } });
  await logAudit({
    tenantId: a.tenantId,
    userId: a.userId,
    action: "folha.evento_lancado",
    entityType: "Dp2Evento",
    entityId: evento.id,
    metadata: { competenciaId, pessoa: pessoa.name, rubrica: rubrica.nome, quantidade, valor },
  });
  revalidarCompetencia(competenciaId);
  return { ok: true, texto: `${rubrica.nome} lançado para ${pessoa.name}.` };
}

/**
 * Tirar um lançamento da competência ainda aberta é correção do dia a dia (o
 * mesmo que o "rascunho não enviado" da regra de exclusão de 13/10/2026): o
 * lançamento ainda não virou folha fechada. Competência fechada não deixa.
 */
export async function removerEventoAction(_: EstadoDoDp2, fd: FormData): Promise<EstadoDoDp2> {
  const a = await acesso("dp2_competencia", "agir");
  if (!a) return SEM_PERMISSAO;
  const prisma = getPrisma();
  const evento = await prisma.dp2Evento.findFirst({ where: { id: texto(fd, "eventoId"), tenantId: a.tenantId }, include: { rubrica: { select: { nome: true } } } });
  if (!evento) return erro("Lançamento não encontrado.");
  const r0 = await competenciaEditavel(a, evento.competenciaId);
  if ("erro" in r0) return erro(r0.erro!);
  if (r0.comp.situacao === "FECHADA") return erro("Competência fechada: reabra para mexer nos lançamentos.");
  await prisma.$transaction([
    prisma.dp2Evento.delete({ where: { id: evento.id } }),
    ...(r0.comp.situacao === "CALCULADA" ? [prisma.dp2Competencia.update({ where: { id: r0.comp.id }, data: { situacao: "ABERTA" } })] : []),
  ]);
  await logAudit({
    tenantId: a.tenantId,
    userId: a.userId,
    action: "folha.evento_removido",
    entityType: "Dp2Competencia",
    entityId: evento.competenciaId,
    metadata: { rubrica: evento.rubrica.nome },
  });
  revalidarCompetencia(evento.competenciaId);
  return { ok: true, texto: "Lançamento retirado." };
}

// ─── Comparativo com a Domínio ──────────────────────────────────────────────

export async function importarComparativoAction(_: EstadoDoDp2, fd: FormData): Promise<EstadoDoDp2> {
  const a = await acesso("dp2_competencia", "agir");
  if (!a) return SEM_PERMISSAO;
  const competenciaId = texto(fd, "competenciaId");
  const r0 = await competenciaEditavel(a, competenciaId);
  if ("erro" in r0) return erro(r0.erro!);
  const lido = lerComparativo(texto(fd, "texto"));
  if (lido.linhas.length === 0) return erro(lido.erros[0] ?? "Cole as linhas da Domínio: CPF; proventos; descontos; líquido; INSS; IRRF; FGTS.");

  const prisma = getPrisma();
  const pessoas = await prisma.person.findMany({ where: { tenantId: a.tenantId, currentCompanyId: r0.comp.companyId }, select: { id: true, cpf: true } });
  const porCpf = new Map(pessoas.filter((p) => p.cpf).map((p) => [p.cpf!.replace(/\D/g, ""), p.id]));
  let gravadas = 0;
  const naoAchados: string[] = [];
  for (const l of lido.linhas) {
    const personId = porCpf.get(l.cpf);
    if (!personId) {
      naoAchados.push(l.cpf);
      continue;
    }
    const dados = { proventos: l.proventos, descontos: l.descontos, liquido: l.liquido, inss: l.inss, irrf: l.irrf, fgts: l.fgts, importadoPorId: a.userId, importadoEm: new Date() };
    await prisma.dp2Comparativo.upsert({
      where: { competenciaId_personId: { competenciaId, personId } },
      create: { tenantId: a.tenantId, competenciaId, personId, ...dados },
      update: dados,
    });
    gravadas++;
  }
  await logAudit({
    tenantId: a.tenantId,
    userId: a.userId,
    action: "folha.comparativo_importado",
    entityType: "Dp2Competencia",
    entityId: competenciaId,
    metadata: { gravadas, naoAchados: naoAchados.length },
  });
  revalidarCompetencia(competenciaId);
  const partes = [`${gravadas} pessoa(s) com os valores da Domínio.`];
  if (naoAchados.length) partes.push(`CPF não encontrado na empresa: ${naoAchados.slice(0, 5).join(", ")}${naoAchados.length > 5 ? "…" : ""}.`);
  if (lido.erros.length) partes.push(`${lido.erros.length} linha(s) ignorada(s).`);
  return { ok: gravadas > 0, texto: partes.join(" ") };
}

// ─── Contrato do colaborador ────────────────────────────────────────────────

const INSALUBRIDADES = ["NENHUM", "MINIMO", "MEDIO", "MAXIMO"];

export async function salvarVinculoAction(_: EstadoDoDp2, fd: FormData): Promise<EstadoDoDp2> {
  const a = await acesso("dp2_colaboradores", "agir");
  if (!a) return SEM_PERMISSAO;
  const prisma = getPrisma();
  const pessoa = await prisma.person.findFirst({
    where: { id: texto(fd, "personId"), tenantId: a.tenantId, isInternal: false },
    select: { id: true, name: true, currentCompanyId: true },
  });
  if (!pessoa?.currentCompanyId) return erro("Colaborador não encontrado em uma empresa cliente.");
  const recusa = await recusaDoFoco(a.ctx, [pessoa.currentCompanyId]);
  if (recusa) return erro(recusa);

  const salarioBase = lerNumero(texto(fd, "salarioBase"));
  if (salarioBase === null || salarioBase <= 0) return erro("Informe o salário.");
  const tipoSalario = texto(fd, "tipoSalario") === "HORISTA" ? "HORISTA" : "MENSAL";
  const horasMensais = lerInteiro(texto(fd, "horasMensais")) ?? 220;
  if (horasMensais < 1 || horasMensais > 300) return erro("Horas por mês entre 1 e 300.");
  const dependentesIrrf = lerInteiro(texto(fd, "dependentesIrrf")) ?? 0;
  const filhosSalarioFamilia = lerInteiro(texto(fd, "filhosSalarioFamilia")) ?? 0;
  if (dependentesIrrf < 0 || dependentesIrrf > 30 || filhosSalarioFamilia < 0 || filhosSalarioFamilia > 30) return erro("Confira dependentes e filhos.");
  const insalubridade = INSALUBRIDADES.includes(texto(fd, "insalubridade")) ? texto(fd, "insalubridade") : "NENHUM";

  const dados = {
    companyId: pessoa.currentCompanyId,
    salarioBase,
    tipoSalario,
    horasMensais,
    dependentesIrrf,
    filhosSalarioFamilia,
    insalubridade,
    periculosidade: marcado(fd, "periculosidade"),
    valeTransporte: marcado(fd, "valeTransporte"),
    aprendiz: marcado(fd, "aprendiz"),
    observacoes: texto(fd, "observacoes") || null,
    matricula: texto(fd, "matricula").slice(0, 30) || null,
    dadosEsocial: lerDadosEsocial({
      sexo: texto(fd, "esocial_sexo"),
      racaCor: texto(fd, "esocial_racaCor"),
      estadoCivil: texto(fd, "esocial_estadoCivil"),
      grauInstrucao: texto(fd, "esocial_grauInstrucao"),
      codigoMunicipio: texto(fd, "esocial_codigoMunicipio"),
      cbo: texto(fd, "esocial_cbo"),
      tipoContrato: texto(fd, "esocial_tipoContrato"),
      dataTermino: texto(fd, "esocial_dataTermino"),
      tipoJornada: texto(fd, "esocial_tipoJornada"),
      descricaoJornada: texto(fd, "esocial_descricaoJornada"),
    }),
    categoria: /^\d{3}$/.test(texto(fd, "categoria")) ? texto(fd, "categoria") : marcado(fd, "aprendiz") ? "103" : "101",
  };
  await prisma.dp2Vinculo.upsert({ where: { personId: pessoa.id }, create: { tenantId: a.tenantId, personId: pessoa.id, ...dados }, update: dados });
  await logAudit({
    tenantId: a.tenantId,
    userId: a.userId,
    action: "folha.vinculo_salvo",
    entityType: "Person",
    entityId: pessoa.id,
    metadata: { nome: pessoa.name, salarioBase, tipoSalario },
  });
  revalidatePath("/dp2/colaboradores");
  return { ok: true, texto: `Contrato de ${pessoa.name} salvo.` };
}

// ─── Configuração da empresa ────────────────────────────────────────────────

export async function salvarConfigDaEmpresaAction(_: EstadoDoDp2, fd: FormData): Promise<EstadoDoDp2> {
  const a = await acesso("dp2_configuracao", "agir");
  if (!a) return SEM_PERMISSAO;
  const companyId = texto(fd, "companyId");
  const recusa = await empresaDoEscritorio(a, companyId);
  if (recusa) return erro(recusa);
  const prisma = getPrisma();
  const convencaoId = texto(fd, "convencaoId") || null;
  if (convencaoId && !(await prisma.dp2Convencao.findFirst({ where: { id: convencaoId, tenantId: a.tenantId }, select: { id: true } }))) {
    return erro("Convenção não encontrada.");
  }
  const ratAliquota = lerNumero(texto(fd, "ratAliquota"));
  const fap = lerNumero(texto(fd, "fap"));
  const terceirosAliquota = lerNumero(texto(fd, "terceirosAliquota"));
  if (ratAliquota === null || ratAliquota < 0 || ratAliquota > 3) return erro("RAT entre 0% e 3%.");
  if (fap === null || fap < 0.5 || fap > 2) return erro("FAP entre 0,5 e 2.");
  if (terceirosAliquota === null || terceirosAliquota < 0 || terceirosAliquota > 10) return erro("Terceiros entre 0% e 10%.");
  const fpas = texto(fd, "fpas").replace(/\D/g, "");
  const codTercs = texto(fd, "codTercs").replace(/\D/g, "");
  const classTrib = texto(fd, "classTrib").replace(/\D/g, "");
  if (fpas && fpas.length !== 3) return erro("O FPAS tem 3 dígitos.");
  if (codTercs && codTercs.length !== 4) return erro("O código de terceiros tem 4 dígitos.");
  if (classTrib && classTrib.length !== 2) return erro("A classificação tributária tem 2 dígitos.");
  const dados = {
    convencaoId,
    patronalNoDas: marcado(fd, "patronalNoDas"),
    ratAliquota,
    fap,
    terceirosAliquota,
    fpas: fpas || null,
    codTercs: codTercs || null,
    classTrib: classTrib || null,
  };
  await prisma.dp2EmpresaConfig.upsert({ where: { companyId }, create: { tenantId: a.tenantId, companyId, ...dados }, update: dados });
  await logAudit({
    tenantId: a.tenantId,
    userId: a.userId,
    action: "folha.empresa_configurada",
    entityType: "Company",
    entityId: companyId,
    metadata: dados,
  });
  revalidatePath("/dp2/configuracao");
  return { ok: true, texto: "Configuração salva. Recalcule as competências abertas." };
}

/** Médico do PCMSO e responsável pelos registros ambientais (S-2220 e S-2240). */
export async function salvarResponsaveisDeSstAction(_: EstadoDoDp2, fd: FormData): Promise<EstadoDoDp2> {
  const a = await acesso("dp2_configuracao", "agir");
  if (!a) return SEM_PERMISSAO;
  const companyId = texto(fd, "companyId");
  const recusa = await empresaDoEscritorio(a, companyId);
  if (recusa) return erro(recusa);
  const campos = ["medicoNome", "medicoCpf", "medicoCrm", "medicoUf", "ambientalNome", "ambientalCpf", "ambientalOrgao", "ambientalOrgaoNome", "ambientalNumero", "ambientalUf"];
  const sst = lerResponsaveis(Object.fromEntries(campos.map((k) => [k, texto(fd, k)])));
  await getPrisma().dp2EmpresaConfig.upsert({ where: { companyId }, create: { tenantId: a.tenantId, companyId, sst }, update: { sst } });
  await logAudit({
    tenantId: a.tenantId,
    userId: a.userId,
    action: "folha.sst_responsaveis",
    entityType: "Company",
    entityId: companyId,
    metadata: { medico: sst.medicoNome, ambiental: sst.ambientalNome },
  });
  revalidatePath("/dp2/configuracao");
  return { ok: true, texto: "Responsáveis de saúde e segurança salvos. Gere de novo os eventos com pendência." };
}

// ─── Cadastros do escritório ────────────────────────────────────────────────

export async function salvarTabelaAction(_: EstadoDoDp2, fd: FormData): Promise<EstadoDoDp2> {
  const a = await acesso("dp2_tabelas", "gerir");
  if (!a) return erro("Só quem gere o DP 2 grava tabelas oficiais.");
  const tipo = texto(fd, "tipo") as TipoDeTabela;
  if (!TIPOS_DE_TABELA.includes(tipo)) return erro("Escolha a tabela.");
  const vigencia = texto(fd, "vigencia");
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(vigencia)) return erro("Informe a competência em que a tabela passa a valer.");

  // Faixas: uma por linha, "limite; alíquota; dedução" (o limite da última faixa do IRRF fica vazio).
  const faixas = texto(fd, "faixas")
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean)
    .map((l) => {
      const [ate, aliquota, deducao] = l.split(";").map((p) => lerNumero(p.trim()));
      return { ate, aliquota, deducao };
    });
  const bruto: Record<string, unknown> = {
    faixas,
    valor: lerNumero(texto(fd, "valor")),
    limite: lerNumero(texto(fd, "limite")),
    cota: lerNumero(texto(fd, "cota")),
    deducaoDependente: lerNumero(texto(fd, "deducaoDependente")),
    descontoSimplificado: lerNumero(texto(fd, "descontoSimplificado")),
    minimoRetencao: lerNumero(texto(fd, "minimoRetencao")) ?? 10,
  };
  if (tipo === "IRRF" && texto(fd, "reducaoIsentoAte")) {
    bruto.reducao = {
      isentoAte: lerNumero(texto(fd, "reducaoIsentoAte")),
      reducaoMaxima: lerNumero(texto(fd, "reducaoMaxima")),
      ate: lerNumero(texto(fd, "reducaoAte")),
      constante: lerNumero(texto(fd, "reducaoConstante")),
      fator: lerNumero(texto(fd, "reducaoFator")),
      noDecimo: marcado(fd, "reducaoNoDecimo"),
    };
  }
  const lido = lerDadosDaTabela(tipo, bruto);
  if (!lido.ok) return erro(lido.erro);
  const observacao = texto(fd, "observacao").slice(0, 500) || null;
  await getPrisma().dp2TabelaOficial.upsert({
    where: { tenantId_tipo_vigencia: { tenantId: a.tenantId, tipo, vigencia } },
    create: { tenantId: a.tenantId, tipo, vigencia, dados: lido.dados, observacao, criadaPorId: a.userId },
    update: { dados: lido.dados, observacao, criadaPorId: a.userId },
  });
  await logAudit({
    tenantId: a.tenantId,
    userId: a.userId,
    action: "folha.tabela_salva",
    entityType: "Dp2TabelaOficial",
    metadata: { tipo, vigencia },
  });
  revalidatePath("/dp2/tabelas");
  return { ok: true, texto: "Tabela gravada. Ela vale a partir da competência informada." };
}

export async function salvarRubricaAction(_: EstadoDoDp2, fd: FormData): Promise<EstadoDoDp2> {
  const a = await acesso("dp2_rubricas", "gerir");
  if (!a) return erro("Só quem gere o DP 2 mexe nas rubricas.");
  const prisma = getPrisma();
  const id = texto(fd, "id");
  const nome = texto(fd, "nome");
  if (nome.length < 2) return erro("Dê um nome à rubrica.");
  const comum = {
    nome: nome.slice(0, 120),
    naturezaEsocial: texto(fd, "naturezaEsocial").slice(0, 4) || null,
    contaDebito: texto(fd, "contaDebito").slice(0, 40) || null,
    contaCredito: texto(fd, "contaCredito").slice(0, 40) || null,
    codIncCP: /^\d{2}$/.test(texto(fd, "codIncCP")) ? texto(fd, "codIncCP") : null,
    codIncIRRF: /^\d{2}$/.test(texto(fd, "codIncIRRF")) ? texto(fd, "codIncIRRF") : null,
    codIncFGTS: /^\d{2}$/.test(texto(fd, "codIncFGTS")) ? texto(fd, "codIncFGTS") : null,
  };
  if (id) {
    const atual = await prisma.dp2Rubrica.findFirst({ where: { id, tenantId: a.tenantId } });
    if (!atual) return erro("Rubrica não encontrada.");
    // As do motor guardam tipo e incidências: são elas que a lei define.
    const livre = atual.papel === null;
    await prisma.dp2Rubrica.update({
      where: { id },
      data: {
        ...comum,
        ...(livre
          ? {
              tipo: TIPOS_DE_RUBRICA.includes(texto(fd, "tipo") as never) ? texto(fd, "tipo") : atual.tipo,
              incideInss: marcado(fd, "incideInss"),
              incideFgts: marcado(fd, "incideFgts"),
              incideIrrf: marcado(fd, "incideIrrf"),
              entraNaMedia: marcado(fd, "entraNaMedia"),
              ativa: marcado(fd, "ativa"),
            }
          : {}),
      },
    });
    await logAudit({
      tenantId: a.tenantId,
      userId: a.userId,
      action: "folha.rubrica_salva",
      entityType: "Dp2Rubrica",
      entityId: id,
      metadata: { nome },
    });
    revalidatePath("/dp2/rubricas");
    return { ok: true, texto: "Rubrica salva." };
  }

  const codigo = texto(fd, "codigo");
  if (!/^[0-9A-Za-z]{1,10}$/.test(codigo)) return erro("Código com até 10 letras ou números.");
  if (await prisma.dp2Rubrica.findFirst({ where: { tenantId: a.tenantId, codigo }, select: { id: true } })) return erro(`Já existe a rubrica ${codigo}.`);
  const tipo = texto(fd, "tipo");
  if (!TIPOS_DE_RUBRICA.includes(tipo as never) || tipo === "INFORMATIVA") return erro("Rubrica livre é provento ou desconto.");
  // Rubrica livre é sempre de valor: horas e dias só fazem sentido nas do
  // motor, que sabem transformar quantidade em dinheiro.
  const criada = await prisma.dp2Rubrica.create({
    data: {
      tenantId: a.tenantId,
      codigo,
      tipo,
      papel: null,
      lancamento: "VALOR",
      incideInss: marcado(fd, "incideInss"),
      incideFgts: marcado(fd, "incideFgts"),
      incideIrrf: marcado(fd, "incideIrrf"),
      entraNaMedia: marcado(fd, "entraNaMedia"),
      ...comum,
    },
    select: { id: true },
  });
  await logAudit({
    tenantId: a.tenantId,
    userId: a.userId,
    action: "folha.rubrica_salva",
    entityType: "Dp2Rubrica",
    entityId: criada.id,
    metadata: { nome, codigo },
  });
  revalidatePath("/dp2/rubricas");
  return { ok: true, texto: `Rubrica ${codigo} criada.` };
}

export async function salvarConvencaoAction(_: EstadoDoDp2, fd: FormData): Promise<EstadoDoDp2> {
  const a = await acesso("dp2_convencoes", "gerir");
  if (!a) return erro("Só quem gere o DP 2 mexe nas convenções.");
  const nome = texto(fd, "nome");
  if (nome.length < 3) return erro("Dê um nome à convenção.");
  const he50 = lerNumero(texto(fd, "he50")) ?? 50;
  const he100 = lerNumero(texto(fd, "he100")) ?? 100;
  const noturno = lerNumero(texto(fd, "noturno")) ?? 20;
  if (he50 < 50) return erro("Hora extra de no mínimo 50% (CF art. 7º, XVI).");
  if (noturno < 20) return erro("Adicional noturno de no mínimo 20% (CLT art. 73).");
  const dataBase = lerInteiro(texto(fd, "dataBase"));
  const data = {
    nome: nome.slice(0, 160),
    sindicato: texto(fd, "sindicato").slice(0, 160) || null,
    cnpjSindicato: texto(fd, "cnpjSindicato").replace(/\D/g, "").slice(0, 14) || null,
    dataBase: dataBase && dataBase >= 1 && dataBase <= 12 ? dataBase : null,
    vigenciaInicio: texto(fd, "vigenciaInicio") || null,
    vigenciaFim: texto(fd, "vigenciaFim") || null,
    piso: lerNumero(texto(fd, "piso")),
    he50,
    he100,
    noturno,
    observacoes: texto(fd, "observacoes") || null,
    // A caixa "Ativa" só existe na edição: sem ela (criação), nasce ativa.
    ativa: fd.has("temAtiva") ? marcado(fd, "ativa") : true,
  };
  const prisma = getPrisma();
  const id = texto(fd, "id");
  let entityId = id;
  if (id) {
    if (!(await prisma.dp2Convencao.findFirst({ where: { id, tenantId: a.tenantId }, select: { id: true } }))) return erro("Convenção não encontrada.");
    await prisma.dp2Convencao.update({ where: { id }, data });
  } else {
    entityId = (await prisma.dp2Convencao.create({ data: { tenantId: a.tenantId, ...data }, select: { id: true } })).id;
  }
  await logAudit({
    tenantId: a.tenantId,
    userId: a.userId,
    action: "folha.convencao_salva",
    entityType: "Dp2Convencao",
    entityId,
    metadata: { nome },
  });
  revalidatePath("/dp2/convencoes");
  return { ok: true, texto: id ? "Convenção salva." : "Convenção criada." };
}

// ─── eSocial (fase 3a, 12/11/2026): gerar e conferir, sem assinar e enviar ──

export async function gerarTabelasEsocialAction(_: EstadoDoDp2, fd: FormData): Promise<EstadoDoDp2> {
  const a = await acesso("dp2_esocial", "agir");
  if (!a) return SEM_PERMISSAO;
  const companyId = texto(fd, "companyId");
  const recusa = await empresaDoEscritorio(a, companyId);
  if (recusa) return erro(recusa);
  const iniValid = texto(fd, "iniValid");
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(iniValid)) return erro("Informe desde quando as tabelas valem.");
  const r = await gerarTabelas(a.tenantId, companyId, iniValid, a.userId);
  if (!r.ok) return erro(r.erro);
  await logAudit({
    tenantId: a.tenantId,
    userId: a.userId,
    action: "folha.esocial_tabelas",
    entityType: "Company",
    entityId: companyId,
    metadata: { iniValid, total: r.total, prontos: r.prontos },
  });
  revalidatePath("/dp2/esocial");
  return { ok: true, texto: `${r.total} evento(s) de tabela: ${r.prontos} pronto(s), ${r.comPendencia} com pendência.` };
}

export async function gerarPeriodicosEsocialAction(_: EstadoDoDp2, fd: FormData): Promise<EstadoDoDp2> {
  const a = await acesso("dp2_esocial", "agir");
  if (!a) return SEM_PERMISSAO;
  const competenciaId = texto(fd, "competenciaId");
  const comp = await getPrisma().dp2Competencia.findFirst({ where: { id: competenciaId, tenantId: a.tenantId }, select: { companyId: true } });
  if (!comp) return erro("Competência não encontrada.");
  const recusa = await recusaDoFoco(a.ctx, [comp.companyId]);
  if (recusa) return erro(recusa);
  const dtPgto = texto(fd, "dtPgto");
  const r = await gerarPeriodicos(a.tenantId, competenciaId, /^\d{4}-\d{2}-\d{2}$/.test(dtPgto) ? dtPgto : null, a.userId);
  if (!r.ok) return erro(r.erro);
  await logAudit({
    tenantId: a.tenantId,
    userId: a.userId,
    action: "folha.esocial_periodicos",
    entityType: "Dp2Competencia",
    entityId: competenciaId,
    metadata: { total: r.total, prontos: r.prontos },
  });
  revalidatePath("/dp2/esocial");
  return { ok: true, texto: `${r.total} evento(s) periódico(s): ${r.prontos} pronto(s), ${r.comPendencia} com pendência.` };
}

// ─── eSocial não periódicos (fase 3b, 12/11/2026) ───────────────────────────

/** A pessoa do evento: do escritório, de uma empresa cliente, dentro da faixa. */
async function pessoaDoEvento(a: Acesso, personId: string): Promise<{ id: string; name: string; companyId: string } | string> {
  const p = await getPrisma().person.findFirst({
    where: { id: personId, tenantId: a.tenantId, isInternal: false },
    select: { id: true, name: true, currentCompanyId: true },
  });
  if (!p?.currentCompanyId) return "Colaborador não encontrado.";
  const recusa = await recusaDoFoco(a.ctx, [p.currentCompanyId]);
  if (recusa) return recusa;
  return { id: p.id, name: p.name, companyId: p.currentCompanyId };
}

function respostaDoEvento(evento: string, nome: string, r: { ok: true; prontos: number } | { ok: false; erro: string }): EstadoDoDp2 {
  if (!r.ok) return erro(r.erro);
  revalidatePath("/dp2/esocial");
  return { ok: true, texto: r.prontos ? `${evento} de ${nome} pronto.` : `${evento} de ${nome} gerado com pendência: veja o que falta na tela do eSocial.` };
}

export async function gerarAdmissaoAction(_: EstadoDoDp2, fd: FormData): Promise<EstadoDoDp2> {
  const a = await acesso("dp2_esocial", "agir");
  if (!a) return SEM_PERMISSAO;
  const p = await pessoaDoEvento(a, texto(fd, "personId"));
  if (typeof p === "string") return erro(p);
  const r = await gerarAdmissao(a.tenantId, p.id, a.userId);
  await logAudit({
    tenantId: a.tenantId,
    userId: a.userId,
    action: "folha.esocial_admissao",
    entityType: "Person",
    entityId: p.id,
    metadata: { nome: p.name },
  });
  return respostaDoEvento("S-2200", p.name, r);
}

export async function gerarAlteracaoAction(_: EstadoDoDp2, fd: FormData): Promise<EstadoDoDp2> {
  const a = await acesso("dp2_esocial", "agir");
  if (!a) return SEM_PERMISSAO;
  const p = await pessoaDoEvento(a, texto(fd, "personId"));
  if (typeof p === "string") return erro(p);
  const data = texto(fd, "dataAlteracao");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(data)) return erro("Informe a data em que a alteração vale.");
  const r = await gerarAlteracao(a.tenantId, p.id, data, texto(fd, "descricao") || null, a.userId);
  await logAudit({
    tenantId: a.tenantId,
    userId: a.userId,
    action: "folha.esocial_alteracao",
    entityType: "Person",
    entityId: p.id,
    metadata: { nome: p.name, data },
  });
  return respostaDoEvento("S-2206", p.name, r);
}

export async function gerarAfastamentoAction(_: EstadoDoDp2, fd: FormData): Promise<EstadoDoDp2> {
  const a = await acesso("dp2_esocial", "agir");
  if (!a) return SEM_PERMISSAO;
  const p = await pessoaDoEvento(a, texto(fd, "personId"));
  if (typeof p === "string") return erro(p);
  const motivo = (texto(fd, "motivoOutro") || texto(fd, "motivo")).replace(/\D/g, "").padStart(2, "0").slice(-2);
  const inicio = texto(fd, "inicio");
  const fim = texto(fd, "fim");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(inicio)) return erro("Informe o início do afastamento.");
  const r = await gerarAfastamento(
    a.tenantId,
    p.id,
    { motivo, inicio, fim: /^\d{4}-\d{2}-\d{2}$/.test(fim) ? fim : null, observacao: texto(fd, "observacao") || null },
    a.userId
  );
  await logAudit({
    tenantId: a.tenantId,
    userId: a.userId,
    action: "folha.esocial_afastamento",
    entityType: "Person",
    entityId: p.id,
    metadata: { nome: p.name, motivo, inicio },
  });
  return respostaDoEvento("S-2230", p.name, r);
}

const ehData = (v: string) => (/^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null);

export async function gerarAsoAction(_: EstadoDoDp2, fd: FormData): Promise<EstadoDoDp2> {
  const a = await acesso("dp2_esocial", "agir");
  if (!a) return SEM_PERMISSAO;
  const p = await pessoaDoEvento(a, texto(fd, "personId"));
  if (typeof p === "string") return erro(p);
  const data = ehData(texto(fd, "dataAso"));
  if (!data) return erro("Informe a data do ASO.");
  const r = await gerarAso(
    a.tenantId,
    p.id,
    {
      tipoExame: texto(fd, "tipoExame"),
      data,
      resultado: texto(fd, "resultado") === "2" ? "2" : "1",
      procedimentos: lerProcedimentos(texto(fd, "procedimentos")),
      medicoNome: texto(fd, "medicoNome") || null,
      medicoCrm: texto(fd, "medicoCrm").replace(/\D/g, "") || null,
      medicoUf: texto(fd, "medicoUf").toUpperCase() || null,
    },
    a.userId
  );
  await logAudit({
    tenantId: a.tenantId,
    userId: a.userId,
    action: "folha.esocial_aso",
    entityType: "Person",
    entityId: p.id,
    metadata: { nome: p.name, tipoExame: texto(fd, "tipoExame"), data },
  });
  return respostaDoEvento("S-2220", p.name, r);
}

export async function gerarCondicaoAmbientalAction(_: EstadoDoDp2, fd: FormData): Promise<EstadoDoDp2> {
  const a = await acesso("dp2_esocial", "agir");
  if (!a) return SEM_PERMISSAO;
  const p = await pessoaDoEvento(a, texto(fd, "personId"));
  if (typeof p === "string") return erro(p);
  const inicio = ehData(texto(fd, "inicioCondicao"));
  if (!inicio) return erro("Informe desde quando vale a condição.");
  const epc = (k: string) => (["0", "1", "2"].includes(texto(fd, k)) ? texto(fd, k) : "0");
  const r = await gerarCondicaoAmbiental(
    a.tenantId,
    p.id,
    {
      inicio,
      setor: texto(fd, "setor") || null,
      atividade: texto(fd, "atividade") || null,
      agentes: lerAgentes(texto(fd, "agentes")),
      usaEpc: epc("usaEpc"),
      usaEpi: epc("usaEpi"),
    },
    a.userId
  );
  await logAudit({
    tenantId: a.tenantId,
    userId: a.userId,
    action: "folha.esocial_ambiente",
    entityType: "Person",
    entityId: p.id,
    metadata: { nome: p.name, inicio },
  });
  return respostaDoEvento("S-2240", p.name, r);
}

export async function gerarCatAction(_: EstadoDoDp2, fd: FormData): Promise<EstadoDoDp2> {
  const a = await acesso("dp2_esocial", "agir");
  if (!a) return SEM_PERMISSAO;
  const p = await pessoaDoEvento(a, texto(fd, "personId"));
  if (typeof p === "string") return erro(p);
  const dataAcidente = ehData(texto(fd, "dataAcidente"));
  if (!dataAcidente) return erro("Informe a data do acidente.");
  const ou = (k: string) => texto(fd, k) || null;
  const r = await gerarCat(
    a.tenantId,
    p.id,
    {
      dataAcidente,
      horaAcidente: ou("horaAcidente"),
      horasTrabalhadasAntes: ou("horasTrabalhadasAntes"),
      tipoAcidente: texto(fd, "tipoAcidente"),
      obito: marcado(fd, "obito"),
      comunicouPolicia: marcado(fd, "comunicouPolicia"),
      situacaoGeradora: ou("situacaoGeradora"),
      ultimoDiaTrabalhado: ehData(texto(fd, "ultimoDiaTrabalhado")) ?? dataAcidente,
      houveAfastamento: marcado(fd, "houveAfastamento"),
      localDescricao: ou("localDescricao"),
      localLogradouro: ou("localLogradouro"),
      localNumero: ou("localNumero"),
      localCep: ou("localCep"),
      localMunicipio: ou("localMunicipio"),
      localUf: texto(fd, "localUf").toUpperCase() || null,
      parteAtingida: ou("parteAtingida"),
      lateralidade: ["0", "1", "2", "3"].includes(texto(fd, "lateralidade")) ? texto(fd, "lateralidade") : "0",
      agenteCausador: ou("agenteCausador"),
      dataAtendimento: ehData(texto(fd, "dataAtendimento")),
      horaAtendimento: ou("horaAtendimento"),
      internacao: marcado(fd, "internacao"),
      diasDeTratamento: lerInteiro(texto(fd, "diasDeTratamento")),
      naturezaDaLesao: ou("naturezaDaLesao"),
      cid: ou("cid"),
      emitenteNome: ou("emitenteNome"),
      emitenteCrm: ou("emitenteCrm"),
      emitenteUf: texto(fd, "emitenteUf").toUpperCase() || null,
      observacao: ou("observacaoCat"),
    },
    a.userId
  );
  await logAudit({
    tenantId: a.tenantId,
    userId: a.userId,
    action: "folha.esocial_cat",
    entityType: "Person",
    entityId: p.id,
    metadata: { nome: p.name, dataAcidente },
  });
  return respostaDoEvento("S-2210", p.name, r);
}

const MOTIVOS_DE_RESCISAO = Object.keys(MOTIVO_LABEL) as MotivoCanonico[];

/** O S-2299 com os mesmos parâmetros do cálculo da tela de Rescisões. */
export async function gerarDesligamentoAction(_: EstadoDoDp2, fd: FormData): Promise<EstadoDoDp2> {
  const a = await acesso("dp2_esocial", "agir");
  if (!a) return erro("Ligue o módulo eSocial do DP 2 para gerar o desligamento.");
  const p = await pessoaDoEvento(a, texto(fd, "personId"));
  if (typeof p === "string") return erro(p);
  const data = texto(fd, "desligamento");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(data)) return erro("Informe o último dia trabalhado.");
  const motivo = texto(fd, "motivo") as MotivoCanonico;
  if (!MOTIVOS_DE_RESCISAO.includes(motivo)) return erro("Escolha o motivo do desligamento.");
  const aviso = texto(fd, "aviso") === "TRABALHADO" ? "TRABALHADO" : texto(fd, "aviso") === "DISPENSADO" ? "DISPENSADO" : "INDENIZADO";
  const r = await gerarDesligamento(
    a.tenantId,
    p.id,
    {
      motivo,
      data,
      aviso,
      vencidos: Math.max(0, Math.min(2, lerInteiro(texto(fd, "vencidos")) ?? 0)),
      faltas: lerInteiro(texto(fd, "faltas")) ?? 0,
      saldoFgts: lerNumero(texto(fd, "saldoFgts")),
      adiantado: lerNumero(texto(fd, "adiantado")) ?? 0,
    },
    a.userId
  );
  await logAudit({
    tenantId: a.tenantId,
    userId: a.userId,
    action: "folha.esocial_desligamento",
    entityType: "Person",
    entityId: p.id,
    metadata: { nome: p.name, data, motivo },
  });
  return respostaDoEvento("S-2299", p.name, r);
}
