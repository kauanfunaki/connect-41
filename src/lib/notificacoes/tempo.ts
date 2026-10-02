// Quando, em palavras, para o sino e a central de notificações (02/10/2026).
// Sempre no fuso de São Paulo: "hoje" é o dia do escritório, e não o do
// servidor (UTC em produção).

import { saoPauloParts, addDaysToKey } from "@/lib/agenda";
import { formatInstantDate, formatInstantTime } from "@/lib/format";

/** "Hoje", "Ontem" ou "seg., 28 de set." — o título do grupo na central. */
export function grupoDoDia(quando: Date, agora: Date = new Date()): string {
  const dia = saoPauloParts(quando).dateKey;
  const hoje = saoPauloParts(agora).dateKey;
  if (dia === hoje) return "Hoje";
  if (dia === addDaysToKey(hoje, -1)) return "Ontem";
  const mesmoAno = dia.slice(0, 4) === hoje.slice(0, 4);
  const t = formatInstantDate(quando, { weekday: "short", day: "2-digit", month: "short", ...(mesmoAno ? {} : { year: "numeric" }) });
  // Só a primeira letra: "Seg., 28 de set." — o `capitalize` do CSS fazia "De Set.".
  return t.charAt(0).toUpperCase() + t.slice(1);
}

/** A chave do grupo, para juntar as notificações do mesmo dia. */
export function chaveDoDia(quando: Date): string {
  return saoPauloParts(quando).dateKey;
}

/** "agora", "há 5 min", "há 2 h", "ontem, 14:30", "28 de set." — no cartão do sino. */
export function tempoRelativo(quando: Date, agora: Date = new Date()): string {
  const minutos = Math.floor((agora.getTime() - quando.getTime()) / 60_000);
  if (minutos < 1) return "agora";
  if (minutos < 60) return `há ${minutos} min`;
  const dia = saoPauloParts(quando).dateKey;
  const hoje = saoPauloParts(agora).dateKey;
  if (dia === hoje) return `há ${Math.floor(minutos / 60)} h`;
  if (dia === addDaysToKey(hoje, -1)) return `ontem, ${hora(quando)}`;
  return formatInstantDate(quando, { day: "2-digit", month: "short", ...(dia.slice(0, 4) === hoje.slice(0, 4) ? {} : { year: "numeric" }) });
}

/** "14:30", na linha do tempo da central. */
export function hora(quando: Date): string {
  return formatInstantTime(quando, { hour: "2-digit", minute: "2-digit" });
}
