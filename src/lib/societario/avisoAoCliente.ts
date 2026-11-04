// Avisar o cliente de novidade no processo (e-mail e push no portal). Saiu de
// `processos/conversa-actions.ts` em 04/11/2026 para a abertura guiada usar o
// mesmo aviso ao mandar o pedido de documentos — num arquivo "use server" ele
// viraria uma action exposta.

import { nomeExibicao } from "@/lib/companyName";
import { usuariosDoPortalDaEmpresa } from "@/lib/financeiro/pendencias/avisos";
import { sendNovidadeNoProcessoEmail } from "@/lib/email/sendMail";
import { avisarClientePorPush } from "@/lib/portal/avisos";

export type ProcessoParaAviso = {
  id: string;
  title: string | null;
  companyId: string;
  type: { name: string };
  company: { name: string; displayName: string | null };
};

/** Avisa os usuários do portal da empresa. Best-effort: o envio já está gravado. */
export async function avisarClienteDoProcesso(tenantId: string, processo: ProcessoParaAviso, motivo: "mensagem" | "documento"): Promise<string | null> {
  try {
    const destinatarios = await usuariosDoPortalDaEmpresa(tenantId, processo.companyId);
    if (destinatarios.length === 0) {
      return "Nenhum usuário ativo do portal nesta empresa — fica gravado aqui até alguém ter acesso.";
    }
    const processoNome = `${processo.title || processo.type.name} — ${nomeExibicao(processo.company)}`;
    const [envio] = await Promise.all([
      sendNovidadeNoProcessoEmail({
        tenantId,
        destinatarios: destinatarios.map((u) => ({ email: u.email, nome: u.name })),
        processId: processo.id,
        processoNome,
        motivo,
      }),
      avisarClientePorPush(tenantId, destinatarios.map((u) => u.id), {
        tipo: "processo",
        motivo,
        processoNome,
        processId: processo.id,
      }),
    ]);
    if (envio.semSmtp) return "Gravado, mas o SMTP deste workspace não está configurado: o cliente só vê ao entrar no portal.";
    if (envio.falhas > 0) return `${envio.falhas} aviso(s) por e-mail falharam. O cliente vê ao entrar no portal.`;
    return null;
  } catch (err) {
    console.error("[processo:conversa] aviso ao cliente", processo.id, err);
    return "Gravado, mas o aviso ao cliente falhou. Ele vê ao entrar no portal.";
  }
}
