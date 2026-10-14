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
// Sem a tabela (código antes da migration), a leitura cai na regra antiga —
// que, até a migration rodar, dá o mesmo conjunto.

import { getPrisma } from "@/lib/prisma";
import { isPrismaMissingTableError } from "@/lib/prismaErrors";

/** Um cliente como a regra antiga o lia. */
export type ClienteComRaiz = { tenantId: string; cnpjRoot: string | null; active: boolean };

/** A raiz é usável? 8 caracteres — a chave de contribuinte do lado do SPED. */
function raizValida(r: string | null | undefined): r is string {
  return !!r && r.length === 8;
}

/** A regra até 14/10/2026: as raízes dos clientes ativos do escritório, sem repetir. */
export function raizesPelosClientes(clientes: readonly Omit<ClienteComRaiz, "tenantId">[]): string[] {
  return [...new Set(clientes.filter((c) => c.active).map((c) => c.cnpjRoot).filter(raizValida))];
}

/**
 * O que a migration grava em `sped_sync_roots`: por escritório, as raízes que
 * a regra antiga dava. O espelho do terceiro INSERT da migration
 * `20261014210000` — os testes conferem que, para os mesmos clientes, o
 * conjunto de cada escritório não cresce nem encolhe.
 */
export function fotografiaDasRaizes(clientes: readonly ClienteComRaiz[]): { tenantId: string; cnpjRaiz: string }[] {
  const vistas = new Set<string>();
  const saida: { tenantId: string; cnpjRaiz: string }[] = [];
  for (const c of clientes) {
    if (!c.active || !raizValida(c.cnpjRoot)) continue;
    const chave = `${c.tenantId}:${c.cnpjRoot}`;
    if (vistas.has(chave)) continue;
    vistas.add(chave);
    saida.push({ tenantId: c.tenantId, cnpjRaiz: c.cnpjRoot });
  }
  return saida;
}

/** As raízes da fotografia, como a sincronização as lê. */
export function raizesDaFotografia(linhas: readonly { cnpjRaiz: string }[]): string[] {
  return [...new Set(linhas.map((l) => l.cnpjRaiz).filter(raizValida))];
}

/** As raízes que o SPED sincroniza neste escritório. */
export async function raizesSincronizadas(tenantId: string): Promise<string[]> {
  const prisma = getPrisma();
  try {
    const linhas = await prisma.spedSyncRoot.findMany({ where: { tenantId }, select: { cnpjRaiz: true }, orderBy: { cnpjRaiz: "asc" } });
    return raizesDaFotografia(linhas);
  } catch (err) {
    if (!isPrismaMissingTableError(err)) throw err;
    console.error("[sped] tabela das raízes ainda não existe — migration pendente; usando os clientes", err);
    const clientes = await prisma.clientGroup.findMany({
      where: { tenantId, active: true, cnpjRoot: { not: null } },
      select: { cnpjRoot: true, active: true },
    });
    return raizesPelosClientes(clientes);
  }
}
