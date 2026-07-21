import { describe, it, expect } from "vitest";
import { HANDOFF_TEMPLATES, getHandoffTemplate, renderHandoffTemplate, matchSectorsForTemplate } from "./handoffTemplates";

describe("HANDOFF_TEMPLATES", () => {
  it("tem 15 modelos, todos com key e label únicos", () => {
    expect(HANDOFF_TEMPLATES).toHaveLength(15);
    expect(new Set(HANDOFF_TEMPLATES.map((t) => t.key)).size).toBe(15);
    expect(new Set(HANDOFF_TEMPLATES.map((t) => t.label)).size).toBe(15);
  });

  it("todo modelo tem message e description não vazios", () => {
    for (const t of HANDOFF_TEMPLATES) {
      expect(t.message.trim().length).toBeGreaterThan(0);
      expect(t.description.trim().length).toBeGreaterThan(0);
    }
  });
});

describe("renderHandoffTemplate", () => {
  it("substitui [EMPRESA] e [CNPJ] em message e description quando fornecidos", () => {
    const result = renderHandoffTemplate("BAIXA_CNPJ", { name: "Acme Ltda", cnpj: "12.345.678/0001-90" });
    expect(result.message).toContain("Empresa: Acme Ltda");
    expect(result.message).toContain("CNPJ: 12.345.678/0001-90");
    expect(result.message).not.toContain("[EMPRESA]");
    expect(result.description).not.toContain("[CNPJ]");
  });

  it("mantém os placeholders quando empresa/cnpj não são informados", () => {
    const result = renderHandoffTemplate("BAIXA_CNPJ", {});
    expect(result.message).toContain("[EMPRESA]");
    expect(result.message).toContain("[CNPJ]");
  });

  it("mantém demais placeholders intactos (responsável, prazo etc.) na description", () => {
    const result = renderHandoffTemplate("BAIXA_CNPJ", { name: "Acme Ltda" });
    expect(result.description).toContain("[RESPONSÁVEL]");
    expect(result.message).toContain("[SOLICITANTE OU CANAL]");
  });

  it("retorna message/description vazios para uma key desconhecida", () => {
    expect(renderHandoffTemplate("INEXISTENTE", { name: "X" })).toEqual({ message: "", description: "" });
  });

  it("getHandoffTemplate encontra pelo key exato", () => {
    expect(getHandoffTemplate("ALTERACAO_CONTRATUAL")?.label).toBe("Alteração contratual");
    expect(getHandoffTemplate("nao-existe")).toBeUndefined();
  });
});

describe("matchSectorsForTemplate", () => {
  const sectorOptions = [
    { value: "FISCAL", label: "Fiscal" },
    { value: "CONTABIL", label: "Contábil" },
    { value: "DP", label: "Departamento Pessoal" },
    { value: "RECRUT", label: "Recrutamento" },
  ];

  it("casa hints do modelo com setores reais do tenant, ignorando acento/caixa", () => {
    const matched = matchSectorsForTemplate("REGULARIZACAO_BAIXA", sectorOptions);
    expect(matched).toContain("FISCAL");
    expect(matched).toContain("CONTABIL");
    expect(matched).not.toContain("RECRUT");
  });

  it("casa 'DP' com 'Departamento Pessoal' via substring nos dois sentidos", () => {
    const matched = matchSectorsForTemplate("SETUP_MIGRACAO", sectorOptions);
    expect(matched).toContain("DP");
  });

  it("retorna lista vazia para modelo sem sectorHints", () => {
    expect(matchSectorsForTemplate("BAIXA_CNPJ", sectorOptions)).toEqual([]);
  });

  it("retorna lista vazia para key desconhecida", () => {
    expect(matchSectorsForTemplate("INEXISTENTE", sectorOptions)).toEqual([]);
  });
});
