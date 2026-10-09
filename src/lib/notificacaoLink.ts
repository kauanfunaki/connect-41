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
  // Aviso de órgão sem processo ligado: vai para a lista, onde a pessoa escolhe.
  if (n.type === "AVISO_ORGAO_SEM_PROCESSO") return "/processos/avisos";
  // Alertas da Gestão (processo ou card parado, prazo): a lista mostra o item e o link dele.
  // GESTAO_ALERTA é o tipo único de antes de 05/10/2026, nas notificações já gravadas.
  if (n.type === "GESTAO_PARADO" || n.type === "GESTAO_PRAZO" || n.type === "GESTAO_ALERTA") return "/gestao/alertas";
  // Fim (ou parada) da conferência das autorizações no Serpro: abre a lista.
  if (n.type === "SERPRO_CONFERENCIA") return "/autorizacoes";
  // Várias conversas do WhatsApp passadas de uma vez (02/10/2026): o aviso é um
  // só, sem conversa própria, e abre a lista das que estão com a pessoa.
  if (n.type === "WHATSAPP_HANDOFF" && !n.entityId) return "/whatsapp?ver=minhas";
  if (!n.entityId) return null;
  if (n.type.startsWith("WHATSAPP_")) return `/whatsapp/${n.entityId}`;
  if (n.type.startsWith("PROCESS_")) return `/processos/${n.entityId}`;
  if (n.type.startsWith("SOLICITACAO_")) return `/solicitacoes/${n.entityId}`;
  // Lead novo do Comercial (05/10/2026): abre a ficha do lead.
  if (n.type.startsWith("LEAD_")) return `/leads/${n.entityId}`;
  if (n.type === "client_request_answered") return `/pendencias/${n.entityId}`;
  // Arquivo que o cliente mandou pelo portal (09/10/2026): abre a pasta
  // "Enviados pelo cliente" da empresa — `pasta=enviados` é resolvido na página.
  if (n.type === "ARQUIVO_DO_CLIENTE") return `/arquivos/empresa/${n.entityId}?pasta=enviados`;
  // Arquivo com vencimento: o id é o da pasta, e /arquivos/pasta/[id] leva à
  // tela certa (da empresa ou das internas).
  if (n.type === "DRIVE_FILE_EXPIRING") return `/arquivos/pasta/${n.entityId}`;
  if (n.entityType === "COMPANY") return `/empresas/${n.entityId}`;
  if (n.entityType === "PERSON") return `/pessoas/${n.entityId}`;
  // Menção e comentário guardam o id do card (desde 02/10/2026): o card solto,
  // sem empresa nem pessoa, gerava notificação que não abria nada. A rota
  // acha a lista do card e redireciona.
  if (n.type === "MENTION" || n.type === "COMMENT") return `/kanban/itens/${n.entityId}`;
  return null;
}
