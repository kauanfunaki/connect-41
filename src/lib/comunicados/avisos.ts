// O aviso de comunicado novo aos clientes: e-mail e push para os usuários
// ativos do portal dos clientes que recebem.
//
// Roda em segundo plano, depois de a action responder: um comunicado para
// todos os clientes são centenas de e-mails, um por um, e quem clicou em
// "Enviar" não pode ficar esperando — nem perder o comunicado se a tela fechar.
// `notifiedAt` diz à equipe quando terminou.

import { getPrisma } from "@/lib/prisma";
import { getSectorMaps } from "@/lib/sectors";
import { sendComunicadoAoClienteEmail } from "@/lib/email/sendMail";
import { avisarClientePorPush } from "@/lib/portal/avisos";
import { criarArmazenamento } from "@/lib/financeiro/pendencias/armazenamento";

export const anexosDoComunicado = criarArmazenamento("client-announcements");

export async function avisarClientesDoComunicado(tenantId: string, id: string): Promise<void> {
  const prisma = getPrisma();
  const c = await prisma.clientAnnouncement.findFirst({
    where: { id, tenantId },
    select: { id: true, title: true, sectorCode: true, groups: { select: { clientGroupId: true } } },
  });
  if (!c) return;

  const usuarios = await prisma.portalUser.findMany({
    where: { tenantId, active: true, clientGroupId: { in: c.groups.map((g) => g.clientGroupId) } },
    select: { id: true, name: true, email: true },
  });
  const { labels } = await getSectorMaps(tenantId);

  if (usuarios.length > 0) {
    await Promise.all([
      sendComunicadoAoClienteEmail({
        tenantId,
        destinatarios: usuarios.map((u) => ({ email: u.email, nome: u.name })),
        comunicadoId: c.id,
        titulo: c.title,
        setor: labels[c.sectorCode] ?? c.sectorCode,
      }),
      avisarClientePorPush(tenantId, usuarios.map((u) => u.id), { tipo: "comunicado", titulo: c.title, id: c.id }),
    ]);
  }
  await prisma.clientAnnouncement.update({ where: { id: c.id }, data: { notifiedAt: new Date() } });
}
