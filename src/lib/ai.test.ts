import { beforeEach, describe, expect, it, vi } from "vitest";

// Chave do escritório que não decifra (05/10/2026): a página da vaga caía,
// porque `isAiConfigured` decifrava a chave só para saber se ela existia.
// Agora ela só olha a configuração, e quem falha — com mensagem — é a chamada.

const findUnique = vi.fn();
const decryptSecret = vi.fn();
vi.mock("@/lib/prisma", () => ({ getPrisma: () => ({ tenantAiConfig: { findUnique } }) }));
vi.mock("@/lib/crypto", () => ({ decryptSecret: (...a: unknown[]) => decryptSecret(...a) }));

const { isAiConfigured, summarizeCompanyHistory, CHAVE_DE_IA_ILEGIVEL } = await import("./ai");
const { ehBloqueioDoAgente } = await import("@/lib/recrutamento/triagem");

beforeEach(() => {
  vi.clearAllMocks();
  decryptSecret.mockImplementation(() => {
    throw new Error("Unsupported state or unable to authenticate data");
  });
});

describe("IA do escritório com a chave ilegível", () => {
  it("está configurada: a tela abre sem decifrar nada", async () => {
    findUnique.mockResolvedValue({ id: "cfg" });
    expect(await isAiConfigured("t1")).toBe(true);
    expect(findUnique.mock.calls[0][0]).toEqual({ where: { tenantId: "t1" }, select: { id: true } });
    expect(decryptSecret).not.toHaveBeenCalled();
  });

  it("sem configuração, não está", async () => {
    findUnique.mockResolvedValue(null);
    expect(await isAiConfigured("t1")).toBe(false);
  });

  it("a chamada de verdade falha com a mensagem, e não com o erro do crypto", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    findUnique.mockResolvedValue({ provider: "ANTHROPIC", apiKeyEnc: "a:b:c", model: null });
    await expect(summarizeCompanyHistory("t1", { companyName: "Acme", digest: "…" })).rejects.toThrow(CHAVE_DE_IA_ILEGIVEL);
  });

  it("a triagem lê a mensagem como problema do escritório, não do currículo", () => {
    expect(ehBloqueioDoAgente(CHAVE_DE_IA_ILEGIVEL)).toBe(true);
  });
});
