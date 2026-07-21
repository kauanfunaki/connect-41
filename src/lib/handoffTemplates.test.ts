import { describe, it, expect } from "vitest";
import { HANDOFF_TEMPLATES, getHandoffTemplate, renderHandoffTemplate } from "./handoffTemplates";

describe("HANDOFF_TEMPLATES", () => {
  it("tem 15 modelos, todos com key e label únicos", () => {
    expect(HANDOFF_TEMPLATES).toHaveLength(15);
    expect(new Set(HANDOFF_TEMPLATES.map((t) => t.key)).size).toBe(15);
    expect(new Set(HANDOFF_TEMPLATES.map((t) => t.label)).size).toBe(15);
  });
});

describe("renderHandoffTemplate", () => {
  it("substitui [EMPRESA] e [CNPJ] quando fornecidos", () => {
    const result = renderHandoffTemplate("BAIXA_CNPJ", { name: "Acme Ltda", cnpj: "12.345.678/0001-90" });
    expect(result).toContain("Empresa: Acme Ltda");
    expect(result).toContain("CNPJ: 12.345.678/0001-90");
    expect(result).not.toContain("[EMPRESA]");
    expect(result).not.toContain("[CNPJ]");
  });

  it("mantém os placeholders quando empresa/cnpj não são informados", () => {
    const result = renderHandoffTemplate("BAIXA_CNPJ", {});
    expect(result).toContain("[EMPRESA]");
    expect(result).toContain("[CNPJ]");
  });

  it("mantém demais placeholders intactos (responsável, prazo etc.)", () => {
    const result = renderHandoffTemplate("BAIXA_CNPJ", { name: "Acme Ltda" });
    expect(result).toContain("[RESPONSÁVEL]");
    expect(result).toContain("[SOLICITANTE OU CANAL]");
  });

  it("retorna string vazia para uma key desconhecida", () => {
    expect(renderHandoffTemplate("INEXISTENTE", { name: "X" })).toBe("");
  });

  it("getHandoffTemplate encontra pelo key exato", () => {
    expect(getHandoffTemplate("ALTERACAO_CONTRATUAL")?.label).toBe("Alteração contratual");
    expect(getHandoffTemplate("nao-existe")).toBeUndefined();
  });
});
