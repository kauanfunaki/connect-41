import { saoPauloParts } from "@/lib/agenda";

/** Prazo é data-calendário: vence ao fim do dia, e não à meia-noite UTC. */
export function prazoDaTarefa(data: string, concluida = false, agora = new Date()) {
  if (concluida) return { classe: "text-fg-secondary", rotulo: "Concluída" };
  const hoje = saoPauloParts(agora).dateKey;
  const prazo = data.slice(0, 10);
  const dias = Math.round((Date.parse(prazo) - Date.parse(hoje)) / 86_400_000);
  if (dias < 0) return { classe: "text-danger", rotulo: "Atrasada" };
  if (dias === 0) return { classe: "text-warning-fg", rotulo: "Hoje" };
  if (dias <= 3) return { classe: "text-warning-fg", rotulo: dias === 1 ? "Amanhã" : "Em " + dias + " dias" };
  return { classe: "text-fg-secondary", rotulo: "No prazo" };
}
