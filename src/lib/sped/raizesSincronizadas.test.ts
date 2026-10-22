import { beforeEach, describe, expect, it, vi } from "vitest";

// O que se testa: de onde o SPED tira as raízes que sincroniza. Desde
// 14/10/2026 é a fotografia `sped_sync_roots`; desde 21/10/2026 (etapa 3 da
// saída do Cliente) não há mais volta para os clientes quando falta a tabela.

const m = vi.hoisted(() => ({ spedSyncRoot: { findMany: vi.fn() } }));
vi.mock("@/lib/prisma", () => ({ getPrisma: () => m }));

const { raizesDaFotografia, raizesSincronizadas } = await import("./raizesSincronizadas");

describe("raizesDaFotografia", () => {
  it("só raiz de 8 caracteres, sem repetir", () => {
    expect(raizesDaFotografia([{ cnpjRaiz: "11222333" }, { cnpjRaiz: "1234567" }, { cnpjRaiz: "" }, { cnpjRaiz: "11222333" }])).toEqual([
      "11222333",
    ]);
  });
});

describe("raizesSincronizadas — o que a sincronização e o CT-e leem", () => {
  beforeEach(() => vi.clearAllMocks());

  it("lê da fotografia, só do escritório pedido", async () => {
    m.spedSyncRoot.findMany.mockResolvedValueOnce([{ cnpjRaiz: "11222333" }, { cnpjRaiz: "44555666" }]);
    expect(await raizesSincronizadas("41")).toEqual(["11222333", "44555666"]);
    expect(m.spedSyncRoot.findMany.mock.calls[0]![0].where).toEqual({ tenantId: "41" });
  });

  it("erro do banco — inclusive a falta da tabela — sobe, e não vira lista vazia", async () => {
    m.spedSyncRoot.findMany.mockRejectedValueOnce(new Error("conexão caiu"));
    await expect(raizesSincronizadas("41")).rejects.toThrow("conexão caiu");
    m.spedSyncRoot.findMany.mockRejectedValueOnce(Object.assign(new Error("tabela não existe"), { code: "P2021" }));
    await expect(raizesSincronizadas("41")).rejects.toThrow("tabela não existe");
  });
});
