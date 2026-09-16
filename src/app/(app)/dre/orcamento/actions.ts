"use server";

// Orçamento: criar versão (vazia, cópia de outra versão ou do realizado de um
// ano), salvar a grade, aprovar e reabrir.
//
// Editar e criar é de quem atua no setor; **aprovar e reabrir, só da
// coordenação** (`canManageSector`) — a aprovada é o número contra o qual o
// cliente vai ser comparado. Toda escrita de mais de uma linha é transação, e
// toda mudança de estado é um `updateMany` condicionado ao estado lido.

import { revalidatePath } from "next/cache";
import { getPrisma } from "@/lib/prisma";
import { getAuthContext, canActOnSector, canManageSector } from "@/lib/auth/context";
import { isModuleEnabled, setorDoModulo } from "@/lib/modules";
import { getModuleDef } from "@/lib/module-catalog";
import { logAudit } from "@/lib/audit";
import { isPrismaUniqueError } from "@/lib/prismaErrors";
import { centavosDeDecimal } from "@/lib/dre/data";
import { decimalDeCentavos } from "@/lib/financeiro/manual";
import { competenciaDe } from "@/lib/financeiro/periodo";
import { serieEconomica } from "@/lib/dre/dataEconomica";
import {
  gradeVazia,
  gradeDeLinhas,
  linhasDaGrade,
  lerGrade,
  lerReajuste,
  copiarComReajuste,
  gradeDoRealizado,
  type Grade,
} from "@/lib/dre/orcamento/grade";
import { planoDeAprovacao, podeEditarVersao, podeReabrir, validarNomeDaVersao, lerAno } from "@/lib/dre/orcamento/versoes";
import { MODULO_DE_ORCAMENTO } from "@/lib/dre/orcamento/dados";

const MODULE = MODULO_DE_ORCAMENTO;

export type ResultadoDoOrcamento = { error: string } | { ok: true; budgetId?: string };

/** Erro de regra dentro da transação: volta tudo e vira mensagem. */
class Recusa extends Error {}

async function contexto() {
  const ctx = await getAuthContext();
  if (!ctx.tenantId) return { ok: false as const, erro: "Não autenticado." };
  const setor = (await setorDoModulo(ctx.tenantId, MODULE)) ?? getModuleDef(MODULE)!.sectorCode;
  if (!canActOnSector(ctx, setor)) return { ok: false as const, erro: "Sem permissão no orçamento." };
  if (!(await isModuleEnabled(ctx.tenantId, MODULE))) return { ok: false as const, erro: "Módulo de orçamento não habilitado." };
  return {
    ok: true as const,
    ctx,
    tenantId: ctx.tenantId,
    userId: ctx.userId || null,
    coordena: canManageSector(ctx, setor),
    prisma: getPrisma(),
  };
}

// O orçado aparece na DRE econômica e nas análises.
function revalidar() {
  for (const p of ["/dre/orcamento", "/dre/economica", "/dre/analises"]) revalidatePath(p);
}

function texto(formData: FormData, k: string): string {
  return String(formData.get(k) ?? "").trim();
}

function linhasParaGravar(budgetId: string, grade: Grade) {
  return linhasDaGrade(grade).map((l) => ({ budgetId, groupCode: l.groupCode, month: l.month, amount: decimalDeCentavos(l.centavos) }));
}

/**
 * Cria uma versão em rascunho.
 *
 * - **vazia** — grade zerada;
 * - **copia** — outra versão da mesma empresa (de qualquer ano), com reajuste;
 * - **realizado** — a DRE econômica de cada mês de um ano anterior, com reajuste
 *   (`gradeDoRealizado`). Lê a empresa inteira, sem filtro de centro: o
 *   orçamento é por empresa.
 */
export async function criarVersao(formData: FormData): Promise<ResultadoDoOrcamento> {
  const c = await contexto();
  if (!c.ok) return { error: c.erro };
  if (!c.userId) return { error: "Sessão sem usuário — entre de novo." };

  const companyId = texto(formData, "companyId");
  const empresa = await c.prisma.company.findFirst({ where: { id: companyId, tenantId: c.tenantId }, select: { id: true } });
  if (!empresa) return { error: "Empresa não encontrada." };

  const ano = lerAno(texto(formData, "ano"));
  if (!ano) return { error: "Ano inválido." };
  const nome = validarNomeDaVersao(texto(formData, "nome"));
  if (!nome.ok) return { error: nome.erro };
  const reajuste = lerReajuste(texto(formData, "reajuste"));
  if (!reajuste.ok) return { error: reajuste.erro };

  const origem = texto(formData, "origem");
  let grade: Grade;
  let detalhe: Record<string, unknown> = { origem };
  if (origem === "copia") {
    const origemId = texto(formData, "versaoOrigemId");
    const fonte = await c.prisma.budget.findFirst({
      where: { id: origemId, tenantId: c.tenantId, companyId },
      select: { id: true, lines: { select: { groupCode: true, month: true, amount: true } } },
    });
    if (!fonte) return { error: "Escolha a versão de origem desta empresa." };
    grade = copiarComReajuste(
      gradeDeLinhas(fonte.lines.map((l) => ({ groupCode: l.groupCode, month: l.month, centavos: centavosDeDecimal(l.amount) }))),
      reajuste.pct
    );
    detalhe = { origem, versaoOrigemId: fonte.id, reajuste: reajuste.pct };
  } else if (origem === "realizado") {
    const anoOrigem = lerAno(texto(formData, "anoOrigem"));
    if (!anoOrigem) return { error: "Ano do realizado inválido." };
    const competencias = Array.from({ length: 12 }, (_, i) => competenciaDe(anoOrigem, i + 1));
    const serie = await serieEconomica(c.tenantId, companyId, competencias);
    grade = gradeDoRealizado(
      competencias.map((comp) => serie.get(comp)?.resultado.porGrupo ?? null),
      reajuste.pct
    );
    detalhe = { origem, anoOrigem, reajuste: reajuste.pct };
  } else if (origem === "vazia" || origem === "") {
    grade = gradeVazia();
    detalhe = { origem: "vazia" };
  } else {
    return { error: "Origem da versão inválida." };
  }

  let budgetId: string;
  try {
    budgetId = await c.prisma.$transaction(async (tx) => {
      const criado = await tx.budget.create({
        data: { tenantId: c.tenantId, companyId, year: ano, name: nome.nome, status: "RASCUNHO", createdById: c.userId! },
        select: { id: true },
      });
      const linhas = linhasParaGravar(criado.id, grade);
      if (linhas.length > 0) await tx.budgetLine.createMany({ data: linhas });
      return criado.id;
    });
  } catch (err) {
    if (isPrismaUniqueError(err)) return { error: `Já existe a versão "${nome.nome}" em ${ano} nesta empresa.` };
    throw err;
  }

  await logAudit({
    tenantId: c.tenantId,
    userId: c.ctx.userId,
    action: "dre.budget.created",
    entityType: "Budget",
    entityId: budgetId,
    metadata: { companyId, ano, nome: nome.nome, ...detalhe },
  });
  revalidar();
  return { ok: true, budgetId };
}

/**
 * Grava a grade inteira de um rascunho.
 *
 * Condicionado a **rascunho e ao `updatedAt` que a tela leu**: se outra pessoa
 * salvou (ou a coordenação aprovou) enquanto esta editava, nada é gravado e a
 * tela pede para recarregar — em vez de a última gravação apagar a anterior sem
 * ninguém ver. As linhas são substituídas por inteiro na mesma transação.
 */
export async function salvarGrade(formData: FormData): Promise<ResultadoDoOrcamento> {
  const c = await contexto();
  if (!c.ok) return { error: c.erro };

  const budgetId = texto(formData, "budgetId");
  const lidoEm = new Date(texto(formData, "lidoEm"));
  if (Number.isNaN(lidoEm.getTime())) return { error: "Recarregue a tela antes de salvar." };

  const versao = await c.prisma.budget.findFirst({
    where: { id: budgetId, tenantId: c.tenantId },
    select: { id: true, status: true, companyId: true, year: true, name: true },
  });
  if (!versao) return { error: "Versão não encontrada." };
  const editavel = podeEditarVersao(versao.status);
  if (!editavel.pode) return { error: editavel.motivo };

  const lida = lerGrade([...formData.entries()].map(([k, v]) => [k, String(v)] as [string, string]));
  if (!lida.ok) return { error: lida.erro };

  try {
    await c.prisma.$transaction(async (tx) => {
      const marcado = await tx.budget.updateMany({
        where: { id: budgetId, tenantId: c.tenantId, status: "RASCUNHO", updatedAt: lidoEm },
        data: { updatedAt: new Date() },
      });
      if (marcado.count !== 1) throw new Recusa("Esta versão mudou depois que você abriu (outra gravação ou aprovação) — recarregue a tela.");
      await tx.budgetLine.deleteMany({ where: { budgetId } });
      const linhas = linhasParaGravar(budgetId, lida.grade);
      if (linhas.length > 0) await tx.budgetLine.createMany({ data: linhas });
    });
  } catch (err) {
    if (err instanceof Recusa) return { error: err.message };
    throw err;
  }

  await logAudit({
    tenantId: c.tenantId,
    userId: c.ctx.userId,
    action: "dre.budget.saved",
    entityType: "Budget",
    entityId: budgetId,
    metadata: { companyId: versao.companyId, ano: versao.year, nome: versao.name, celulas: linhasDaGrade(lida.grade).length },
  });
  revalidar();
  return { ok: true, budgetId };
}

/**
 * Aprova um rascunho e devolve a aprovada anterior do mesmo ano a rascunho,
 * numa transação — só uma aprovada por empresa e ano (`planoDeAprovacao`).
 *
 * O rebaixamento **não** usa a lista de ids lida: é um `updateMany` por
 * condição (mesma empresa e ano, APROVADO, outra versão), que no InnoDB é
 * leitura com trava da versão mais recente. Duas aprovações simultâneas de
 * versões diferentes não deixam duas aprovadas: a segunda espera a primeira
 * terminar, encontra a primeira já aprovada e a rebaixa. Rebaixar pela lista
 * lida no início perderia justamente a aprovação que aconteceu no meio.
 */
export async function aprovarVersao(budgetId: string): Promise<ResultadoDoOrcamento> {
  const c = await contexto();
  if (!c.ok) return { error: c.erro };
  if (!c.coordena) return { error: "Só a coordenação aprova orçamento." };

  const versao = await c.prisma.budget.findFirst({
    where: { id: budgetId, tenantId: c.tenantId },
    select: { id: true, companyId: true, year: true, name: true },
  });
  if (!versao) return { error: "Versão não encontrada." };

  let rebaixadas: string[];
  try {
    rebaixadas = await c.prisma.$transaction(async (tx) => {
      const doAno = await tx.budget.findMany({
        where: { tenantId: c.tenantId, companyId: versao.companyId, year: versao.year },
        select: { id: true, status: true },
      });
      const plano = planoDeAprovacao(doAno, budgetId);
      if (!plano.ok) throw new Recusa(plano.motivo);
      await tx.budget.updateMany({
        where: { tenantId: c.tenantId, companyId: versao.companyId, year: versao.year, status: "APROVADO", id: { not: budgetId } },
        data: { status: "RASCUNHO", approvedAt: null, approvedById: null },
      });
      const aprovada = await tx.budget.updateMany({
        where: { id: budgetId, tenantId: c.tenantId, status: "RASCUNHO" },
        data: { status: "APROVADO", approvedAt: new Date(), approvedById: c.userId },
      });
      if (aprovada.count !== 1) throw new Recusa("Esta versão acabou de mudar — recarregue a tela.");
      return plano.rebaixar;
    });
  } catch (err) {
    if (err instanceof Recusa) return { error: err.message };
    throw err;
  }

  await logAudit({
    tenantId: c.tenantId,
    userId: c.ctx.userId,
    action: "dre.budget.approved",
    entityType: "Budget",
    entityId: budgetId,
    metadata: { companyId: versao.companyId, ano: versao.year, nome: versao.name, voltaramARascunho: rebaixadas },
  });
  revalidar();
  return { ok: true, budgetId };
}

/** Reabre a aprovada: volta a rascunho, e o ano fica sem orçamento aprovado. */
export async function reabrirVersao(budgetId: string): Promise<ResultadoDoOrcamento> {
  const c = await contexto();
  if (!c.ok) return { error: c.erro };
  if (!c.coordena) return { error: "Só a coordenação reabre orçamento aprovado." };

  const versao = await c.prisma.budget.findFirst({
    where: { id: budgetId, tenantId: c.tenantId },
    select: { id: true, status: true, companyId: true, year: true, name: true },
  });
  if (!versao) return { error: "Versão não encontrada." };
  const veredito = podeReabrir(versao.status);
  if (!veredito.pode) return { error: veredito.motivo };

  const r = await c.prisma.budget.updateMany({
    where: { id: budgetId, tenantId: c.tenantId, status: "APROVADO" },
    data: { status: "RASCUNHO", approvedAt: null, approvedById: null },
  });
  if (r.count !== 1) return { error: "Esta versão acabou de mudar — recarregue a tela." };

  await logAudit({
    tenantId: c.tenantId,
    userId: c.ctx.userId,
    action: "dre.budget.reopened",
    entityType: "Budget",
    entityId: budgetId,
    metadata: { companyId: versao.companyId, ano: versao.year, nome: versao.name },
  });
  revalidar();
  return { ok: true, budgetId };
}
