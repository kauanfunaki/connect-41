// Quem fica sabendo de uma pendência, e por onde.
//
// Cliente por e-mail e por push (ele não tem sino), equipe pelo sino. Todos são
// best-effort: a pendência já está gravada quando o aviso sai, e aviso que
// falhou não desfaz nada — só é devolvido para a tela contar e fica no log.
//
// O push é adicional, nunca substituto: só chega a quem instalou o portal e
// aceitou receber, então o e-mail continua sendo o aviso que alcança todo mundo.
// Por isso o resultado devolvido à tela continua contando só o e-mail.

import { getPrisma } from "@/lib/prisma";
import { notifyUser } from "@/lib/notifications";
import { sendPendenciaAoClienteEmail, type ResultadoDoAviso } from "@/lib/email/sendMail";
import { avisarClientePorPush } from "@/lib/portal/avisos";

/** Usuários ativos do portal que enxergam a empresa — os do grupo dela. */
export async function usuariosDoPortalDaEmpresa(tenantId: string, companyId: string) {
  const prisma = getPrisma();
  const empresa = await prisma.company.findFirst({ where: { id: companyId, tenantId }, select: { clientGroupId: true } });
  if (!empresa?.clientGroupId) return [];
  return prisma.portalUser.findMany({
    where: { tenantId, clientGroupId: empresa.clientGroupId, active: true },
    select: { id: true, name: true, email: true },
  });
}

export async function avisarClienteDaPendencia(input: {
  tenantId: string;
  companyId: string;
  requestId: string;
  titulo: string;
  motivo: "nova" | "resposta";
}): Promise<ResultadoDoAviso & { semDestinatario: boolean }> {
  try {
    const usuarios = await usuariosDoPortalDaEmpresa(input.tenantId, input.companyId);
    if (usuarios.length === 0) return { enviados: 0, falhas: 0, semSmtp: false, semDestinatario: true };
    const [r] = await Promise.all([
      sendPendenciaAoClienteEmail({
        tenantId: input.tenantId,
        destinatarios: usuarios.map((u) => ({ email: u.email, nome: u.name })),
        requestId: input.requestId,
        titulo: input.titulo,
        motivo: input.motivo,
      }),
      avisarClientePorPush(input.tenantId, usuarios.map((u) => u.id), {
        tipo: "pendencia",
        motivo: input.motivo,
        titulo: input.titulo,
        requestId: input.requestId,
      }),
    ]);
    return { ...r, semDestinatario: false };
  } catch (err) {
    console.error("[avisarClienteDaPendencia]", err);
    return { enviados: 0, falhas: 1, semSmtp: false, semDestinatario: false };
  }
}

/** Texto curto para a tela dizer o que aconteceu com o aviso. `null` quando saiu tudo. */
export function resumoDoAviso(r: ResultadoDoAviso & { semDestinatario: boolean }): string | null {
  if (r.semDestinatario) return "Nenhum usuário ativo do portal nesta empresa — ninguém foi avisado por e-mail.";
  if (r.semSmtp) return "E-mail não enviado: o SMTP deste workspace não está configurado. O cliente vê a pendência ao entrar no portal.";
  if (r.falhas > 0) return `${r.falhas} e-mail(s) de aviso falharam. O cliente vê a pendência ao entrar no portal.`;
  return null;
}

export async function avisarEquipeDaResposta(input: {
  tenantId: string;
  createdById: string | null;
  titulo: string;
  empresaNome: string;
}): Promise<void> {
  if (!input.createdById) return;
  try {
    await notifyUser(input.createdById, {
      tenantId: input.tenantId,
      type: "client_request_answered",
      message: `${input.empresaNome} respondeu a pendência “${input.titulo}”.`,
    });
  } catch (err) {
    console.error("[avisarEquipeDaResposta]", err);
  }
}
