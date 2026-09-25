// Os avisos por push do cliente no portal.
//
// O texto é decidido aqui, longe do envio, porque ele tem uma regra que não
// pode se perder no meio de uma action: **push não leva conteúdo**. Ele aparece
// na tela de bloqueio, à vista de quem estiver por perto, e é o canal menos
// privado que temos. A régua é a mesma dos e-mails ao cliente, que já levam só
// o título da pendência, o nome da empresa ou a contagem — valor, fornecedor,
// documento e corpo de mensagem ficam atrás do login do portal.
//
// Quem chama nunca monta o texto à mão: `textoDoAviso` é a única porta.

import { sendWebPushToPortalUsers } from "@/lib/webPush";

export type AvisoDoPortal =
  | { tipo: "pendencia"; motivo: "nova" | "resposta" | "lembrete"; titulo: string; requestId: string }
  | { tipo: "mensagem"; empresaNome: string }
  | { tipo: "processo"; motivo: "mensagem" | "documento"; processoNome: string; processId: string }
  | { tipo: "aprovacao"; quantidade: number };

export type TextoEmPush = { title: string; body: string; url: string };

export function textoDoAviso(aviso: AvisoDoPortal): TextoEmPush {
  switch (aviso.tipo) {
    case "pendencia":
      return {
        title: {
          nova: "Nova pendência",
          resposta: "Resposta na pendência",
          lembrete: "Pendência vencida",
        }[aviso.motivo],
        // O título da pendência é o mesmo que já vai no assunto do e-mail.
        body: aviso.titulo,
        url: `/portal/pendencias/${aviso.requestId}`,
      };
    case "mensagem":
      return {
        title: "Nova mensagem",
        body: `A equipe deixou uma mensagem sobre ${aviso.empresaNome}.`,
        url: "/portal/comunicacao",
      };
    case "processo":
      // O nome do processo (tipo e empresa) é o que já aparece na lista do
      // portal — nada do que foi escrito ou anexado.
      return {
        title: aviso.motivo === "mensagem" ? "Nova mensagem no processo" : "Novo documento no processo",
        body: aviso.processoNome,
        url: `/portal/processos/${aviso.processId}`,
      };
    case "aprovacao":
      return {
        title:
          aviso.quantidade === 1
            ? "Conta a pagar aguardando aprovação"
            : `${aviso.quantidade} contas a pagar aguardando aprovação`,
        body: "A baixa só é feita depois da sua aprovação.",
        url: "/portal/aprovacoes",
      };
  }
}

/**
 * Manda o aviso para os clientes indicados. Best-effort como todo aviso do
 * portal: o que motivou o push já está gravado, e o cliente vê ao entrar.
 */
export async function avisarClientePorPush(
  tenantId: string,
  portalUserIds: string[],
  aviso: AvisoDoPortal
): Promise<void> {
  try {
    await sendWebPushToPortalUsers(tenantId, portalUserIds, textoDoAviso(aviso));
  } catch (err) {
    console.error("[avisarClientePorPush]", err);
  }
}
