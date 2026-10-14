"use server";

// Enviar um comunicado aos clientes (01/10).
//
// Não há rascunho nem edição: o comunicado sai na hora, com e-mail, e um texto
// "corrigido" depois do e-mail não chegaria a quem já leu. Quem envia confirma
// antes, vendo para quantas empresas vai.
//
// Desde 14/10/2026 o comunicado vai para empresas, e não mais para Clientes:
// no portal, quem tem acesso a alguma delas vê.

import { revalidatePath } from "next/cache";
import { getPrisma } from "@/lib/prisma";
import { isPrismaMissingTableError } from "@/lib/prismaErrors";
import { getAuthContext } from "@/lib/auth/context";
import { isModuleEnabled } from "@/lib/modules";
import { getActiveSectors } from "@/lib/sectors";
import { logAudit } from "@/lib/audit";
import { arquivosDoFormulario } from "@/lib/financeiro/pendencias/armazenamento";
import { validarComunicado } from "@/lib/comunicados/regras";
import { podeComunicarPeloSetor } from "@/lib/comunicados/acesso";
import { empresasDoPublico } from "@/lib/comunicados/consultas";
import { anexosDoComunicado, avisarClientesDoComunicado } from "@/lib/comunicados/avisos";

export type ResultadoDoEnvio = { error: string } | { ok: true; id: string; empresas: number };

/** Sem a tabela dos destinatários por empresa (código antes da migration de 14/10/2026). */
const FALTA_O_BANCO_DO_COMUNICADO =
  "Falta a atualização do banco desta versão do Connect. Até ela rodar, não dá para enviar comunicado.";

export async function enviarComunicado(formData: FormData): Promise<ResultadoDoEnvio> {
  const ctx = await getAuthContext();
  if (!ctx.tenantId) return { error: "Não autenticado." };
  if (!(await isModuleEnabled(ctx.tenantId, "portal_solicitacoes"))) return { error: "O canal do portal está desligado." };

  const v = validarComunicado({
    titulo: String(formData.get("titulo") ?? ""),
    texto: String(formData.get("texto") ?? ""),
    publico: String(formData.get("publico") ?? ""),
    setor: String(formData.get("setor") ?? ""),
    empresas: formData.getAll("empresas").map(String),
  });
  if (!v.ok) return { error: v.erro };
  const { titulo, texto, publico, setor, empresas: escolhidas } = v.dados;

  if (!podeComunicarPeloSetor(ctx, setor)) return { error: "Só a coordenação do setor ou um administrador envia comunicado." };
  if (!(await getActiveSectors(ctx.tenantId)).some((s) => s.code === setor)) return { error: "Escolha um setor ativo." };

  const empresas = await empresasDoPublico(ctx.tenantId, publico, setor, escolhidas);
  if (empresas.length === 0) return { error: "Nenhuma empresa para este público." };

  const gravados = await anexosDoComunicado.gravarAnexos(ctx.tenantId, arquivosDoFormulario(formData, "anexos"));
  if (!gravados.ok) return { error: gravados.erro };

  let id: string;
  try {
    id = await getPrisma().$transaction(async (tx) => {
      const c = await tx.clientAnnouncement.create({
        data: { tenantId: ctx.tenantId, sectorCode: setor, title: titulo, body: texto, createdById: ctx.userId || null },
        select: { id: true },
      });
      await tx.clientAnnouncementCompany.createMany({ data: empresas.map((companyId) => ({ announcementId: c.id, companyId })) });
      if (gravados.anexos.length > 0) {
        await tx.clientAnnouncementAttachment.createMany({ data: gravados.anexos.map((a) => ({ announcementId: c.id, ...a })) });
      }
      return c.id;
    });
  } catch (err) {
    await anexosDoComunicado.apagarAnexosGravados(gravados.anexos);
    if (isPrismaMissingTableError(err)) return { error: FALTA_O_BANCO_DO_COMUNICADO };
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
    metadata: { setor, publico, empresas: empresas.length, anexos: gravados.anexos.length },
  });

  revalidatePath("/solicitacoes/comunicados");
  revalidatePath("/portal/comunicados");
  revalidatePath("/portal");
  return { ok: true, id, empresas: empresas.length };
}
