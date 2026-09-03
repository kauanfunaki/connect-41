// Quem pode ver quais documentos fiscais.
//
// Isto existe como TIPO, e não como um `where` montado em cada tela, porque o
// acervo tem dois leitores com direitos opostos: a equipe do escritório, que vê
// o tenant inteiro, e o cliente no portal, que só pode ver as empresas dele.
//
// A regra que o protótipo aprendeu e que se porta direto: **o alcance é o
// primeiro argumento de toda consulta**. Esquecer o filtro deixa de ser um bug
// silencioso de vazamento e vira erro de compilação, porque não existe função de
// leitura que não o receba.
//
// O caso perigoso é o cliente sem empresa nenhuma. Um `where` montado por
// concatenação produziria uma cláusula vazia — que no SQL significa "tudo". Aqui
// ele resolve para "nada", que é o que a palavra significa.

import type { Prisma } from "@/generated/prisma/client";

export type AlcanceFiscal =
  /** Equipe do escritório: todas as empresas do tenant. */
  | { tipo: "TENANT"; tenantId: string }
  /**
   * Cliente no portal: só as empresas listadas.
   *
   * A lista vem resolvida de fora (do `ClientGroup` do usuário do portal) em vez
   * de ser derivada aqui, para esta camada não precisar saber o que é um grupo
   * de cliente — e para o dia em que houver um segundo jeito de escopar.
   */
  | { tipo: "EMPRESAS"; tenantId: string; companyIds: string[] };

/**
 * Cláusula `where` do alcance. É por aqui que toda consulta começa.
 *
 * `{ id: { in: [] } }` no Prisma vira `IN ()`, que não casa com nada — é o
 * "nada" explícito. Devolver `{}` para lista vazia daria acesso total, e essa é
 * exatamente a troca que este módulo não pode errar.
 */
export function whereDoAlcance(alcance: AlcanceFiscal): Prisma.FiscalDocumentWhereInput {
  if (alcance.tipo === "TENANT") return { tenantId: alcance.tenantId };
  return {
    tenantId: alcance.tenantId,
    companyId: { in: alcance.companyIds },
  };
}

/**
 * O alcance alcança esta empresa?
 *
 * Serve à escrita, que a cláusula de leitura não cobre: subir um XML para uma
 * empresa fora do alcance seria gravar dado onde não se pode nem ler.
 */
export function alcancaEmpresa(alcance: AlcanceFiscal, companyId: string): boolean {
  if (alcance.tipo === "TENANT") return true;
  return alcance.companyIds.includes(companyId);
}

/** Alcance que não vê nada — cliente de portal sem empresa vinculada. */
export function alcanceVazio(tenantId: string): AlcanceFiscal {
  return { tipo: "EMPRESAS", tenantId, companyIds: [] };
}
