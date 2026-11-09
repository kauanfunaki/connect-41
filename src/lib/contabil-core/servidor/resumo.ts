import "server-only";

// O banco do Contábil Core (Fase 1, 09/11/2026). Toda consulta leva o tenant;
// quem chama já passou pelo gate do módulo (`abrirTelaDoModulo` nas telas,
// `podeNoModulo` nas ações). Os motores puros moram em `../motor`.

import { getPrisma } from "@/lib/prisma";

export type ResumoDoContabilCore = { empresas: number; transacoes: number };

/** Quantas empresas e transações vivas o escritório já tem no Contábil Core. */
export async function resumoDoContabilCore(tenantId: string): Promise<ResumoDoContabilCore> {
  const prisma = getPrisma();
  const [empresas, transacoes] = await Promise.all([
    prisma.coreEmpresa.count({ where: { tenantId, deletedAt: null } }),
    prisma.coreTransacao.count({ where: { tenantId, deletedAt: null } }),
  ]);
  return { empresas, transacoes };
}
