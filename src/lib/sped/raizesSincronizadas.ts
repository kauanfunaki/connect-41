// As raízes de CNPJ que o SPED sincroniza (14/10/2026).
//
// ─── A regra até 14/10/2026 ─────────────────────────────────────────────────
//
// `sincronizarTenant` lia os clientes do escritório (`ClientGroup`) que estão
// ativos e têm a raiz preenchida, ficava com as de 8 caracteres e tirava as
// repetidas. A tela do CT-e (`raizesDoAlcance`) usava a mesma conta.
//
// ─── Desde 14/10/2026 ───────────────────────────────────────────────────────
//
// O Cliente está saindo do Connect, e a decisão do Kauan (13/10) foi manter
// **exatamente** as raízes de hoje — sem ampliar para todas as empresas — até
// o plano do SPED substituir. A migration `20261014210000_portal_por_empresa`
// fotografa, na tabela `sped_sync_roots`, as raízes que a regra antiga dava
// (`fotografiaDasRaizes` é o espelho dela em TypeScript), e a sincronização
// passa a ler da fotografia. Cliente novo não entra sozinho na busca, e
// inativar um cliente não tira a raiz dele.
//
// A volta para a regra antiga, sem a tabela, saiu em 21/10/2026 com o
// Cliente (etapa 3): a tabela existe em produção desde 15/10. A regra antiga e
// o espelho da migration ficam na história do git (commit a7d260b).

import { getPrisma } from "@/lib/prisma";

/** A raiz é usável? 8 caracteres — a chave de contribuinte do lado do SPED. */
function raizValida(r: string | null | undefined): r is string {
  return !!r && r.length === 8;
}

/** As raízes da fotografia, como a sincronização as lê. */
export function raizesDaFotografia(linhas: readonly { cnpjRaiz: string }[]): string[] {
  return [...new Set(linhas.map((l) => l.cnpjRaiz).filter(raizValida))];
}

/** As raízes que o SPED sincroniza neste escritório. */
export async function raizesSincronizadas(tenantId: string): Promise<string[]> {
  const linhas = await getPrisma().spedSyncRoot.findMany({ where: { tenantId }, select: { cnpjRaiz: true }, orderBy: { cnpjRaiz: "asc" } });
  return raizesDaFotografia(linhas);
}
