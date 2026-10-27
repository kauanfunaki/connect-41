import { describe, expect, it, vi } from "vitest";
import type { GithubSyncJob } from "@/generated/prisma/client";
import { initialWindow, queueResource, type GithubDb } from "./store";
import { historyStart } from "./rules";

const now = new Date("2026-10-26T12:00:00Z"), day = 86400000;
const job = (values: Partial<GithubSyncJob>) => ({ coveredFrom: null, coveredThrough: null, cursor: {}, ...values }) as GithubSyncJob;
describe("janela de coleta GitHub", () => {
  it("repositório novo começa pelos últimos 30 dias e depois percorre os 12 meses", () => {
    expect(initialWindow(job({}), now)).toMatchObject({ phase: "recent", since: new Date(now.getTime() - 30 * day).toISOString(), until: now.toISOString() });
    expect(initialWindow(job({ cursor: { phase: "full" } }), now)).toMatchObject({ phase: "full", since: historyStart(now).toISOString() });
  });
  it("a rotina busca só alterações, com um dia de sobreposição, mesmo sem atualização completa há semanas", () => {
    const coveredThrough = new Date(now.getTime() - 2 * 3600000);
    const window = initialWindow(job({ coveredFrom: historyStart(now), coveredThrough, cursor: { lastHead: "a".repeat(40), lastFullAt: new Date(now.getTime() - 30 * day).toISOString() } }), now);
    expect(window).toMatchObject({ phase: "incremental", since: new Date(coveredThrough.getTime() - day).toISOString(), lastHead: "a".repeat(40) });
  });
  it("a atualização completa forçada volta aos 12 meses uma vez e não persiste o pedido", () => {
    const window = initialWindow(job({ coveredFrom: historyStart(now), coveredThrough: now, cursor: { forceFull: true, lastHead: "a".repeat(40) } }), now);
    expect(window).toMatchObject({ phase: "full", since: historyStart(now).toISOString(), lastHead: "a".repeat(40) });
    expect(window).not.toHaveProperty("forceFull");
  });
  it("reenfileirar preserva o pedido de atualização completa e a completa interrompida, e só eles", async () => {
    const upsert = vi.fn(), connection = { id: "conexao", tenantId: "escritorio", generation: 2 };
    const db = (cursor: object) => ({ githubSyncJob: { findUnique: async () => ({ state: "canceled", generation: 1, cursor, coveredFrom: now }), upsert } }) as unknown as GithubDb;
    await queueResource(db({ lastHead: "a", forceFull: true }), connection, "repo", "COMMIT");
    await queueResource(db({ phase: "full", page: 3, since: historyStart(now).toISOString() }), connection, "repo", "ISSUE");
    await queueResource(db({ lastHead: "a", lastFullAt: now.toISOString() }), connection, "repo", "PULL_REQUEST");
    await queueResource(db({ lastHead: "a" }), connection, "repo", "COMMIT", undefined, undefined, true);
    expect(upsert.mock.calls.map(([args]) => args.update.cursor)).toEqual([{ lastHead: "a", forceFull: true }, { forceFull: true }, { lastHead: "a" }, { lastHead: "a", forceFull: true }]);
  });
});
