// Acesso a banco da hierarquia matriz→filial. Separado de
// `companyHierarchy.ts` para que a regra pura continue testável sem Prisma.

import { getPrisma } from "@/lib/prisma";
import { criaCiclo } from "@/lib/companyHierarchy";
import { nomeExibicao } from "@/lib/companyName";

/**
 * Empresas que podem ser matriz de `excludeId`, para o `<select>` do cadastro.
 *
 * Tira a própria empresa da lista — apontar para si mesma é o ciclo mais curto
 * que existe. Não tenta tirar a descendência aqui: a lista teria de percorrer a
 * árvore inteira a cada abertura do formulário, e quem barra o caso é a guarda
 * de ciclo no submit, que é onde o dado de fato entra.
 */
export async function getMatrizOptions(
  tenantId: string,
  excludeId?: string
): Promise<{ value: string; label: string }[]> {
  const prisma = getPrisma();
  const empresas = await prisma.company.findMany({
    where: { tenantId, ...(excludeId ? { id: { not: excludeId } } : {}) },
    orderBy: { name: "asc" },
    select: { id: true, name: true, displayName: true, cnpj: true },
  });
  return empresas.map((e) => ({
    value: e.id,
    // O CNPJ no rótulo não é enfeite: matriz e filial costumam ter razão social
    // idêntica, e sem ele o select fica com duas linhas iguais.
    label: e.cnpj ? `${nomeExibicao(e)} — ${e.cnpj}` : nomeExibicao(e),
  }));
}

/**
 * Confere que `novaMatrizId` é do mesmo tenant e que o vínculo não fecha um
 * ciclo. Devolve a mensagem de erro, ou `null` quando está tudo certo.
 *
 * Ciclo aqui não é hipótese acadêmica: basta A virar filial de B e, depois, B
 * virar filial de A. A listagem percorre a árvore e ficaria em laço infinito.
 */
export async function validarMatriz(
  tenantId: string,
  empresaId: string | null,
  novaMatrizId: string | null
): Promise<string | null> {
  if (!novaMatrizId) return null;

  const prisma = getPrisma();
  const matriz = await prisma.company.findFirst({
    where: { id: novaMatrizId, tenantId },
    select: { id: true },
  });
  if (!matriz) return "Empresa matriz não encontrada.";

  // Na criação não há como fechar ciclo: a empresa ainda não existe para ser
  // ancestral de ninguém.
  if (!empresaId) return null;

  const todas = await prisma.company.findMany({
    where: { tenantId },
    select: { id: true, parentCompanyId: true },
  });
  const matrizDe = new Map(todas.map((c) => [c.id, c.parentCompanyId]));

  return criaCiclo(empresaId, novaMatrizId, matrizDe)
    ? "Essa empresa não pode ser matriz: o vínculo criaria um ciclo."
    : null;
}
