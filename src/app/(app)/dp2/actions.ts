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
import { importarEventos, podeImportar, type RubricaParaImportar } from "@/lib/dp2/importacaoDeEventos";
import { DIAS_DO_LINK, gerarRemessaDaCompetencia, guardarHoleritesNosArquivos, novoToken } from "@/lib/dp2/saidas";
import { CAMPOS_DAS_CONTAS } from "@/lib/dp2/contabilizacao";
import type { EstadoDoDp2 } from "@/components/dp2/Formulario";
import { gerarPeriodicos, gerarTabelas } from "@/lib/dp2/esocial/servidor";

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

/** Banco, agência e conta digitados (só dígitos; o dígito verificador à parte). */
function contaBancaria(fd: FormData) {
  const banco = texto(fd, "bancoCodigo").replace(/\D/g, "");
  return {
    bancoCodigo: banco ? banco.padStart(3, "0").slice(-3) : null,
    agencia: texto(fd, "agencia").replace(/\D/g, "").slice(0, 10) || null,
    agenciaDigito: texto(fd, "agenciaDigito").toUpperCase().slice(0, 2) || null,
    conta: texto(fd, "conta").replace(/\D/g, "").slice(0, 20) || null,
    contaDigito: texto(fd, "contaDigito").toUpperCase().slice(0, 2) || null,
  };
}

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
    categoria: /^\d{3}$/.test(texto(fd, "categoria")) ? texto(fd, "categoria") : marcado(fd, "aprendiz") ? "103" : "101",
    ...contaBancaria(fd),
    tipoConta: texto(fd, "tipoConta") === "POUPANCA" ? "POUPANCA" : "CORRENTE",
  };
  if (dados.bancoCodigo && !/^\d{3}$/.test(dados.bancoCodigo)) return erro("O banco é o código de 3 dígitos (ex.: 341).");
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
    ...contaBancaria(fd),
    convenio: texto(fd, "convenio").slice(0, 20) || null,
  };
  if (dados.bancoCodigo && !/^\d{3}$/.test(dados.bancoCodigo)) return erro("O banco é o código de 3 dígitos (ex.: 341).");
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

// ─── Fase 2 (12/11/2026): eventos importados, link do cliente e saídas ──────

function paraImportar(r: { id: string; codigo: string; nome: string; tipo: string; papel: string | null; lancamento: string; ativa: boolean }): RubricaParaImportar {
  return {
    id: r.id,
    codigo: r.codigo,
    nome: r.nome,
    tipo: r.tipo as RubricaParaImportar["tipo"],
    papel: ehPapel(r.papel) ? r.papel : null,
    lancamento: r.lancamento as RubricaParaImportar["lancamento"],
    ativa: r.ativa,
  };
}

/**
 * Eventos colados de uma planilha ou do relatório do Pontomais. Com "trocar",
 * os lançamentos da mesma origem que já estavam na competência saem antes:
 * colar o relatório de novo não duplica as horas.
 */
export async function importarEventosAction(_: EstadoDoDp2, fd: FormData): Promise<EstadoDoDp2> {
  const a = await acesso("dp2_competencia", "agir");
  if (!a) return SEM_PERMISSAO;
  const competenciaId = texto(fd, "competenciaId");
  const r0 = await competenciaEditavel(a, competenciaId);
  if ("erro" in r0) return erro(r0.erro!);
  if (r0.comp.situacao === "FECHADA") return erro("Competência fechada: reabra para lançar.");
  if (r0.comp.tipo !== "MENSAL") return erro("Lançamentos variáveis são só da folha mensal.");
  const origem = texto(fd, "origem") === "PONTO" ? "PONTO" : "PLANILHA";

  const prisma = getPrisma();
  const [rubricas, pessoas] = await Promise.all([
    prisma.dp2Rubrica.findMany({ where: { tenantId: a.tenantId } }),
    prisma.person.findMany({
      where: { tenantId: a.tenantId, currentCompanyId: r0.comp.companyId, isInternal: false, dp2Vinculo: { isNot: null } },
      select: { id: true, name: true, cpf: true },
    }),
  ]);
  const lido = importarEventos(
    texto(fd, "texto"),
    rubricas.map(paraImportar).filter(podeImportar),
    pessoas.map((p) => ({ id: p.id, nome: p.name, cpf: p.cpf }))
  );
  if (lido.eventos.length === 0) return erro(lido.avisos[0] ?? "Nenhum evento encontrado no texto colado.");

  const trocar = marcado(fd, "trocar");
  await prisma.$transaction([
    ...(trocar ? [prisma.dp2Evento.deleteMany({ where: { tenantId: a.tenantId, competenciaId, origem } })] : []),
    prisma.dp2Evento.createMany({
      data: lido.eventos.map((e) => ({
        tenantId: a.tenantId,
        competenciaId,
        personId: e.personId,
        rubricaId: e.rubricaId,
        quantidade: e.quantidade,
        valor: e.valor,
        origem,
        criadoPorId: a.userId,
      })),
    }),
    ...(r0.comp.situacao === "CALCULADA" ? [prisma.dp2Competencia.update({ where: { id: competenciaId }, data: { situacao: "ABERTA" } })] : []),
  ]);
  await logAudit({
    tenantId: a.tenantId,
    userId: a.userId,
    action: "folha.eventos_importados",
    entityType: "Dp2Competencia",
    entityId: competenciaId,
    metadata: { origem, eventos: lido.eventos.length, trocou: trocar, avisos: lido.avisos.length },
  });
  revalidarCompetencia(competenciaId);
  const ignoradas = lido.colunas.filter((c) => !c.rubrica).map((c) => c.cabecalho);
  const partes = [`${lido.eventos.length} lançamento(s) importado(s).`];
  if (ignoradas.length) partes.push(`Colunas ignoradas: ${ignoradas.join(", ")}.`);
  if (lido.avisos.length) partes.push(lido.avisos.slice(0, 3).join(" "));
  return { ok: true, texto: partes.join(" ") };
}

/** O link para o cliente informar os eventos do mês sem login. Um aberto por competência: pedir de novo cancela o anterior. */
export async function pedirEventosAoClienteAction(_: EstadoDoDp2, fd: FormData): Promise<EstadoDoDp2> {
  const a = await acesso("dp2_competencia", "agir");
  if (!a) return SEM_PERMISSAO;
  const competenciaId = texto(fd, "competenciaId");
  const r0 = await competenciaEditavel(a, competenciaId);
  if ("erro" in r0) return erro(r0.erro!);
  if (r0.comp.situacao === "FECHADA" || r0.comp.tipo !== "MENSAL") return erro("O link é para a folha mensal ainda aberta.");
  const prisma = getPrisma();
  const pedido = await prisma.$transaction(async (tx) => {
    await tx.dp2PedidoDeEventos.updateMany({ where: { tenantId: a.tenantId, competenciaId, situacao: "ABERTO" }, data: { situacao: "CANCELADO" } });
    return tx.dp2PedidoDeEventos.create({
      data: { tenantId: a.tenantId, competenciaId, token: novoToken(), expiraEm: new Date(Date.now() + DIAS_DO_LINK * 86_400_000), criadoPorId: a.userId },
      select: { id: true },
    });
  });
  await logAudit({
    tenantId: a.tenantId,
    userId: a.userId,
    action: "folha.pedido_de_eventos",
    entityType: "Dp2Competencia",
    entityId: competenciaId,
    metadata: { pedidoId: pedido.id },
  });
  revalidarCompetencia(competenciaId);
  return { ok: true, texto: `Link criado. Copie e mande ao cliente (vale por ${DIAS_DO_LINK} dias).` };
}

export async function cancelarPedidoDeEventosAction(_: EstadoDoDp2, fd: FormData): Promise<EstadoDoDp2> {
  const a = await acesso("dp2_competencia", "agir");
  if (!a) return SEM_PERMISSAO;
  const prisma = getPrisma();
  const pedido = await prisma.dp2PedidoDeEventos.findFirst({ where: { id: texto(fd, "pedidoId"), tenantId: a.tenantId } });
  if (!pedido) return erro("Link não encontrado.");
  const r0 = await competenciaEditavel(a, pedido.competenciaId);
  if ("erro" in r0) return erro(r0.erro!);
  if (pedido.situacao !== "ABERTO") return erro("O link já não está aberto.");
  await prisma.dp2PedidoDeEventos.update({ where: { id: pedido.id }, data: { situacao: "CANCELADO" } });
  await logAudit({
    tenantId: a.tenantId,
    userId: a.userId,
    action: "folha.pedido_cancelado",
    entityType: "Dp2Competencia",
    entityId: pedido.competenciaId,
  });
  revalidarCompetencia(pedido.competenciaId);
  return { ok: true, texto: "Link cancelado: quem abrir verá que ele não vale mais." };
}

export async function guardarHoleritesAction(_: EstadoDoDp2, fd: FormData): Promise<EstadoDoDp2> {
  const a = await acesso("dp2_competencia", "agir");
  if (!a) return SEM_PERMISSAO;
  const competenciaId = texto(fd, "competenciaId");
  const r0 = await competenciaEditavel(a, competenciaId);
  if ("erro" in r0) return erro(r0.erro!);
  const r = await guardarHoleritesNosArquivos(a.tenantId, competenciaId, a.userId);
  if (!r.ok) return erro(r.erro);
  await logAudit({
    tenantId: a.tenantId,
    userId: a.userId,
    action: "folha.holerites_guardados",
    entityType: "Dp2Competencia",
    entityId: competenciaId,
  });
  revalidatePath("/arquivos");
  return { ok: true, texto: r.texto };
}

export async function gerarRemessaAction(_: EstadoDoDp2, fd: FormData): Promise<EstadoDoDp2> {
  const a = await acesso("dp2_competencia", "agir");
  if (!a) return SEM_PERMISSAO;
  const competenciaId = texto(fd, "competenciaId");
  const r0 = await competenciaEditavel(a, competenciaId);
  if ("erro" in r0) return erro(r0.erro!);
  const data = texto(fd, "dataPagamento");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(data)) return erro("Informe a data do pagamento.");
  const r = await gerarRemessaDaCompetencia(a.tenantId, competenciaId, data, a.userId);
  if (!r.ok) return erro(r.erro);
  await logAudit({
    tenantId: a.tenantId,
    userId: a.userId,
    action: "folha.remessa_gerada",
    entityType: "Dp2Competencia",
    entityId: competenciaId,
    metadata: { remessaId: r.id, dataPagamento: data },
  });
  revalidarCompetencia(competenciaId);
  return { ok: true, texto: r.texto };
}

export async function salvarContasDaFolhaAction(_: EstadoDoDp2, fd: FormData): Promise<EstadoDoDp2> {
  const a = await acesso("dp2_rubricas", "gerir");
  if (!a) return erro("Só quem gere o DP 2 mexe nas contas da folha.");
  const contas = Object.fromEntries(CAMPOS_DAS_CONTAS.map((c) => [c.chave, texto(fd, c.chave).slice(0, 40)]));
  await getPrisma().dp2ContasDaFolha.upsert({ where: { tenantId: a.tenantId }, create: { tenantId: a.tenantId, contas }, update: { contas } });
  await logAudit({
    tenantId: a.tenantId,
    userId: a.userId,
    action: "folha.contas_salvas",
    entityType: "Dp2Rubrica",
    metadata: contas,
  });
  revalidatePath("/dp2/rubricas");
  return { ok: true, texto: "Contas da folha salvas." };
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
