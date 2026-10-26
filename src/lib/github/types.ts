export const GITHUB_MODULE = "tech_github_contributions";
export const CONTRIBUTION_TYPES = ["COMMIT", "PULL_REQUEST", "ISSUE", "REVIEW"] as const;
export type ContributionType = typeof CONTRIBUTION_TYPES[number];
export const TYPE_LABELS: Record<ContributionType, string> = {
  COMMIT: "Commits", PULL_REQUEST: "Pull requests", ISSUE: "Issues", REVIEW: "Revisões",
};
export type GithubIdentity = { externalId: string; login: string; isBot: boolean; unidentified: boolean };
export type Contribution = {
  externalId: string; type: ContributionType; user: GithubIdentity; occurredAt: Date; url: string; number: number | null;
};
export type RepositoryView = {
  id: string; fullName: string; owner: string; private: boolean; fork: boolean; archived: boolean;
  selected: boolean; accessible: boolean; error: string | null;
};
export type IntegrationView = {
  serverReady: boolean; callbackUrl: string | null; clientId: string; hasClientSecret: boolean;
  configured: boolean; connected: boolean; login: string | null; status: string; enabled: boolean;
  generation: number; timezone: string; intervalMinutes: number; error: string | null;
  inventoryAt: string | null; pending: number; failed: number; repositories: RepositoryView[];
  progress: SyncProgress | null;
};
export type SyncProgress = {
  state: "disconnected" | "paused" | "processing" | "waiting" | "queued" | "error" | "idle";
  automatic: boolean; done: number; pending: number; failed: number; total: number;
  lastActivityAt: string | null; nextAttemptAt: string | null;
};
export type HeatmapUser = {
  id: string; login: string; isBot: boolean; tracked: boolean; total: number; activeDays: number;
  counts: Record<ContributionType, number>; days: { day: string; count: number }[];
};
export type GithubSummary = {
  counts: Record<ContributionType, number>;
  activeDevelopers: number;
  days: { day: string; counts: Record<ContributionType, number> }[];
  leaders: { id: string; login: string; total: number }[];
  recent: (DayEvent & { reference: string })[];
};
// O painel lê só o acervo gravado; cobertura e fila ficam em Integrações (26/10/2026).
// `message` aparece apenas quando não há o que mostrar: sem conexão ou sem repositório.
export type DashboardView = {
  connected: boolean; enabled: boolean; login: string | null; timezone: string;
  from: string; to: string; message: string | null; users: HeatmapUser[]; totalUsers: number;
  page: number; pageSize: number; unidentified: number; total: number;
  summary: GithubSummary | null;
};
export type DayEvent = { id: string; type: ContributionType; url: string; occurredAt: string; repository: string; login: string; number: number | null };
