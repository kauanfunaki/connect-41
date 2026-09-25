// Para onde uma notificação leva quando clicada.
//
// Um lugar só: o sino (layout), a página de notificações e o push do navegador
// montavam o mesmo link cada um do seu jeito, e só conheciam empresa e pessoa.
// A conversa do WhatsApp não é nenhuma das duas — vai pelo tipo.

type NotificacaoParaLink = {
  type: string;
  entityType?: string | null;
  entityId?: string | null;
};

export function linkDaNotificacao(n: NotificacaoParaLink): string | null {
  if (!n.entityId) return null;
  if (n.type.startsWith("WHATSAPP_")) return `/whatsapp/${n.entityId}`;
  if (n.type.startsWith("PROCESS_")) return `/processos/${n.entityId}`;
  if (n.entityType === "COMPANY") return `/empresas/${n.entityId}`;
  if (n.entityType === "PERSON") return `/pessoas/${n.entityId}`;
  return null;
}
