// A leitura de projeto que as portas de entrada do financeiro compartilham. A
// regra é pura e mora em `projeto.ts`; aqui só a busca.

import { getPrisma } from "@/lib/prisma";
import { projetoDoLancamento } from "./projeto";

/** O projeto informado num lançamento, conferido no banco — com `tenantId` no `where`. */
export async function projetoInformado(p: {
  tenantId: string;
  companyId: string;
  informadoId: string | null;
  atualId?: string | null;
}): Promise<{ ok: true; projetoId: string | null } | { ok: false; erro: string }> {
  const projeto = p.informadoId
    ? await getPrisma().financeProject.findFirst({
        where: { id: p.informadoId, tenantId: p.tenantId },
        select: { id: true, companyId: true, active: true },
      })
    : null;
  return projetoDoLancamento({ companyId: p.companyId, informadoId: p.informadoId, projeto, atualId: p.atualId });
}

/** Projetos ativos de uma empresa, para os seletores. Inativo não se escolhe. */
export async function projetosAtivosDaEmpresa(tenantId: string, companyId: string): Promise<{ id: string; nome: string }[]> {
  const projetos = await getPrisma().financeProject.findMany({
    where: { tenantId, companyId, active: true },
    select: { id: true, name: true },
    orderBy: { name: "asc" },
  });
  return projetos.map((p) => ({ id: p.id, nome: p.name }));
}
