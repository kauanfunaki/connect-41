import { beforeEach, describe, expect, it, vi } from "vitest";

// O registro de uso do certificado (05/11/2026): grava o último uso e soma um
// na linha do dia, e nunca derruba quem chamou.

const m = vi.hoisted(() => ({
  upsert: vi.fn(),
  updateMany: vi.fn(),
  executeRaw: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  getPrisma: () => ({
    digitalCertificateUse: { upsert: m.upsert, updateMany: m.updateMany },
    $executeRaw: m.executeRaw,
  }),
}));

const { diaDoRegistro, registrarUsoDoCertificado, usoRegistravel } = await import("./registro");

const TENANT = "tenant-1";
// CNPJ de exemplo (dígitos verificadores válidos), não é de cliente.
const CNPJ = "11222333000181";
const AGORA = new Date("2026-11-05T23:30:00Z");

beforeEach(() => {
  vi.clearAllMocks();
  m.upsert.mockResolvedValue({});
  m.updateMany.mockResolvedValue({ count: 1 });
  m.executeRaw.mockResolvedValue(1);
});

describe("o que dá para registrar", () => {
  it("aceita o CNPJ formatado e recusa documento inválido ou uso vazio", () => {
    expect(usoRegistravel("11.222.333/0001-81", "serpro")).toEqual({ documento: CNPJ, uso: "serpro" });
    expect(usoRegistravel("11222333000100", "serpro")).toBeNull();
    expect(usoRegistravel(null, "serpro")).toBeNull();
    expect(usoRegistravel(CNPJ, " ")).toBeNull();
    expect(usoRegistravel(CNPJ, "x".repeat(41))).toBeNull();
  });

  it("o dia é o de UTC", () => {
    expect(diaDoRegistro(AGORA)).toBe("2026-11-05");
  });
});

describe("registrarUsoDoCertificado", () => {
  it("grava o último uso pela chave do documento e soma na linha do dia", async () => {
    expect(await registrarUsoDoCertificado(TENANT, CNPJ, "robo:vigiar_ie", AGORA)).toBe(true);
    expect(m.upsert).toHaveBeenCalledWith({
      where: { tenantId_documento_uso: { tenantId: TENANT, documento: CNPJ, uso: "robo:vigiar_ie" } },
      create: { tenantId: TENANT, documento: CNPJ, uso: "robo:vigiar_ie", ultimoUsoAt: AGORA },
      update: { ultimoUsoAt: AGORA },
    });
    expect(m.executeRaw).toHaveBeenCalledTimes(1);
    const [partes, ...valores] = m.executeRaw.mock.calls[0]!;
    expect((partes as string[]).join("?")).toContain("ON DUPLICATE KEY UPDATE vezes = vezes + 1");
    expect(valores).toEqual([TENANT, CNPJ, "robo:vigiar_ie", "2026-11-05"]);
  });

  it("documento inválido não toca no banco", async () => {
    expect(await registrarUsoDoCertificado(TENANT, "123", "serpro", AGORA)).toBe(false);
    expect(m.upsert).not.toHaveBeenCalled();
    expect(m.executeRaw).not.toHaveBeenCalled();
  });

  it("dois usos criando ao mesmo tempo: o que perdeu atualiza", async () => {
    m.upsert.mockRejectedValueOnce(Object.assign(new Error("único"), { code: "P2002" }));
    expect(await registrarUsoDoCertificado(TENANT, CNPJ, "serpro", AGORA)).toBe(true);
    expect(m.updateMany).toHaveBeenCalledWith({ where: { tenantId: TENANT, documento: CNPJ, uso: "serpro" }, data: { ultimoUsoAt: AGORA } });
    expect(m.executeRaw).toHaveBeenCalledTimes(1);
  });

  it("falha do banco não sobe: devolve false", async () => {
    const erro = vi.spyOn(console, "error").mockImplementation(() => {});
    m.executeRaw.mockRejectedValueOnce(new Error("tabela não existe"));
    await expect(registrarUsoDoCertificado(TENANT, CNPJ, "serpro", AGORA)).resolves.toBe(false);
    expect(erro).toHaveBeenCalledWith("[certificados] registro de uso", "Error");
    erro.mockRestore();
  });
});
