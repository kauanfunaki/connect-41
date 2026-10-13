"use server";

import { revalidatePath } from "next/cache";
import { getPrisma } from "@/lib/prisma";
import { getAuthContext } from "@/lib/auth/context";
import { logAudit } from "@/lib/audit";
import { grupoDeTexto } from "@/lib/dre/mapeamento";
import { grupoAceitaOrigem } from "@/lib/dre/estrutura";
import { SEM_CATEGORIA } from "@/lib/dre/calculo";
import { podeAbrirADre } from "@/lib/dre/acesso";
import { ondeDaEmpresa, padraoAntesDaEmpresa } from "@/lib/financeiro/planoDeContas";
import {
  MAX_NOME_DA_CATEGORIA,
  categoriaComONome,
  criarCategoriaNoPlanoDaEmpresa,
  nomeDaCategoria,
} from "@/lib/financeiro/categoriaDaEmpresa";

export type AcaoDoDre = { error: string } | { success: true } | null;

type Contexto = {
  ok: true;
  ctx: Awaited<ReturnType<typeof getAuthContext>>;
  tenantId: string;
  prisma: ReturnType<typeof getPrisma>;
};

async function contexto(companyId: string): Promise<Contexto | { ok: false; erro: string }> {
  const ctx = await getAuthContext();
  if (!ctx.tenantId) return { ok: false, erro: "Não autenticado" };
  // A régua da tela (13/10/2026): quem não abre a DRE não classifica nela. Era
  // só o setor, sem conferir se o módulo está ligado — a tela respondia 404 e
  // a ação, chamada direto, passava.
  if (!(await podeAbrirADre(ctx))) return { ok: false, erro: "Sem permissão no DRE." };
  const tenantId = ctx.tenantId;

  const prisma = getPrisma();
  const empresa = await prisma.company.findFirst({
    where: { id: companyId, tenantId },
    select: { id: true },
  });
  if (!empresa) return { ok: false, erro: "Empresa não encontrada." };

  return { ok: true, ctx, tenantId, prisma };
}

/** A exceção da empresa: "nesta empresa, esta categoria entra neste grupo". */
async function gravarExcecao(c: Contexto, companyId: string, categoryId: string, grupo: string): Promise<void> {
  await c.prisma.dreCategoryMapping.upsert({
    where: { companyId_categoryId: { companyId, categoryId } },
    create: { tenantId: c.tenantId, companyId, categoryId, grupo },
    update: { grupo },
  });

  await logAudit({
    tenantId: c.tenantId,
    userId: c.ctx.userId,
    action: "dre.map",
    entityType: "Company",
    entityId: companyId,
    metadata: { categoryId, grupo },
  });
}

/**
 * Classifica uma categoria no DRE desta empresa.
 *
 * Grava **exceção**, e não padrão: o padrão vive no plano de contas e tem tela
 * própria. Classificar aqui é dizer "nesta empresa é assim", que é a pergunta
 * que a fila de não classificados faz.
 */
export async function classificarCategoria(
  companyId: string,
  categoryId: string,
  grupo: string
): Promise<AcaoDoDre> {
  const c = await contexto(companyId);
  if (!c.ok) return { error: c.erro };

  // Valida contra a estrutura, não contra o banco: grupo inventado sairia do
  // relatório sem somar em linha nenhuma, que é o mesmo que sumir.
  const valido = grupoDeTexto(grupo);
  if (!valido) return { error: "Grupo do DRE desconhecido." };

  const categoria = await c.prisma.financeCategory.findFirst({
    where: { id: categoryId, ...ondeDaEmpresa(c.tenantId, companyId, { apenasAtivas: false, incluirOcultas: true }) },
    select: { id: true },
  });
  if (!categoria) return { error: "Categoria não encontrada." };

  await gravarExcecao(c, companyId, categoryId, valido);

  revalidatePath("/dre");
  return { success: true };
}

/**
 * Classifica uma categoria que veio no arquivo do Omie e que o plano de contas
 * da empresa não tem (13/10/2026).
 *
 * A fila mostrava essas linhas com "classifique na ficha dele" e nenhum
 * controle — e a ficha não existia: na fonte import a linha traz só o **nome**
 * da categoria, e sem categoria com esse nome no plano não havia o que mapear.
 *
 * Aqui:
 * - se o plano já tem uma categoria com o mesmo nome, ignorando caixa, acento
 *   e espaço (a chave do de-para), é ela que recebe o grupo — como exceção da
 *   empresa, igual a `classificarCategoria`;
 * - senão, a categoria nasce no **plano da empresa** (o de Fornecedores e
 *   sacados › Plano de contas), pela mesma regra do botão "Nova categoria",
 *   já com o grupo escolhido — é a linha da DRE dela.
 */
export async function classificarCategoriaDoArquivo(
  companyId: string,
  nome: string,
  origem: "pagamento" | "recebimento",
  grupo: string
): Promise<AcaoDoDre> {
  const c = await contexto(companyId);
  if (!c.ok) return { error: c.erro };

  const valido = grupoDeTexto(grupo);
  if (!valido) return { error: "Grupo do DRE desconhecido." };
  if (origem !== "pagamento" && origem !== "recebimento") return { error: "Lado do lançamento desconhecido." };
  // A fila só oferece os grupos do lado certo; a conferência aqui é para quem
  // chamar direto. Grupo do outro lado deixaria o valor na fila do mesmo jeito.
  if (!grupoAceitaOrigem(valido, origem)) {
    return { error: origem === "pagamento" ? "Esse grupo é de recebimento, e este valor foi pago." : "Esse grupo é de pagamento, e este valor foi recebido." };
  }
  if (nome.trim() === SEM_CATEGORIA) {
    return { error: "Essas linhas vieram sem categoria no arquivo do Omie. Classifique no Omie e importe o mês de novo." };
  }
  const limpo = nomeDaCategoria(nome);
  if (!limpo) {
    return { error: `O nome da categoria passa de ${MAX_NOME_DA_CATEGORIA} caracteres. Encurte no Omie e importe o mês de novo.` };
  }

  // Só nome que está num arquivo importado desta empresa: a ação cria
  // categoria no plano, e não pode virar porta para criar qualquer nome.
  const doArquivo = await c.prisma.dreImportLine.findFirst({
    where: { categoria: nome.trim(), dreImport: { tenantId: c.tenantId, companyId } },
    select: { id: true },
  });
  if (!doArquivo) return { error: "Essa categoria não está em nenhum arquivo importado desta empresa." };

  const kind = origem === "pagamento" ? "PAGAR" : "RECEBER";
  const existentes = await c.prisma.financeCategory.findMany({
    where: ondeDaEmpresa(c.tenantId, companyId, { apenasAtivas: false, incluirOcultas: true }),
    select: { id: true, name: true, kind: true, companyId: true },
  });
  const existente = categoriaComONome(padraoAntesDaEmpresa(existentes), limpo, kind);
  if (existente) {
    await gravarExcecao(c, companyId, existente.id, valido);
    revalidatePath("/dre");
    return { success: true };
  }

  const criada = await criarCategoriaNoPlanoDaEmpresa(c.prisma, {
    tenantId: c.tenantId,
    companyId,
    userId: c.ctx.userId,
    nome: limpo,
    kind,
    planGroup: null,
    dreGroup: valido,
    origem: "dre",
  });
  if ("error" in criada) return { error: criada.error };

  // A categoria nova aparece no plano da empresa e nas duas DREs.
  for (const p of ["/dre", "/dre/economica", "/cadastros-financeiros"]) revalidatePath(p);
  return { success: true };
}

/** Remove a exceção — a categoria volta a seguir o plano de contas. */
export async function voltarAoPadrao(companyId: string, categoryId: string): Promise<AcaoDoDre> {
  const c = await contexto(companyId);
  if (!c.ok) return { error: c.erro };

  await c.prisma.dreCategoryMapping.deleteMany({ where: { companyId, categoryId } });

  await logAudit({
    tenantId: c.tenantId,
    userId: c.ctx.userId,
    action: "dre.unmap",
    entityType: "Company",
    entityId: companyId,
    metadata: { categoryId },
  });

  revalidatePath("/dre");
  return { success: true };
}
