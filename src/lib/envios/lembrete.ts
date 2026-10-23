// O lembrete de não lido dos envios ao cliente (22/10/2026): quem manda o
// envio escolhe — nenhum, 2, 5 ou 10 dias —, e se ninguém do cliente abriu o
// documento nesse prazo sai UM lembrete: o mesmo e-mail do envio, com o texto
// de lembrete, aos destinatários do e-mail, e o push do portal a quem tem
// acesso. Um só por envio, de propósito: o cliente que ignorou dois avisos não
// lê o terceiro, e a equipe vê na ficha que o lembrete já saiu.
//
// O prazo é decidido envio a envio. Desde 23/10/2026 o escritório tem um
// padrão, que o envio novo já traz escolhido (`lembretePadrao.ts`, em
// Administração › Portal do cliente › Envios); sem ele, "sem lembrete".
//
// Puro: a escolha do prazo, quando o lembrete vence e o texto da ficha. Quem
// busca, trava e envia é `agendador.ts`.

import { formatInstantDateTime } from "@/lib/format";

const DIA_MS = 86_400_000;

/** Os prazos que a tela oferece. */
export const DIAS_DO_LEMBRETE = [2, 5, 10] as const;

export const OPCOES_DO_LEMBRETE: readonly { value: string; label: string }[] = [
  { value: "", label: "Sem lembrete" },
  ...DIAS_DO_LEMBRETE.map((d) => ({ value: String(d), label: `Lembrar se ninguém abrir em ${d} dias` })),
];

/** O prazo escolhido no formulário; qualquer outra coisa é "sem lembrete". */
export function lerDiasDoLembrete(valor: unknown): number | null {
  const n = Number(typeof valor === "string" ? valor.trim() : valor);
  return (DIAS_DO_LEMBRETE as readonly number[]).includes(n) ? n : null;
}

type LinhaDoLembrete = { sentAt: Date | null; firstViewedAt: Date | null; signedAt: Date | null };

export type EnvioDoLembrete = {
  status: "DRAFT" | "PUBLISHED";
  publishedAt: Date | null;
  reminderDays: number | null;
  reminderSentAt: Date | null;
  recipients: readonly LinhaDoLembrete[];
};

/**
 * De quando o prazo conta: o primeiro e-mail que saiu — é quando o cliente
 * ficou sabendo. Sem e-mail (só portal), a publicação.
 */
export function inicioDoPrazoDoLembrete(envio: Pick<EnvioDoLembrete, "publishedAt" | "recipients">): Date | null {
  const enviados = envio.recipients.map((r) => r.sentAt).filter((d): d is Date => !!d);
  if (enviados.length > 0) return new Date(Math.min(...enviados.map((d) => d.getTime())));
  return envio.publishedAt;
}

export type MotivoSemLembrete = "sem-lembrete" | "ja-enviado" | "nao-publicado" | "ja-aberto" | "aceito" | "no-prazo";

/**
 * Se o lembrete deste envio é devido agora. Rascunho (agendado ou não), envio
 * já aberto por alguém do cliente, já aceito ou com lembrete já enviado ficam
 * de fora — o lembrete é para quem nunca abriu.
 */
export function avaliarLembreteDoEnvio(envio: EnvioDoLembrete, agora: Date): { devido: true } | { devido: false; motivo: MotivoSemLembrete } {
  if (!envio.reminderDays) return { devido: false, motivo: "sem-lembrete" };
  if (envio.reminderSentAt) return { devido: false, motivo: "ja-enviado" };
  if (envio.status !== "PUBLISHED") return { devido: false, motivo: "nao-publicado" };
  if (envio.recipients.some((r) => r.signedAt)) return { devido: false, motivo: "aceito" };
  if (envio.recipients.some((r) => r.firstViewedAt)) return { devido: false, motivo: "ja-aberto" };
  const inicio = inicioDoPrazoDoLembrete(envio);
  if (!inicio || agora.getTime() < inicio.getTime() + envio.reminderDays * DIA_MS) return { devido: false, motivo: "no-prazo" };
  return { devido: true };
}

/**
 * Até quando o envio pode ter sido publicado para o lembrete já poder estar
 * vencido — o corte da consulta do agendador (o veredito é de
 * `avaliarLembreteDoEnvio`). O menor prazo vale para todos.
 */
export function publicadoAteParaLembrete(agora: Date): Date {
  return new Date(agora.getTime() - Math.min(...DIAS_DO_LEMBRETE) * DIA_MS);
}

/** A linha da ficha e da lista: o lembrete que saiu, ou o que está programado. `null` sem lembrete. */
export function textoDoLembrete(envio: Pick<EnvioDoLembrete, "reminderDays" | "reminderSentAt">): string | null {
  if (envio.reminderSentAt) return `Lembrete enviado em ${formatInstantDateTime(envio.reminderSentAt)}`;
  if (envio.reminderDays) return `Lembrete se ninguém abrir em ${envio.reminderDays} dias`;
  return null;
}
