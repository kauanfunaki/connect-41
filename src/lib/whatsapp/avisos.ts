// Avisos das conversas do WhatsApp para o time (sino + push do navegador).
//
// Dois momentos: quando o assistente passa a conversa para uma pessoa, e quando
// o candidato volta a escrever numa conversa que já está com gente. Quem recebe
// segue `destinoDoAviso`: quem assumiu, senão o responsável pela vaga, senão o
// setor que opera o módulo.
//
// **Nunca derruba o atendimento.** Roda dentro do webhook: um aviso que falha
// vira linha de log, e a mensagem do candidato segue registrada e tratada.

import { getPrisma } from "@/lib/prisma";
import { notifySector, notifyUser } from "@/lib/notifications";
import { setorDoModulo } from "@/lib/modules";
import { destinoDoAviso, telefoneLegivel } from "./conversas";

const MODULE = "recrutamento_whatsapp";

type Momento = { tipo: "transferida"; motivo: string } | { tipo: "mensagem_nova" };

function texto(quem: string, momento: Momento): string {
  const t =
    momento.tipo === "transferida"
      ? `WhatsApp: ${quem} precisa de alguém — ${momento.motivo}`
      : `WhatsApp: ${quem} escreveu de novo`;
  // A coluna da notificação tem 255 caracteres.
  return t.length > 255 ? `${t.slice(0, 254)}…` : t;
}

export async function avisarSobreConversa(threadId: string, momento: Momento): Promise<void> {
  try {
    const prisma = getPrisma();
    const thread = await prisma.whatsappThread.findUnique({
      where: { id: threadId },
      select: { tenantId: true, waPhone: true, assignedToId: true, optedOutAt: true, candidaturaId: true },
    });
    if (!thread || thread.optedOutAt) return;

    const candidatura = thread.candidaturaId
      ? await prisma.candidatura.findFirst({
          where: { id: thread.candidaturaId, tenantId: thread.tenantId },
          select: { person: { select: { name: true } }, vaga: { select: { responsibleUserId: true, sectorCode: true } } },
        })
      : null;

    const input = {
      tenantId: thread.tenantId,
      type: momento.tipo === "transferida" ? "WHATSAPP_HANDOFF" : "WHATSAPP_MESSAGE",
      message: texto(candidatura?.person.name ?? telefoneLegivel(thread.waPhone), momento),
      entityId: threadId,
    };

    const destino = destinoDoAviso({
      assignedToId: thread.assignedToId,
      responsavelDaVagaId: candidatura?.vaga.responsibleUserId ?? null,
    });
    if ("usuario" in destino) {
      await notifyUser(destino.usuario, input);
      return;
    }
    const setor = candidatura?.vaga.sectorCode ?? (await setorDoModulo(thread.tenantId, MODULE)) ?? "recrutamento";
    await notifySector(setor, input);
  } catch (err) {
    console.error("[whatsapp/avisos]", threadId, err);
  }
}
