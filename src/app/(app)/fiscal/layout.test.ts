import { beforeEach, describe, expect, it, vi } from "vitest";
import { isValidElement, type ReactElement } from "react";

const m = vi.hoisted(() => ({ modo: vi.fn(), ler: vi.fn() }));
vi.mock("@/lib/auth/context", () => ({ getAuthContext: async () => ({ tenantId: "t1", userId: "u1" }), canViewSector: () => true }));
vi.mock("@/lib/modules", () => ({ getTenantModuleStates: async () => [{ code: "fiscal_painel", enabled: true, sectorCodes: ["fiscal"] }] }));
vi.mock("@/lib/fiscal/motor/servidor", () => ({ modoDoFiscal: m.modo }));
vi.mock("@/lib/fiscal/local/servidor", () => ({ lerEstadoFiscalLocal: m.ler }));
vi.mock("@/components/fiscal/previa/ContextoFiscal", () => ({ ContextoFiscalProvider: function ContextoFiscalProvider() { return null; } }));
vi.mock("@/components/shared/PageContainer", () => ({ PageContainer: function PageContainer() { return null; } }));
vi.mock("@/components/fiscal/motor/CascoDoMotor", () => ({ MotorIndisponivel: function MotorIndisponivel() { return null; } }));
const { default: FiscalLayout } = await import("./layout");

const tipo = (el: unknown) => (isValidElement(el) ? (el.type as { name: string }).name : null);
const filhos = (el: unknown) => ((el as ReactElement<{ children: unknown }>).props.children);

beforeEach(() => { vi.clearAllMocks(); m.ler.mockResolvedValue({ cenario: {}, favoritas: [], revisao: 1 }); });

describe("layout fiscal: seleção do modo", () => {
  it("motor configurado: casco simples, sem cenário local e sem lê-lo", async () => {
    m.modo.mockResolvedValue("motor");
    const el = await FiscalLayout({ children: "conteudo" });
    expect(tipo(el)).toBe("PageContainer");
    expect(filhos(el)).toContain("conteudo");
    expect(m.ler).not.toHaveBeenCalled();
  });
  it("não exibe cenário local quando a integração está ausente", async () => {
    m.modo.mockResolvedValue("local");
    const el = await FiscalLayout({ children: "x" });
    expect(tipo(el)).toBe("PageContainer");
    expect(tipo(filhos(el))).toBe("MotorIndisponivel");
    expect(m.ler).not.toHaveBeenCalled();
  });
  it("sem nenhuma das duas: indisponível", async () => {
    m.modo.mockResolvedValue("indisponivel");
    const el = await FiscalLayout({ children: "x" });
    expect(tipo(el)).toBe("PageContainer");
    expect(tipo(filhos(el))).toBe("MotorIndisponivel");
  });
});
