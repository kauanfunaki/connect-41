import { z } from "zod";
import { CONTRIBUTION_TYPES, type Contribution, type ContributionType, type GithubIdentity } from "./types";

export class GithubError extends Error {
  constructor(message: string, public status = 400, public retryAt?: Date, public category: "input" | "access" | "auth" | "limit" | "network" = "input") {
    super(message); this.name = "GithubError";
  }
}
export const loginSchema = z.string().trim().regex(/^[a-z\d](?:[a-z\d-]{0,38}[a-z\d])?$/i, "Informe um login GitHub válido.");
const dateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(value => {
  const date = new Date(`${value}T12:00:00Z`); return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}, "Data inválida.");
export const filtersSchema = z.object({
  from: dateSchema.optional(), to: dateSchema.optional(), repository: z.string().uuid().optional(),
  organization: z.string().max(100).optional(), user: z.string().max(100).optional(),
  type: z.enum(CONTRIBUTION_TYPES).optional(), bots: z.enum(["0", "1"]).default("0"),
  page: z.coerce.number().int().min(1).max(10000).default(1),
  view: z.enum(["general", "developers"]).default("developers"),
});
export type Filters = z.infer<typeof filtersSchema>;
export const settingsSchema = z.object({
  repositories: z.array(z.string().uuid()).max(1000),
  timezone: z.string().max(80).refine(value => { try { new Intl.DateTimeFormat("en", { timeZone: value }); return true; } catch { return false; } }, "Fuso horário inválido."),
  intervalMinutes: z.number().int().min(10).max(1440),
  generation: z.number().int().nonnegative(),
});
export function dayAt(date: Date, timezone = "America/Sao_Paulo"): string {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(date);
  const get = (key: string) => parts.find(part => part.type === key)!.value;
  return `${get("year")}-${get("month")}-${get("day")}`;
}
export function historyStart(now = new Date()): Date { return new Date(now.getTime() - 366 * 86400000); }
export function period(filters: Filters, now: Date, timezone: string) {
  const from = filters.from ?? dayAt(new Date(now.getTime() - 365 * 86400000), timezone), to = filters.to ?? dayAt(now, timezone);
  if (from > to || (Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86400000 > 366) {
    throw new GithubError("Selecione um período de até 12 meses, com início anterior ao fim.");
  }
  return { from, to };
}
const identitySchema = z.object({ node_id: z.string().min(1).max(100), login: z.string().min(1).max(100), type: z.string().optional() });
export function identity(value: unknown): GithubIdentity {
  if (value === null) return { externalId: "unknown", login: "Autoria não identificada", isBot: false, unidentified: true };
  const raw = identitySchema.parse(value);
  return { externalId: raw.node_id, login: raw.login, isBot: raw.type === "Bot" || raw.login.endsWith("[bot]"), unidentified: false };
}
export function safeGithubUrl(value: unknown): string {
  if (typeof value !== "string" || value.length > 1000) throw new GithubError("Link GitHub inválido na resposta.", 502);
  const url = new URL(value);
  if (url.protocol !== "https:" || url.hostname !== "github.com" || url.username || url.password || url.port) throw new GithubError("Link GitHub inválido na resposta.", 502);
  return url.toString();
}
const instant = z.string().datetime({ offset: true });
const common = z.object({ node_id: z.string().min(1).max(100), user: z.unknown(), html_url: z.string(), number: z.number().int().positive().optional() });
export function normalize(value: unknown, resource: "COMMIT" | "ISSUE" | "PULL_REQUEST" | "REVIEW"): Contribution | null {
  if (resource === "COMMIT") {
    const raw = z.object({ sha: z.string().regex(/^[a-f\d]{40,64}$/i), author: z.unknown(), html_url: z.string(),
      commit: z.object({ committer: z.object({ date: instant }) }) }).parse(value);
    return { externalId: raw.sha, type: resource, user: identity(raw.author ?? null), occurredAt: new Date(raw.commit.committer.date), url: safeGithubUrl(raw.html_url), number: null };
  }
  if (resource === "REVIEW") {
    const raw = common.extend({ submitted_at: instant.nullish(), state: z.string() }).parse(value);
    if (!raw.submitted_at || raw.state === "PENDING") return null;
    return { externalId: raw.node_id, type: resource, user: identity(raw.user ?? null), occurredAt: new Date(raw.submitted_at), url: safeGithubUrl(raw.html_url), number: null };
  }
  const raw = common.extend({ created_at: instant, pull_request: z.unknown().optional() }).parse(value);
  if (resource === "ISSUE" && raw.pull_request !== undefined) return null;
  return { externalId: raw.node_id, type: resource, user: identity(raw.user ?? null), occurredAt: new Date(raw.created_at), url: safeGithubUrl(raw.html_url), number: raw.number ?? null };
}
export const emptyCounts = () => Object.fromEntries(CONTRIBUTION_TYPES.map(type => [type, 0])) as Record<ContributionType, number>;
export function intensity(count: number) { return count === 0 ? 0 : count < 3 ? 1 : count < 6 ? 2 : count < 10 ? 3 : 4; }
