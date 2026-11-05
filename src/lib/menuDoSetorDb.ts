// A leitura da ordem do menu de um setor (05/11/2026, "Organizar menu"). A
// regra mora em `menuDoSetor.ts`; aqui, só a consulta e o "falhou, ordem padrão".

import { cache } from "react";
import { getPrisma } from "@/lib/prisma";
import { lerOrdemDoMenu, ORDEM_PADRAO, type OrdemDoMenu } from "@/lib/menuDoSetor";

/**
 * A ordem do menu do setor neste escritório; sem linha, a padrão. Uma consulta
 * por requisição (`cache`). Nunca derruba o menu: erro (inclusive a tabela
 * ainda não existir, deploy antes da migration) vira a ordem padrão.
 */
export const lerOrdemDoMenuDoSetor = cache(
  async (tenantId: string, sectorCode: string): Promise<{ ordem: OrdemDoMenu; personalizada: boolean; disponivel: boolean }> => {
    if (!tenantId || !sectorCode) return { ordem: ORDEM_PADRAO, personalizada: false, disponivel: false };
    try {
      const linha = await getPrisma().sectorMenuOrder.findUnique({
        where: { tenantId_sectorCode: { tenantId, sectorCode } },
        select: { ordem: true },
      });
      const ordem = lerOrdemDoMenu(linha?.ordem);
      return { ordem, personalizada: ordem.grupos.length > 0 || ordem.telas.length > 0, disponivel: true };
    } catch (err) {
      console.error("[menu] ordem do setor", err);
      return { ordem: ORDEM_PADRAO, personalizada: false, disponivel: false };
    }
  },
);
