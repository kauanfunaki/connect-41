// Rótulos pt-BR para os valores crus do Chatwoot (guardados como vêm da API;
// a humanização é só de exibição — mesmo princípio de digitsOnly/format.ts).

const CHANNEL_LABELS: Record<string, string> = {
  "Channel::WebWidget": "Site",
  "Channel::Whatsapp": "WhatsApp",
  "Channel::Api": "API",
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
  if (raw === "unknown" || raw === "") return "Canal não informado";
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
