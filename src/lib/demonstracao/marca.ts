// A marca dos dados de demonstração do Connect (15/10/2026).
//
// Tudo o que os scripts de demonstração gravam na produção
// (scripts/dados-de-demonstracao.ts, scripts/demo-recrutamento-41.ts) pendura
// em empresas com o prefixo "[demo]" no nome — é por ele que a limpeza acha o
// que apagar.
//
// Os avisos automáticos (src/lib/alerts.ts e o lembrete de pendência por
// e-mail) usam o mesmo prefixo para deixar essas empresas de fora: sem isso, a
// conta fictícia que vence hoje vira push para o setor de verdade, e cada conta
// futura da demonstração avisa de novo no dia em que vence, até alguém limpar.

import type { Prisma } from "@/generated/prisma/client";

export const MARCA_DA_DEMONSTRACAO = "[demo]";

/**
 * Filtro de empresa para o Prisma: só as de verdade. `Company.name` nunca é
 * nulo, então o NOT não esconde nenhuma empresa sem nome.
 */
export const SO_EMPRESA_DE_VERDADE = {
  NOT: { name: { startsWith: MARCA_DA_DEMONSTRACAO } },
} satisfies Prisma.CompanyWhereInput;

export function ehEmpresaDeDemonstracao(nome: string): boolean {
  return nome.startsWith(MARCA_DA_DEMONSTRACAO);
}
