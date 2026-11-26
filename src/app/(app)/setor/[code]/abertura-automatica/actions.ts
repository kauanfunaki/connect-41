"use server";

// A abertura automática do setor (27/11/2026, funcionalidade-872): grava a
// lista e o liga/desliga dos processos societários. As outras origens têm
// configuração própria; a tela só as mostra.

import { revalidatePath } from "next/cache";
import { getPrisma } from "@/lib/prisma";
import { getAuthContext, canManageSector } from "@/lib/auth/context";
import { logAudit } from "@/lib/audit";
import { setorDoModulo } from "@/lib/modules";
import { lerFormularioDaAbertura } from "@/lib/kanban/aberturaAutomatica";
import { MODULO_DOS_PROCESSOS } from "@/lib/kanban/cartaoDoProcessoServidor";

export type EstadoDaAbertura = { ok: true } | { error: string } | null;

/**
 * Só a coordenação do setor que opera os Processos. A lista escolhida tem de
 * ser do setor, ativa e de empresas (o cartão do processo é da empresa). Os
 * cartões que já existem ficam onde estão: a escolha vale para os processos novos.
 */
export async function salvarAberturaDosProcessos(sectorCode: string, _prev: EstadoDaAbertura, form: FormData): Promise<EstadoDaAbertura> {
  const ctx = await getAuthContext();
  const { tenantId, userId } = ctx;
  if (!tenantId || !userId) return { error: "Sua sessão expirou. Entre de novo para salvar." };
  if (!canManageSector(ctx, sectorCode)) return { error: "Só a coordenação do setor muda a abertura automática." };
  if ((await setorDoModulo(tenantId, MODULO_DOS_PROCESSOS)) !== sectorCode) {
    return { error: "Os processos societários são de outro setor neste escritório." };
  }

  const lido = lerFormularioDaAbertura(form);
  if (!lido.ok) return { error: lido.erro };

  const prisma = getPrisma();
  if (lido.pipelineId) {
    const lista = await prisma.pipeline.findFirst({
      where: { id: lido.pipelineId, tenantId, sectorCode, active: true, entityType: "COMPANY" },
      select: { id: true },
    });
    if (!lista) return { error: "Essa lista não é deste setor ou não existe mais. Escolha outra." };
  }

  const chave = { tenantId_sectorCode_origem: { tenantId, sectorCode, origem: "PROCESSO_SOCIETARIO" as const } };
  const antes = await prisma.aberturaAutomatica.findUnique({ where: chave, select: { ativo: true, pipelineId: true } });
  try {
    await prisma.aberturaAutomatica.upsert({
      where: chave,
      create: { tenantId, sectorCode, origem: "PROCESSO_SOCIETARIO", ativo: lido.ativo, pipelineId: lido.pipelineId, criadoPorId: userId, atualizadoPorId: userId },
      update: { ativo: lido.ativo, pipelineId: lido.pipelineId, atualizadoPorId: userId },
    });
  } catch (err) {
    console.error("[salvarAberturaDosProcessos]", err);
    return { error: "Não deu para salvar. Tente de novo." };
  }

  await logAudit({
    tenantId,
    userId,
    action: "kanban.abertura_automatica",
    entityType: "AberturaAutomatica",
    entityId: `${sectorCode}:PROCESSO_SOCIETARIO`,
    metadata: {
      setor: sectorCode,
      origem: "processos societários",
      antes: antes ? { ligada: antes.ativo, lista: antes.pipelineId ?? "padrão" } : { ligada: true, lista: "padrão" },
      depois: { ligada: lido.ativo, lista: lido.pipelineId ?? "padrão" },
    },
  });

  revalidatePath(`/setor/${sectorCode}/abertura-automatica`);
  revalidatePath(`/setor/${sectorCode}`);
  return { ok: true };
}
