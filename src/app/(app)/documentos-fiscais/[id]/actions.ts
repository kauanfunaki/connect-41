"use server";

import { revalidatePath } from "next/cache";
import { getPrisma } from "@/lib/prisma";
import { getAuthContext, canActOnSector, canManageSector } from "@/lib/auth/context";
import { isModuleEnabled } from "@/lib/modules";
import { logAudit } from "@/lib/audit";
import { obterDocumento } from "@/lib/fiscal/data";
import { alcanceDaEquipe } from "../alcance";
import type { FiscalDocumentDestination } from "@/generated/prisma/enums";

const SECTOR = "fiscal";
const MODULE = "fiscal_documentos";

/**
 * Decide o destino de um documento: pendente, lançado ou ignorado.
 *
 * É o único dos três eixos que é trabalho nosso — `origin` e `situation` vêm de
 * fora e ninguém os edita por aqui.
 *
 * Exige `canManageSector`, não só `canActOnSector`: ver o acervo é leitura de
 * quem é do fiscal; decidir o destino de uma nota mexe no que vira lançamento.
 */
export async function definirDestino(
  documentoId: string,
  destino: FiscalDocumentDestination,
  motivo?: string
): Promise<{ error: string } | { ok: true }> {
  const ctx = await getAuthContext();
  if (!ctx.tenantId || !canActOnSector(ctx, SECTOR)) return { error: "Sem permissão." };
  if (!canManageSector(ctx, SECTOR)) return { error: "Só a coordenação do fiscal decide o destino." };
  if (!(await isModuleEnabled(ctx.tenantId, MODULE))) return { error: "Módulo não habilitado." };

  const alcance = alcanceDaEquipe(ctx.tenantId);
  const documento = await obterDocumento(alcance, documentoId);
  if (!documento) return { error: "Documento não encontrado." };

  // Ignorar sem motivo é o que transforma "ignorado" em lixo silencioso: três
  // meses depois ninguém sabe por que a nota ficou fora do financeiro.
  const razao = motivo?.trim();
  if (destino === "IGNORADO" && !razao) return { error: "Diga por que este documento fica fora do financeiro." };

  const prisma = getPrisma();
  await prisma.fiscalDocument.update({
    where: { id: documentoId },
    data: {
      destination: destino,
      // O motivo só faz sentido enquanto o documento está ignorado. Mantê-lo ao
      // sair de IGNORADO deixaria uma justificativa órfã explicando um estado
      // que não é mais o atual.
      ignoredReason: destino === "IGNORADO" ? (razao ?? null) : null,
    },
  });

  await logAudit({
    tenantId: ctx.tenantId,
    userId: ctx.userId,
    action: "fiscal.document.destination",
    entityType: "FiscalDocument",
    entityId: documentoId,
    metadata: { de: documento.destination, para: destino, motivo: razao ?? null },
  });

  revalidatePath("/documentos-fiscais");
  revalidatePath(`/documentos-fiscais/${documentoId}`);
  return { ok: true };
}
