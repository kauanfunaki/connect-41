import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Prisma } from "@/generated/prisma/client";

const mocks = vi.hoisted(() => ({ findUnique: vi.fn() }));
vi.mock("@/lib/prisma", () => ({ getPrisma: () => ({ opsApiCredential: { findUnique: mocks.findUnique } }) }));
import { credencialOpsNaTela } from "./credencial";

describe("credencial do Ops Center em Integrações", () => {
  beforeEach(() => { mocks.findUnique.mockReset(); vi.spyOn(console, "error").mockImplementation(() => {}); });
  afterEach(() => vi.restoreAllMocks());

  it("distingue ausência de chave de falha na consulta e limita a leitura ao escritório", async () => {
    mocks.findUnique.mockResolvedValue(null);
    expect(await credencialOpsNaTela("escritorio-a")).toEqual({ status: "ready", hasToken: false, version: 0 });
    expect(mocks.findUnique).toHaveBeenCalledWith({ where: { tenantId: "escritorio-a" }, select: { tokenHash: true, version: true } });
  });

  it("retorna apenas a presença da chave e sua versão, sem expor o hash", async () => {
    mocks.findUnique.mockResolvedValue({ tokenHash: "hash-que-nao-pode-sair", version: 7 });
    const result = await credencialOpsNaTela("escritorio-a");
    expect(result).toEqual({ status: "ready", hasToken: true, version: 7 });
    expect(JSON.stringify(result)).not.toContain("hash-que-nao-pode-sair");
  });

  it("preserva a versão de uma credencial revogada", async () => {
    mocks.findUnique.mockResolvedValue({ tokenHash: null, version: 8 });
    expect(await credencialOpsNaTela("escritorio-a")).toEqual({ status: "ready", hasToken: false, version: 8 });
  });

  it.each(["P2021", "P2022"])("converte %s em atualização pendente sem anunciar chave ausente", async code => {
    mocks.findUnique.mockRejectedValue(new Prisma.PrismaClientKnownRequestError("Detalhes privados do driver", { code, clientVersion: "test" }));
    const result = await credencialOpsNaTela("escritorio-a");
    expect(result).toMatchObject({ status: "migration_required" });
    expect(result).not.toHaveProperty("hasToken");
    expect(result).not.toHaveProperty("version");
    expect(console.error).toHaveBeenCalledWith("[ops/credential] Consulta da configuração indisponível", { code });
  });

  it("isola outras falhas sem confundi-las com migration ausente nem vazar o erro", async () => {
    mocks.findUnique.mockRejectedValue(new Prisma.PrismaClientKnownRequestError("mysql://segredo@host", { code: "P1001", clientVersion: "test" }));
    const result = await credencialOpsNaTela("escritorio-a");
    expect(result).toMatchObject({ status: "unavailable" });
    expect(JSON.stringify(result)).not.toContain("mysql://");
    expect(console.error).toHaveBeenCalledWith("[ops/credential] Consulta da configuração indisponível", { code: "P1001" });
  });

  it("também protege o catálogo de falha inesperada sem registrar dados privados", async () => {
    mocks.findUnique.mockRejectedValue(new Error("senha-confidencial"));
    expect(await credencialOpsNaTela("escritorio-a")).toMatchObject({ status: "unavailable" });
    expect(console.error).toHaveBeenCalledWith("[ops/credential] Consulta da configuração indisponível", { code: "unknown" });
  });
});
