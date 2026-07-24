// Rótulos pt-BR para os valores crus do Chatwoot (guardados como vêm da API;
// a humanização é só de exibição — mesmo princípio de digitsOnly/format.ts).

// Channel::Api é o canal genérico que a integração via Evolution API usa pra
// falar com o Chatwoot (não existe canal nativo Channel::Whatsapp configurado
// hoje) — na prática, toda conversa que chega por "API" ou sem canal
// informado É WhatsApp. Quando um segundo provedor/canal for conectado no
// futuro, esse mapeamento vai precisar considerar o inboxId por conexão em
// vez de assumir um único canal fixo — não implementado ainda porque só
// existe 1 canal real hoje.
const CHANNEL_LABELS: Record<string, string> = {
  "Channel::WebWidget": "Site",
  "Channel::Whatsapp": "WhatsApp",
  "Channel::Api": "WhatsApp",
  "Channel::Email": "E-mail",
  "Channel::FacebookPage": "Facebook",
  "Channel::Instagram": "Instagram",
  "Channel::TwilioSms": "SMS",
  "Channel::Sms": "SMS",
  "Channel::Telegram": "Telegram",
  "Channel::Line": "Line",
};

export function channelLabel(raw: string): string {
  if (CHANNEL_LABELS[raw]) return CHANNEL_LABELS[raw];
  if (raw === "unknown" || raw === "") return "WhatsApp";
  // Canal desconhecido mas com o prefixo padrão — mostra só o nome da classe.
  return raw.replace(/^Channel::/, "");
}

const STATUS_LABELS: Record<string, string> = {
  open: "Aberta",
  resolved: "Resolvida",
  pending: "Pendente",
  snoozed: "Adiada",
};

export function statusLabel(raw: string): string {
  return STATUS_LABELS[raw] ?? raw;
}
