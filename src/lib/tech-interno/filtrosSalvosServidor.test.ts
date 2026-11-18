import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AuthContext } from "@/lib/auth/context";

const db = vi.hoisted(() => ({
  techInternalSavedFilter: { findMany: vi.fn(), create: vi.fn(), deleteMany: vi.fn() },
  $transaction: vi.fn(),
}));
const podeNoModulo = vi.hoisted(() => vi.fn());
vi.mock("@/lib/prisma", () => ({ getPrisma: () => db }));
vi.mock("@/lib/auth/modulo", () => ({ podeNoModulo }));
vi.mock("@/lib/audit", () => ({ logAudit: vi.fn() }));

import { excluirFiltroSalvo, listarFiltrosSalvos, salvarFiltro } from "./filtrosSalvosServidor";

const ctx = { userId: "u1", tenantId: "t1", role: "SECTOR_USER", sectors: ["tech"], subscriptionReadOnly: false } as AuthContext;
const linha = (name: string, query: string) => ({ id: `id-${name}`, name, query });

beforeEach(() => {
  vi.clearAllMocks();
  podeNoModulo.mockResolvedValue(true);
  db.$transaction.mockImplementation(async (fn: (tx: typeof db) => unknown) => fn(db));
  db.techInternalSavedFilter.findMany.mockResolvedValue([]);
  db.techInternalSavedFilter.create.mockResolvedValue({ id: "novo" });
});

describe("filtros salvos do Controle interno no servidor", () => {
  it("lista só os da pessoa da sessão", async () => {
    db.techInternalSavedFilter.findMany.mockResolvedValue([linha("Meus bugs", "tipo=BUG")]);
    expect(await listarFiltrosSalvos(ctx)).toEqual([{ id: "id-Meus bugs", nome: "Meus bugs", query: "tipo=BUG" }]);
    expect(db.techInternalSavedFilter.findMany.mock.calls[0][0].where).toEqual({ tenantId: "t1", userId: "u1" });
  });

  it("sem a tabela (deploy antes da migration), a lista sai vazia", async () => {
    db.techInternalSavedFilter.findMany.mockRejectedValue(Object.assign(new Error("tabela"), { code: "P2021" }));
    expect(await listarFiltrosSalvos(ctx)).toEqual([]);
  });

  it("sem acesso ao módulo, nada é lido nem gravado", async () => {
    podeNoModulo.mockResolvedValue(false);
    await expect(listarFiltrosSalvos(ctx)).rejects.toThrow("Controle interno indisponível");
    expect(await salvarFiltro(ctx, { nome: "X", query: "tipo=BUG" })).toMatchObject({ code: "forbidden" });
    expect(await excluirFiltroSalvo(ctx, "id")).toMatchObject({ code: "forbidden" });
    expect(db.techInternalSavedFilter.create).not.toHaveBeenCalled();
    expect(db.techInternalSavedFilter.deleteMany).not.toHaveBeenCalled();
  });

  it("salva com o dono da sessão, o nome limpo e a query normalizada", async () => {
    expect(await salvarFiltro(ctx, { nome: " Meus  bugs ", query: "responsavel=me&tipo=BUG&page=2" })).toEqual({ ok: true, id: "novo", nome: "Meus bugs" });
    expect(db.techInternalSavedFilter.create.mock.calls[0][0].data).toEqual({ tenantId: "t1", userId: "u1", name: "Meus bugs", query: "tipo=BUG&responsavel=me" });
  });

  it("recusa sem filtro, acima do limite e com nome repetido", async () => {
    expect(await salvarFiltro(ctx, { nome: "Nada", query: "visao=kanban" })).toMatchObject({ code: "validation_error" });
    db.techInternalSavedFilter.findMany.mockResolvedValue(Array.from({ length: 20 }, (_, i) => linha(`F${i}`, `q=${i}`)));
    expect(await salvarFiltro(ctx, { nome: "Novo", query: "tipo=BUG" })).toMatchObject({ code: "conflict", error: expect.stringContaining("20 filtros") });
    db.techInternalSavedFilter.findMany.mockResolvedValue([linha("meus BUGS", "tipo=TEST")]);
    expect(await salvarFiltro(ctx, { nome: "Meus bugs", query: "tipo=BUG" })).toMatchObject({ code: "conflict" });
    expect(db.techInternalSavedFilter.create).not.toHaveBeenCalled();
  });

  it("exclui só o da própria pessoa", async () => {
    db.techInternalSavedFilter.deleteMany.mockResolvedValue({ count: 1 });
    expect(await excluirFiltroSalvo(ctx, "f1")).toEqual({ ok: true });
    expect(db.techInternalSavedFilter.deleteMany.mock.calls[0][0].where).toEqual({ id: "f1", tenantId: "t1", userId: "u1" });
    db.techInternalSavedFilter.deleteMany.mockResolvedValue({ count: 0 });
    expect(await excluirFiltroSalvo(ctx, "de-outra-pessoa")).toMatchObject({ code: "not_found" });
    expect(await excluirFiltroSalvo(ctx, 42)).toMatchObject({ code: "not_found" });
  });
});
