"use server";

import { revalidatePath } from "next/cache";
import { getPrisma } from "@/lib/prisma";
import { clienteAtivoDoPortal } from "@/app/(portal)/usuario";
import { MODULO_ARQUIVOS } from "@/lib/drive/regras";
import { avisarEquipeDoEnvio } from "@/lib/drive/avisos";

/**
 * Avisa a equipe, uma vez por lote, que o cliente mandou arquivos (09/10/2026).
 * A tela chama quando a fila termina, com os ids que a rota de envio devolveu.
 * A quantidade é conferida no banco — só conta arquivo desta pessoa, desta
 * empresa e da última hora —, para um número montado no navegador não virar
 * texto no sino de ninguém.
 */
export async function avisarEquipeDosEnvios(companyId: string, arquivoIds: string[]): Promise<void> {
  const cliente = await clienteAtivoDoPortal();
  if (!cliente || !cliente.modulos.has(MODULO_ARQUIVOS) || !cliente.companyIds.includes(companyId)) return;
  const ids = [...new Set(arquivoIds)].slice(0, 200);
  if (ids.length === 0) return;

  const quantidade = await getPrisma().driveFile.count({
    where: {
      id: { in: ids },
      tenantId: cliente.tenantId,
      uploadedByPortalUserId: cliente.usuario.id,
      createdAt: { gte: new Date(Date.now() - 60 * 60_000) },
      folder: { companyId },
    },
  });
  if (quantidade > 0) {
    await avisarEquipeDoEnvio({ tenantId: cliente.tenantId, companyId, quantidade, quem: cliente.usuario.name });
  }
  revalidatePath("/portal/arquivos");
  revalidatePath("/arquivos", "layout");
}
