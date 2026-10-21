// A leitura do banco para o menu Geral por setor (14/10/2026). As regras moram
// em `menuGeral.ts`; aqui, só a consulta e o "falhou, mostra tudo".

import { cache } from "react";
import { getPrisma } from "@/lib/prisma";
import { isFullAccess } from "@/lib/auth/papeis";
import type { AuthContext } from "@/lib/auth/context";
import {
  lerPreferenciasDoMenuGeral,
  setoresQueDecidemOGeral,
  telasDoGeralVisiveis,
  type TelaDoGeral,
} from "@/lib/menuGeral";

export type OcultasDoGeral = {
  /** Escolhas salvas para esconder; setor sem linha recebe os padrões. */
  porSetor: Record<string, TelaDoGeral[]>;
  /** Escolhas explícitas para mostrar itens que ficam escondidos por padrão. */
  visiveisPorSetor: Record<string, TelaDoGeral[]>;
  /**
   * `false` quando o banco não respondeu — inclusive a tabela ainda não existir
   * (deploy antes da migration). O menu segue usando os padrões; a tela de
   * configuração usa isto para avisar que não consegue salvar.
   */
  disponivel: boolean;
};

/**
 * As telas escondidas por setor neste escritório. Uma consulta por requisição
 * (`cache`): o layout, a página e o tutorial pedem a mesma coisa.
 *
 * Nunca derruba a tela: qualquer erro vira os padrões de visibilidade do menu.
 */
export const lerOcultasDoGeral = cache(async (tenantId: string): Promise<OcultasDoGeral> => {
  if (!tenantId) return { porSetor: {}, visiveisPorSetor: {}, disponivel: false };
  try {
    const linhas = await getPrisma().sectorMenuView.findMany({
      where: { tenantId },
      select: { sectorCode: true, hiddenScreens: true },
    });
    const porSetor: Record<string, TelaDoGeral[]> = {};
    const visiveisPorSetor: Record<string, TelaDoGeral[]> = {};
    for (const l of linhas) {
      const preferencias = lerPreferenciasDoMenuGeral(l.hiddenScreens);
      porSetor[l.sectorCode] = preferencias.ocultas;
      visiveisPorSetor[l.sectorCode] = preferencias.visiveis;
    }
    return { porSetor, visiveisPorSetor, disponivel: true };
  } catch (err) {
    console.error("[menu-geral] leitura das telas escondidas", err);
    return { porSetor: {}, visiveisPorSetor: {}, disponivel: false };
  }
});

/**
 * As telas do Geral que esta pessoa vê agora, na ordem do menu — pelo setor
 * escolhido no alto da tela ou, em "Todos os setores", pela soma dos setores
 * dela (ver `setoresQueDecidemOGeral`). Quem não é recortado por setor nem
 * chega a consultar o banco.
 */
export async function telasDoGeralDaPessoa(
  ctx: Pick<AuthContext, "tenantId" | "activeSector" | "sectors" | "role">,
): Promise<TelaDoGeral[]> {
  const setores = setoresQueDecidemOGeral(ctx.activeSector, ctx.sectors, isFullAccess(ctx.role));
  if (setores === null || setores.length === 0 || !ctx.tenantId) return telasDoGeralVisiveis(null, {});
  const { porSetor, visiveisPorSetor } = await lerOcultasDoGeral(ctx.tenantId);
  return telasDoGeralVisiveis(setores, porSetor, visiveisPorSetor);
}
