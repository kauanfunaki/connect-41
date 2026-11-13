import { cache } from "react";
import { getPrisma } from "@/lib/prisma";
import { MOTIVO_MAXIMO } from "@/lib/manutencao/regras";

// Telas em manutenção (13/11/2026) — o que está gravado no banco.

export type TelaEmManutencao = {
  /** O id desta manutenção: liberada e colocada de novo, é outro. */
  id: string;
  moduleCode: string;
  motivo: string | null;
  previsao: Date | null;
  porNome: string;
  desde: Date;
};

/**
 * As telas em manutenção do escritório. Uma leitura por requisição (`cache()`):
 * layout, página do aviso e configuração pedem a mesma lista.
 *
 * Nunca derruba nada: sem a tabela (deploy antes da migration) ou com o banco
 * fora, nenhuma tela está em manutenção — o Connect de antes desta mudança.
 * `disponivel` diz à configuração se dá para salvar.
 */
export const lerTelasEmManutencao = cache(async (tenantId: string): Promise<{ telas: TelaEmManutencao[]; disponivel: boolean }> => {
  if (!tenantId) return { telas: [], disponivel: true };
  try {
    const linhas = await getPrisma().tenantModuleMaintenance.findMany({
      where: { tenantId },
      select: { id: true, moduleCode: true, motivo: true, previsao: true, porNome: true, createdAt: true },
      orderBy: { createdAt: "asc" },
    });
    return {
      telas: linhas.map((l) => ({ id: l.id, moduleCode: l.moduleCode, motivo: l.motivo, previsao: l.previsao, porNome: l.porNome, desde: l.createdAt })),
      disponivel: true,
    };
  } catch (err) {
    console.error("[manutencao] leitura das telas em manutenção", err);
    return { telas: [], disponivel: false };
  }
});

/**
 * Põe a tela em manutenção, ou atualiza o motivo e a previsão de uma que já
 * está. O "desde" e quem colocou ficam os da primeira vez: trocar o motivo não
 * reinicia a contagem do aviso.
 */
export async function gravarManutencao(
  tenantId: string,
  moduleCode: string,
  dados: { motivo: string | null; previsao: Date | null; porNome: string },
): Promise<void> {
  const motivo = dados.motivo?.trim().slice(0, MOTIVO_MAXIMO) || null;
  await getPrisma().tenantModuleMaintenance.upsert({
    where: { tenantId_moduleCode: { tenantId, moduleCode } },
    create: { tenantId, moduleCode, motivo, previsao: dados.previsao, porNome: dados.porNome.slice(0, 120) },
    update: { motivo, previsao: dados.previsao },
  });
}

/** Tira a tela da manutenção. Sem linha, não faz nada. */
export async function liberarTela(tenantId: string, moduleCode: string): Promise<void> {
  await getPrisma().tenantModuleMaintenance.deleteMany({ where: { tenantId, moduleCode } });
}
