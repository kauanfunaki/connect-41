// O prazo gravado para cobrar o órgão do protocolo parado (lote 5,
// 28/10/2026). Separado de ./protocoloParado.ts, que é só regra e vai para o
// navegador junto com a tela: este lê o banco.
//
// A leitura nunca derruba o agendador: sem a tabela (deploy antes da
// migration) ou com o banco recusando, vale o padrão.

import { getPrisma } from "@/lib/prisma";
import { isPrismaMissingTableError } from "@/lib/prismaErrors";
import { COBRAR_APOS_DIAS_PADRAO, lerDiasDaCobranca } from "./protocoloParado";

/** O prazo do escritório. Nunca lança. */
export async function diasParaCobrarOProtocolo(tenantId: string): Promise<number> {
  try {
    const linha = await getPrisma().tenantSocietarioConfig.findUnique({ where: { tenantId }, select: { cobrarProtocoloAposDias: true } });
    return lerDiasDaCobranca(linha?.cobrarProtocoloAposDias ?? null) ?? COBRAR_APOS_DIAS_PADRAO;
  } catch (err) {
    if (!isPrismaMissingTableError(err)) console.error("[societário] leitura do prazo de cobrança do protocolo", err);
    return COBRAR_APOS_DIAS_PADRAO;
  }
}
