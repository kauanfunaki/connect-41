// A leitura do banco para o menu Geral por setor (14/10/2026). As regras moram
// em `menuGeral.ts`; aqui, só a consulta e o "falhou, mostra tudo".

import { cache } from "react";
import { getPrisma } from "@/lib/prisma";
import { isFullAccess } from "@/lib/auth/papeis";
import type { AuthContext } from "@/lib/auth/context";
import {
  TODAS_AS_TELAS_DO_GERAL,
  lerTelasOcultas,
  setoresQueDecidemOGeral,
  telasDoGeralVisiveis,
  type TelaDoGeral,
} from "@/lib/menuGeral";

export type OcultasDoGeral = {
  /** As telas escondidas de cada setor que tem configuração. Setor ausente = nada escondido. */
  porSetor: Record<string, TelaDoGeral[]>;
  /**
   * `false` quando o banco não respondeu — inclusive a tabela ainda não existir
   * (deploy antes da migration). O menu segue mostrando tudo; a tela de
   * configuração usa isto para avisar que não consegue salvar.
   */
  disponivel: boolean;
};

/**
 * As telas escondidas por setor neste escritório. Uma consulta por requisição
 * (`cache`): o layout, a página e o tutorial pedem a mesma coisa.
 *
 * Nunca derruba a tela: qualquer erro vira "nada escondido", que é o menu de
 * antes desta configuração existir.
 */
export const lerOcultasDoGeral = cache(async (tenantId: string): Promise<OcultasDoGeral> => {
  if (!tenantId) return { porSetor: {}, disponivel: false };
  try {
    const linhas = await getPrisma().sectorMenuView.findMany({
      where: { tenantId },
      select: { sectorCode: true, hiddenScreens: true },
    });
    const porSetor: Record<string, TelaDoGeral[]> = {};
    for (const l of linhas) porSetor[l.sectorCode] = lerTelasOcultas(l.hiddenScreens);
    return { porSetor, disponivel: true };
  } catch (err) {
    console.error("[menu-geral] leitura das telas escondidas", err);
    return { porSetor: {}, disponivel: false };
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
  if (setores === null || setores.length === 0 || !ctx.tenantId) return [...TODAS_AS_TELAS_DO_GERAL];
  const { porSetor } = await lerOcultasDoGeral(ctx.tenantId);
  return telasDoGeralVisiveis(setores, porSetor);
}
