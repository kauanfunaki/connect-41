// A troca do modelo do DRE de uma empresa no banco (21/10/2026): ler o que a
// regra pura precisa (`restauracaoPorArea.ts`) e gravar o plano. A permissão e
// a auditoria ficam na ação (`src/app/(app)/dre/actions.ts`).

import type { PrismaClient } from "@/generated/prisma/client";
import { ondeDaEmpresa } from "@/lib/financeiro/planoDeContas";
import { MODELO_PADRAO, modeloDoCodigo, type ModeloDoDre } from "@/lib/dre/estrutura";
import { ACOES_DO_HISTORICO, historicoDosRegistros, planejarTrocaDeModelo, type PlanoDaTroca } from "@/lib/dre/restauracaoPorArea";

/** O plano da troca da empresa para o modelo pedido. Só lê. */
export async function planoDaTrocaDaEmpresa(
  prisma: PrismaClient,
  tenantId: string,
  companyId: string,
  para: ModeloDoDre
): Promise<PlanoDaTroca> {
  const [empresa, categorias, excecoes] = await Promise.all([
    prisma.company.findFirst({ where: { id: companyId, tenantId }, select: { dreModelo: true } }),
    prisma.financeCategory.findMany({
      where: ondeDaEmpresa(tenantId, companyId, { apenasAtivas: false, incluirOcultas: true }),
      select: { id: true, name: true, kind: true, dreGroup: true, companyId: true },
    }),
    prisma.dreCategoryMapping.findMany({ where: { tenantId, companyId }, select: { categoryId: true, grupo: true } }),
  ]);
  // O histórico: o que a fila, o plano da empresa, o do escritório, as
  // correções e as trocas anteriores gravaram — do mais novo para o mais velho.
  const registros = await prisma.auditLog.findMany({
    where: {
      tenantId,
      OR: [
        { entityType: "Company", entityId: companyId, action: { in: [ACOES_DO_HISTORICO.classificacao, ACOES_DO_HISTORICO.modelo] } },
        {
          entityType: "FinanceCategory",
          entityId: { in: categorias.map((x) => x.id) },
          action: {
            in: [
              ACOES_DO_HISTORICO.linhaNaEmpresa,
              ACOES_DO_HISTORICO.criadaNaEmpresa,
              ACOES_DO_HISTORICO.correcao,
              ACOES_DO_HISTORICO.criadaNoEscritorio,
              ACOES_DO_HISTORICO.alteradaNoEscritorio,
            ],
          },
        },
      ],
    },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    select: { action: true, entityId: true, metadata: true },
  });

  const excecao = new Map(excecoes.map((e) => [e.categoryId, e.grupo]));
  return planejarTrocaDeModelo(
    categorias.map((x) => ({
      id: x.id,
      nome: x.name,
      kind: x.kind,
      daEmpresa: x.companyId !== null,
      dreGroup: x.dreGroup,
      excecao: excecao.get(x.id) ?? null,
    })),
    historicoDosRegistros(registros, companyId),
    modeloDoCodigo(empresa?.dreModelo),
    para
  );
}

/** Grava o plano numa transação: o modelo da empresa e a classificação refeita. */
export async function aplicarTrocaDeModelo(prisma: PrismaClient, tenantId: string, companyId: string, plano: PlanoDaTroca): Promise<void> {
  await prisma.$transaction(async (tx) => {
    // Vazio é o padrão: a coluna só guarda o customizado.
    await tx.company.updateMany({
      where: { id: companyId, tenantId },
      data: { dreModelo: plano.para === MODELO_PADRAO.codigo ? null : plano.para },
    });
    for (const g of plano.gravacoes) {
      if (g.tipo === "excecao") {
        await tx.dreCategoryMapping.upsert({
          where: { companyId_categoryId: { companyId, categoryId: g.categoryId } },
          create: { tenantId, companyId, categoryId: g.categoryId, grupo: g.grupo },
          update: { grupo: g.grupo },
        });
      } else if (g.tipo === "remover_excecao") {
        await tx.dreCategoryMapping.deleteMany({ where: { tenantId, companyId, categoryId: g.categoryId } });
      } else {
        // Só a categoria do plano desta empresa: a do escritório é de todas.
        await tx.financeCategory.updateMany({ where: { id: g.categoryId, tenantId, companyId }, data: { dreGroup: g.grupo } });
      }
    }
  });
}
