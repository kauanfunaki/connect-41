import { describe, expect, it, vi } from "vitest";
vi.mock("@/lib/prisma", () => ({ getPrisma: () => ({}) }));
vi.mock("@/lib/audit", () => ({ logAudit: async () => undefined }));
const { acaoSchema } = await import("./times");

const UUID = "3f1c6f0e-8a3b-4c55-9d7e-2b1a0c9e4d11";
describe("ações da aba Times do GitHub", () => {
  it("cria time com nome aparado e cor em #RRGGBB", () => {
    expect(acaoSchema.parse({ action: "criarTime", nome: "  Dev ", cor: "#2e6fb8" })).toEqual({ action: "criarTime", nome: "Dev", cor: "#2E6FB8" });
  });
  it("recusa nome vazio, nome longo e cor que não é cor", () => {
    expect(acaoSchema.safeParse({ action: "criarTime", nome: "   ", cor: "#2E6FB8" }).success).toBe(false);
    expect(acaoSchema.safeParse({ action: "criarTime", nome: "x".repeat(81), cor: "#2E6FB8" }).success).toBe(false);
    expect(acaoSchema.safeParse({ action: "criarTime", nome: "Dev", cor: "azul" }).success).toBe(false);
  });
  it("na pessoa, null tira do time e volta à cor automática; ausente não mexe", () => {
    expect(acaoSchema.parse({ action: "definirPessoa", externalId: "U_1", login: "ana", timeId: null, cor: null })).toMatchObject({ timeId: null, cor: null });
    const parcial = acaoSchema.parse({ action: "definirPessoa", externalId: "U_1", login: "ana", timeId: UUID });
    expect(parcial).toMatchObject({ timeId: UUID }); expect("cor" in parcial && parcial.cor !== undefined).toBe(false);
  });
  it("time precisa de id válido", () => {
    expect(acaoSchema.safeParse({ action: "excluirTime", id: "1" }).success).toBe(false);
    expect(acaoSchema.safeParse({ action: "definirPessoa", externalId: "U_1", login: "ana", timeId: "x" }).success).toBe(false);
  });
});
