import { describe, expect, it, vi, beforeEach } from "vitest";
import type { AbaDeLink } from "@/components/ui/AbasDeLink";

// A aba Fornecedores e sacados (21/10/2026) só aparece para quem alcança o
// módulo do BPO — a mesma porta da tela. Os outros veem Cadastros como antes.
const mocks = vi.hoisted(() => ({ pode: false, podeNoModulo: vi.fn() }));
vi.mock("@/lib/auth/context", () => ({ getAuthContext: vi.fn(async () => ({ tenantId: "t1" })) }));
vi.mock("@/lib/auth/modulo", () => ({ podeNoModulo: mocks.podeNoModulo }));

import { CadastrosTabsBar } from "./CadastrosTabsBar";

async function abas(active: Parameters<typeof CadastrosTabsBar>[0]["active"]): Promise<{ abas: AbaDeLink[]; ativa: string }> {
  const div = await CadastrosTabsBar({ active });
  const barra = (div.props as { children: React.ReactElement[] }).children[1];
  return barra.props as { abas: AbaDeLink[]; ativa: string };
}

describe("abas de Cadastros", () => {
  beforeEach(() => {
    mocks.podeNoModulo.mockReset();
    mocks.podeNoModulo.mockImplementation(async () => mocks.pode);
  });

  it("quem não é do BPO não vê Fornecedores e sacados", async () => {
    mocks.pode = false;
    const { abas: lista } = await abas("empresas");
    expect(lista.map((a) => a.href)).not.toContain("/fornecedores-e-sacados");
  });

  it("quem é do BPO (ou administrador) vê a aba, por último", async () => {
    mocks.pode = true;
    const { abas: lista, ativa } = await abas("fornecedores");
    expect(lista.at(-1)).toMatchObject({ chave: "fornecedores", rotulo: "Fornecedores e sacados", href: "/fornecedores-e-sacados" });
    expect(ativa).toBe("fornecedores");
    expect(mocks.podeNoModulo).toHaveBeenCalledWith(expect.anything(), "bpo_cadastros", "ver");
  });
});
