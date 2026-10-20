export type EventoOps = {
  id: string; watcherSlug: string; watcherName: string; filename: string; filenameRenamed: string | null;
  status: "SUCCESS" | "ERROR" | "WARNING"; errorMessage: string | null; client: string | null; processedAt: string;
};
export type WatcherOps = {
  ownerId: string | null; ownerName: string | null;
  slug: string; name: string; description: string | null; client: string | null;
  folderInput: string | null; folderOutput: string | null; isActive: boolean; version: number;
  hasToken: boolean; lastHeartbeatAt: string | null; lastEvent: EventoOps | null;
  totalToday: number; successToday: number; errorToday: number;
  instabilityReportedAt: string | null; instabilityNote: string | null;
  instabilityReportedByName: string | null; instabilityTicketId: string | null;
};
export type PainelOps = {
  owners: { id: string; name: string }[];
  watchers: WatcherOps[]; events: EventoOps[]; total: number; page: number; pageSize: number;
  summary: { total: number; success: number; error: number; warning: number; successRate: number | null };
  serverTime: string;
};
