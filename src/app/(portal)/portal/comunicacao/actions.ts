"use server";

// A conversa livre, do lado do cliente: escrever mensagem e **mandar arquivo
// sem esperar o escritório pedir**.
//
// Era o buraco que sobrava: até aqui o cliente só anexava dentro de uma
// pendência, então mandar o extrato do mês dependia de alguém abrir um pedido
// para ele.
//
// Autoria gravada no próprio modelo (`authorPortalUserId`), não no AuditLog —
// o AuditLog exige um `User` interno, e cliente do portal não é um.

import { revalidatePath } from "next/cache";
import { getPrisma } from "@/lib/prisma";
import { nomeExibicao } from "@/lib/companyName";
import { notifySector } from "@/lib/notifications";
import { clienteAtivoDoPortal } from "@/app/(portal)/usuario";
import { setorDoModulo } from "@/lib/modules";
import { getModuleDef } from "@/lib/module-catalog";
import { validarResposta } from "@/lib/financeiro/pendencias/regras";
import { arquivosDoFormulario } from "@/lib/financeiro/pendencias/armazenamento";
import { anexosDaConversa } from "@/lib/financeiro/comunicacao/armazenamento";
import { MODULO_DE_COMUNICACAO as MODULO } from "@/lib/financeiro/comunicacao/regras";

export type ResultadoDoPortal = { error: string } | { ok: true };

export async function enviarMensagemCliente(formData: FormData): Promise<ResultadoDoPortal> {
  const cliente = await clienteAtivoDoPortal();
  if (!cliente) return { error: "Sessão expirada. Entre de novo no portal." };
  if (!cliente.modulos.has(MODULO)) return { error: "A conversa não está habilitada." };

  const companyId = String(formData.get("companyId") ?? "");
  const prisma = getPrisma();
  // Empresa do alcance no `where`: empresa de outro grupo responde "não
  // encontrada", igual a uma que não existe — sem confirmar que existe.
  const empresa = await prisma.company.findFirst({
    where: { tenantId: cliente.tenantId, AND: [{ id: companyId }, { id: { in: cliente.companyIds } }] },
    select: { id: true, name: true, displayName: true },
  });
  if (!empresa) return { error: "Empresa não encontrada." };

  const arquivos = arquivosDoFormulario(formData, "anexos");
  const mensagem = validarResposta(String(formData.get("body") ?? ""), arquivos.length);
  if (!mensagem.ok) return { error: mensagem.erro };

  const gravados = await anexosDaConversa.gravarAnexos(cliente.tenantId, arquivos);
  if (!gravados.ok) return { error: gravados.erro };

  try {
    await prisma.$transaction(async (tx) => {
      const msg = await tx.companyMessage.create({
        data: {
          tenantId: cliente.tenantId,
          companyId: empresa.id,
          authorPortalUserId: cliente.usuario.id,
          body: mensagem.corpo,
        },
        select: { id: true },
      });
      if (gravados.anexos.length > 0) {
        await tx.companyMessageAttachment.createMany({
          data: gravados.anexos.map((a) => ({ tenantId: cliente.tenantId, messageId: msg.id, ...a })),
        });
      }
    });
  } catch (err) {
    await anexosDaConversa.apagarAnexosGravados(gravados.anexos);
    throw err;
  }

  // Avisa o setor, e não uma pessoa: a conversa não tem dono como a pendência
  // tem quem a abriu. Best-effort — a mensagem já está gravada.
  try {
    const setor = (await setorDoModulo(cliente.tenantId, MODULO)) ?? getModuleDef(MODULO)!.sectorCode;
    await notifySector(setor, {
      tenantId: cliente.tenantId,
      type: "COMPANY_MESSAGE",
      message: `${nomeExibicao(empresa)} mandou uma mensagem${gravados.anexos.length > 0 ? " com anexo" : ""}.`,
      entityType: "COMPANY",
      entityId: empresa.id,
    });
  } catch (err) {
    console.error("[enviarMensagemCliente] aviso ao setor", err);
  }

  revalidatePath("/portal/comunicacao");
  revalidatePath("/comunicacao");
  return { ok: true };
}
