// Quem fica sabendo de uma solicitação, e por onde.
//
// Mesma régua da pendência: equipe pelo sino, cliente por e-mail e push, tudo
// best-effort — a solicitação já está gravada quando o aviso sai.
//
// Na equipe, o aviso vai para o **responsável**, quando há; sem responsável,
// para o setor que atende, que é quem precisa ver para alguém assumir.

import { getPrisma } from "@/lib/prisma";
import { notifySector, notifyUser } from "@/lib/notifications";
import { sendSolicitacaoAoClienteEmail, type ResultadoDoAviso } from "@/lib/email/sendMail";
import { avisarClientePorPush } from "@/lib/portal/avisos";
import { usuariosDoPortalDaEmpresa } from "@/lib/financeiro/pendencias/avisos";

type DaSolicitacao = { tenantId: string; id: string; numero: number; assunto: string; empresaNome: string };

const TEXTO_PARA_EQUIPE = {
  nova: (s: DaSolicitacao) => `${s.empresaNome} abriu a solicitação nº ${s.numero}: ${s.assunto}.`,
  resposta: (s: DaSolicitacao) => `${s.empresaNome} respondeu na solicitação nº ${s.numero}.`,
  encaminhada: (s: DaSolicitacao) => `Solicitação nº ${s.numero} (${s.empresaNome}) encaminhada ao seu setor: ${s.assunto}.`,
  cancelada: (s: DaSolicitacao) => `${s.empresaNome} cancelou a solicitação nº ${s.numero}.`,
} as const;

const TIPO_DO_AVISO = {
  nova: "SOLICITACAO_NOVA",
  resposta: "SOLICITACAO_RESPOSTA",
  encaminhada: "SOLICITACAO_ENCAMINHADA",
  cancelada: "SOLICITACAO_CANCELADA",
} as const;

export async function avisarEquipeDaSolicitacao(
  s: DaSolicitacao & { setor: string; assigneeId: string | null },
  motivo: keyof typeof TEXTO_PARA_EQUIPE,
  /** Quem da equipe causou (o encaminhamento) — a foto no sino (05/10/2026). Do cliente, nenhum. */
  autorId?: string | null
): Promise<void> {
  const aviso = { tenantId: s.tenantId, type: TIPO_DO_AVISO[motivo], message: TEXTO_PARA_EQUIPE[motivo](s), entityId: s.id, actorUserId: autorId ?? null };
  try {
    if (s.assigneeId) await notifyUser(s.assigneeId, aviso);
    else await notifySector(s.setor, aviso);
  } catch (err) {
    console.error("[avisarEquipeDaSolicitacao]", err);
  }
}

export type AvisoAoCliente = ResultadoDoAviso & { semDestinatario: boolean };

export async function avisarClienteDaSolicitacao(
  s: { tenantId: string; companyId: string; id: string; numero: number; assunto: string },
  motivo: "resposta" | "aguardando" | "concluida"
): Promise<AvisoAoCliente> {
  try {
    const usuarios = await usuariosDoPortalDaEmpresa(s.tenantId, s.companyId);
    if (usuarios.length === 0) return { enviados: 0, falhas: 0, semSmtp: false, semDestinatario: true };
    const [r] = await Promise.all([
      sendSolicitacaoAoClienteEmail({
        tenantId: s.tenantId,
        destinatarios: usuarios.map((u) => ({ email: u.email, nome: u.name })),
        solicitacaoId: s.id,
        numero: s.numero,
        assunto: s.assunto,
        motivo,
      }),
      avisarClientePorPush(s.tenantId, usuarios.map((u) => u.id), { tipo: "solicitacao", motivo, numero: s.numero, assunto: s.assunto, id: s.id }),
    ]);
    return { ...r, semDestinatario: false };
  } catch (err) {
    console.error("[avisarClienteDaSolicitacao]", err);
    return { enviados: 0, falhas: 1, semSmtp: false, semDestinatario: false };
  }
}

/** Texto curto para a tela dizer o que aconteceu com o aviso ao cliente. `null` quando saiu tudo. */
export function resumoDoAvisoAoCliente(r: AvisoAoCliente): string | null {
  if (r.semDestinatario) return "Nenhum usuário ativo do portal nesta empresa — ninguém foi avisado por e-mail.";
  if (r.semSmtp) return "E-mail não enviado: o SMTP deste workspace não está configurado. O cliente vê a resposta ao entrar no portal.";
  if (r.falhas > 0) return `${r.falhas} e-mail(s) de aviso falharam. O cliente vê a resposta ao entrar no portal.`;
  return null;
}

/**
 * O responsável da empresa no setor (`CompanyService`), se for alguém ativo.
 *
 * É quem já cuida daquela empresa naquele setor — a solicitação cai direto com
 * ele, em vez de esperar alguém do setor assumir.
 */
export async function responsavelDaEmpresaNoSetor(tenantId: string, companyId: string, sectorCode: string): Promise<string | null> {
  const servico = await getPrisma().companyService.findFirst({
    where: { tenantId, companyId, sectorCode, status: "ACTIVE", responsibleUserId: { not: null } },
    select: { responsible: { select: { id: true, active: true } } },
  });
  return servico?.responsible?.active ? servico.responsible.id : null;
}
