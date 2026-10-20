import { z } from "zod";

export const MODULO_OPS = "tech_ops_center";
export const STATUS_OPS = ["SUCCESS", "ERROR", "WARNING"] as const;
export const ROTULOS_OPS = { SUCCESS: "Sucesso", ERROR: "Erro", WARNING: "Aviso" };
export const slugSchema = z.string().min(1).max(60).regex(/^[a-z0-9]+(?:[-_][a-z0-9]+)*$/);
const textoOpcional = (max: number) => z.string().trim().max(max).nullish().transform(v => v || null);
export const watcherSchema = z.object({
  slug: slugSchema, name: z.string().trim().min(1).max(120),
  ownerId: textoOpcional(191),
  description: textoOpcional(1000), client: textoOpcional(120),
  folderInput: textoOpcional(1000), folderOutput: textoOpcional(1000),
  isActive: z.boolean().default(true),
});
export const editarWatcherSchema = watcherSchema.omit({ slug: true }).extend({ version: z.number().int().min(0) });
export const eventoSchema = z.object({
  watcherSlug: slugSchema,
  // Identidade da tentativa, preservada em toda retransmissão pelo produtor.
  eventId: z.string().trim().min(1).max(100),
  filename: z.string().trim().min(1).max(1000), filenameRenamed: textoOpcional(1000),
  status: z.enum(STATUS_OPS), errorMessage: textoOpcional(10000), client: textoOpcional(120),
  n8nExecutionId: textoOpcional(120),
  processedAt: z.iso.datetime({ offset: true }).refine(v => new Date(v).getTime() <= Date.now() + 60_000, "Data futura.").optional(),
});
export const instabilidadeSchema = z.object({
  version: z.number().int().min(0), note: z.string().trim().min(3).max(2000), ticketId: textoOpcional(191),
});
export const versaoSchema = z.object({ version: z.number().int().min(0) });
export const filtrosSchema = z.object({
  watcher: slugSchema.optional(), status: z.enum(STATUS_OPS).optional(),
  date: z.iso.date().optional(), page: z.coerce.number().int().min(1).max(100000).default(1),
  mine: z.literal("1").optional(),
});
export type FiltrosOps = z.infer<typeof filtrosSchema>;

export function diaEmSaoPaulo(agora = new Date()) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit" }).format(agora);
}

export function periodoDoDia(dia: string) {
  const inicio = new Date(`${dia}T00:00:00-03:00`);
  return { gte: inicio, lt: new Date(inicio.getTime() + 86_400_000) };
}

export function atividade(lastHeartbeatAt: string | null, ativo: boolean, agora = Date.now()) {
  if (!ativo) return "Desativado";
  if (!lastHeartbeatAt) return "Sem sinal de atividade";
  const idade = agora - new Date(lastHeartbeatAt).getTime();
  return idade >= 0 && idade < 180_000 ? "Em execução" : "Sem comunicação";
}

export function caminhoDoEvento(evento: { filename: string; filenameRenamed: string | null }, watcher?: { folderInput: string | null; folderOutput: string | null }) {
  const destino = evento.filenameRenamed;
  if (destino && /^(?:[a-z]:[\\/]|[\\/]{2}|\/)/i.test(destino)) return destino;
  const nome = destino || evento.filename;
  if (/^(?:[a-z]:[\\/]|[\\/]{2}|\/)/i.test(nome)) return nome;
  const pasta = destino ? watcher?.folderOutput : watcher?.folderInput;
  return pasta ? `${pasta.replace(/[\\/]+$/, "")}${pasta.includes("\\") ? "\\" : "/"}${nome}` : nome;
}

export function ehIngestaoOps(method: string, pathname: string) {
  return method === "POST" && (pathname === "/api/ops/events" || /^\/api\/ops\/watchers\/[a-z0-9]+(?:[-_][a-z0-9]+)*\/heartbeat$/.test(pathname));
}
