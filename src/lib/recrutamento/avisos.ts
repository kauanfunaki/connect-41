// Para quem vão os avisos do Recrutamento — candidatura nova, currículo novo,
// conversa do WhatsApp transferida (02/10/2026).
//
// Até aqui, sem responsável na vaga, o aviso ia para o setor DA VAGA — o setor
// que contrata (Tech, Societário) —, e quem opera o recrutamento não sabia de
// nada. Decisão do Kauan em 29/09: o Recrutamento da 41 recruta **para os
// clientes**; o setor "dono" do processo é quem opera o recrutamento, não quem
// contrata. Então o aviso vai para o setor que opera o módulo (`setorDoModulo`,
// "recrutamento" no catálogo).
//
// O modelo "interno" — cliente que recruta para si e quer o setor que contrata
// participando — fica para quando houver um cliente assim (linha no Quadro).
//
// Setor sem ninguém: o aviso vai aos administradores do escritório. Antes ele
// se perdia — `notifySector` só alcança quem é do setor, e admin não é.

import { getPrisma } from "@/lib/prisma";
import { notifySector, notifyUser, type NotifyInput } from "@/lib/notifications";
import { setorDoModulo } from "@/lib/modules";

const MODULO_DAS_VAGAS = "recrutamento_vagas";
const SETOR_DO_CATALOGO = "recrutamento";

/** O setor que opera o recrutamento neste escritório. */
export async function setorDoRecrutamento(tenantId: string, modulo: string = MODULO_DAS_VAGAS): Promise<string> {
  return (await setorDoModulo(tenantId, modulo)) ?? SETOR_DO_CATALOGO;
}

/** Avisa o setor do recrutamento; sem ninguém nele, os administradores do escritório. */
export async function avisarORecrutamento(input: NotifyInput, modulo?: string): Promise<void> {
  const setor = await setorDoRecrutamento(input.tenantId, modulo);
  const prisma = getPrisma();
  const noSetor = await prisma.user.count({
    where: { tenantId: input.tenantId, active: true, sectors: { some: { sectorCode: setor } } },
  });
  if (noSetor > 0) {
    await notifySector(setor, input);
    return;
  }
  const admins = await prisma.user.findMany({
    where: { tenantId: input.tenantId, active: true, role: "ADMIN" },
    select: { id: true },
  });
  await Promise.all(admins.map((a) => notifyUser(a.id, input)));
}

/** Aviso sobre uma vaga: o responsável dela; sem responsável, o Recrutamento. */
export async function avisarSobreAVaga(vaga: { responsibleUserId: string | null }, input: NotifyInput): Promise<void> {
  if (vaga.responsibleUserId) await notifyUser(vaga.responsibleUserId, input);
  else await avisarORecrutamento(input);
}
