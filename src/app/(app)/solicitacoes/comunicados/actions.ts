"use server";

// Enviar um comunicado aos clientes (01/10).
//
// Não há rascunho nem edição: o comunicado sai na hora, com e-mail, e um texto
// "corrigido" depois do e-mail não chegaria a quem já leu. Quem envia confirma
// antes, vendo para quantos clientes vai.

import { revalidatePath } from "next/cache";
import { getPrisma } from "@/lib/prisma";
import { getAuthContext } from "@/lib/auth/context";
import { isModuleEnabled } from "@/lib/modules";
import { getActiveSectors } from "@/lib/sectors";
import { logAudit } from "@/lib/audit";
import { arquivosDoFormulario } from "@/lib/financeiro/pendencias/armazenamento";
import { validarComunicado } from "@/lib/comunicados/regras";
import { podeComunicarPeloSetor } from "@/lib/comunicados/acesso";
import { gruposDoPublico } from "@/lib/comunicados/consultas";
import { anexosDoComunicado, avisarClientesDoComunicado } from "@/lib/comunicados/avisos";

export type ResultadoDoEnvio = { error: string } | { ok: true; id: string; clientes: number };

export async function enviarComunicado(formData: FormData): Promise<ResultadoDoEnvio> {
  const ctx = await getAuthContext();
  if (!ctx.tenantId) return { error: "Não autenticado." };
  if (!(await isModuleEnabled(ctx.tenantId, "portal_solicitacoes"))) return { error: "O canal do portal está desligado." };

  const v = validarComunicado({
    titulo: String(formData.get("titulo") ?? ""),
    texto: String(formData.get("texto") ?? ""),
    publico: String(formData.get("publico") ?? ""),
    setor: String(formData.get("setor") ?? ""),
    grupos: formData.getAll("grupos").map(String),
  });
  if (!v.ok) return { error: v.erro };
  const { titulo, texto, publico, setor, grupos: escolhidos } = v.dados;

  if (!podeComunicarPeloSetor(ctx, setor)) return { error: "Só a coordenação do setor ou um administrador envia comunicado." };
  if (!(await getActiveSectors(ctx.tenantId)).some((s) => s.code === setor)) return { error: "Escolha um setor ativo." };

  const grupos = await gruposDoPublico(ctx.tenantId, publico, setor, escolhidos);
  if (grupos.length === 0) return { error: "Nenhum cliente ativo para este público." };

  const gravados = await anexosDoComunicado.gravarAnexos(ctx.tenantId, arquivosDoFormulario(formData, "anexos"));
  if (!gravados.ok) return { error: gravados.erro };

  let id: string;
  try {
    id = await getPrisma().$transaction(async (tx) => {
      const c = await tx.clientAnnouncement.create({
        data: { tenantId: ctx.tenantId, sectorCode: setor, title: titulo, body: texto, createdById: ctx.userId || null },
        select: { id: true },
      });
      await tx.clientAnnouncementGroup.createMany({ data: grupos.map((clientGroupId) => ({ announcementId: c.id, clientGroupId })) });
      if (gravados.anexos.length > 0) {
        await tx.clientAnnouncementAttachment.createMany({ data: gravados.anexos.map((a) => ({ announcementId: c.id, ...a })) });
      }
      return c.id;
    });
  } catch (err) {
    await anexosDoComunicado.apagarAnexosGravados(gravados.anexos);
    throw err;
  }

  // Em segundo plano: o servidor é um processo Node que continua vivo, e o
  // comunicado já está no portal — o e-mail é aviso, não é a entrega.
  void avisarClientesDoComunicado(ctx.tenantId, id).catch((err) => console.error("[enviarComunicado] avisos", err));

  await logAudit({
    tenantId: ctx.tenantId,
    userId: ctx.userId,
    action: "comunicado.enviado",
    entityType: "ClientAnnouncement",
    entityId: id,
    metadata: { setor, publico, clientes: grupos.length, anexos: gravados.anexos.length },
  });

  revalidatePath("/solicitacoes/comunicados");
  revalidatePath("/portal/comunicados");
  revalidatePath("/portal");
  return { ok: true, id, clientes: grupos.length };
}
