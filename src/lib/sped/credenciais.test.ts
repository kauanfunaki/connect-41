import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// A regra travada aqui: a credencial do SPED é do CLIENTE. Tenant sem a
// integração ligada não recebe credencial nenhuma — nem a do ambiente.
//
// Regressão de 14/09: com fallback no `.env`, o cron consultava o SPED da 41
// com a raiz de CNPJ do 41 TALLENT, que não tem SPED, a cada 10 minutos.

const findUnique = vi.fn();
vi.mock("@/lib/prisma", () => ({
  getPrisma: () => ({ tenantIntegration: { findUnique } }),
}));

const lerConfig = vi.fn();
vi.mock("@/lib/integracoes/data", () => ({ lerConfig }));

const { credenciaisDoSped } = await import("./credenciais");

const COMPLETA = { baseUrl: "https://sped.cliente.com.br/", serviceToken: "t-cliente" };

describe("credenciaisDoSped", () => {
  beforeEach(() => {
    findUnique.mockReset();
    lerConfig.mockReset().mockReturnValue(COMPLETA);
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it("tenant sem integração não recebe credencial, mesmo com o ambiente preenchido", async () => {
    vi.stubEnv("SPED_API_URL", "https://sped.da-41.com.br");
    vi.stubEnv("SPED_API_TOKEN", "t-da-41");
    findUnique.mockResolvedValue(null);
    expect(await credenciaisDoSped("tallent")).toBeNull();
  });

  it("integração desligada não recebe credencial, mesmo completa", async () => {
    findUnique.mockResolvedValue({ enabled: false, configEnc: "x" });
    expect(await credenciaisDoSped("t1")).toBeNull();
  });

  it("integração ligada e completa devolve a credencial dela, sem barra no fim da URL", async () => {
    findUnique.mockResolvedValue({ enabled: true, configEnc: "x" });
    expect(await credenciaisDoSped("t1")).toEqual({ baseUrl: "https://sped.cliente.com.br", token: "t-cliente" });
  });

  // Calado, parece que o cliente simplesmente não tem documento.
  it("integração ligada e incompleta não sincroniza, e avisa no log", async () => {
    const aviso = vi.spyOn(console, "warn").mockImplementation(() => {});
    findUnique.mockResolvedValue({ enabled: true, configEnc: "x" });
    lerConfig.mockReturnValue({ baseUrl: "https://sped.cliente.com.br" });
    expect(await credenciaisDoSped("t1")).toBeNull();
    expect(aviso).toHaveBeenCalledOnce();
  });

  it("consulta a instância do próprio tenant", async () => {
    findUnique.mockResolvedValue(null);
    await credenciaisDoSped("t-abc");
    expect(findUnique.mock.calls[0][0].where).toEqual({
      tenantId_integrationCode_instanceKey: { tenantId: "t-abc", integrationCode: "sped", instanceKey: "default" },
    });
  });
});
