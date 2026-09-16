"use server";

// A única escrita do cliente numa pendência: responder, com texto e/ou anexos.
//
// Autoria gravada no próprio modelo (`authorPortalUserId`), não no AuditLog —
// o AuditLog exige um `User` interno, e cliente do portal não é um.

import { revalidatePath } from "next/cache";
import { getPrisma } from "@/lib/prisma";
import { nomeExibicao } from "@/lib/companyName";
import { clienteAtivoDoPortal } from "@/app/(portal)/usuario";
import { transicao, validarResposta } from "@/lib/financeiro/pendencias/regras";
import { arquivosDoFormulario, gravarAnexos, apagarAnexosGravados } from "@/lib/financeiro/pendencias/armazenamento";
import { avisarEquipeDaResposta } from "@/lib/financeiro/pendencias/avisos";

export type ResultadoDoPortal = { error: string } | { ok: true };

class Recusa extends Error {}

export async function responderPendenciaCliente(formData: FormData): Promise<ResultadoDoPortal> {
  const cliente = await clienteAtivoDoPortal();
  if (!cliente) return { error: "Sessão expirada. Entre de novo no portal." };
  if (!cliente.modulos.has("bpo_pendencias")) return { error: "Pendências não estão habilitadas." };

  const id = String(formData.get("requestId") ?? "");
  const prisma = getPrisma();
  // Empresa do alcance no `where`: pendência de outro grupo responde "não
  // encontrada", igual a uma que não existe — sem confirmar que existe.
  const p = await prisma.clientRequest.findFirst({
    where: { id, tenantId: cliente.tenantId, companyId: { in: cliente.companyIds } },
    select: {
      id: true,
      status: true,
      title: true,
      createdById: true,
      company: { select: { name: true, displayName: true } },
    },
  });
  if (!p) return { error: "Pendência não encontrada." };

  const arquivos = arquivosDoFormulario(formData, "anexos");
  const resposta = validarResposta(String(formData.get("body") ?? ""), arquivos.length);
  if (!resposta.ok) return { error: resposta.erro };
  const t = transicao(p.status, "CLIENTE", "RESPONDER");
  if (!t.ok) return { error: t.motivo };

  const gravados = await gravarAnexos(cliente.tenantId, arquivos);
  if (!gravados.ok) return { error: gravados.erro };

  try {
    await prisma.$transaction(async (tx) => {
      const mudou = await tx.clientRequest.updateMany({
        where: { id: p.id, tenantId: cliente.tenantId, status: p.status },
        data: { status: t.novo, updatedAt: new Date() },
      });
      if (mudou.count !== 1) throw new Recusa("A pendência acabou de mudar — atualize a página.");
      const msg = await tx.clientRequestMessage.create({
        data: { requestId: p.id, authorPortalUserId: cliente.usuario.id, body: resposta.corpo },
        select: { id: true },
      });
      if (gravados.anexos.length > 0) {
        await tx.clientRequestAttachment.createMany({
          data: gravados.anexos.map((a) => ({
            requestId: p.id,
            messageId: msg.id,
            uploadedByPortalUserId: cliente.usuario.id,
            ...a,
          })),
        });
      }
    });
  } catch (err) {
    await apagarAnexosGravados(gravados.anexos);
    if (err instanceof Recusa) return { error: err.message };
    throw err;
  }

  await avisarEquipeDaResposta({
    tenantId: cliente.tenantId,
    createdById: p.createdById,
    titulo: p.title,
    empresaNome: nomeExibicao(p.company),
  });

  revalidatePath("/portal/pendencias");
  revalidatePath(`/portal/pendencias/${p.id}`);
  revalidatePath("/portal");
  revalidatePath("/pendencias");
  revalidatePath(`/pendencias/${p.id}`);
  return { ok: true };
}
