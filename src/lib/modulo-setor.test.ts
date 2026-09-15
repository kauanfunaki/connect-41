import { describe, expect, it } from "vitest";
import { resolverSetorDoModulo, setorParaGravar } from "./modulo-setor";

describe("resolverSetorDoModulo", () => {
  it("usa o setor do catálogo quando o tenant não transferiu", () => {
    expect(resolverSetorDoModulo("bpo", null)).toBe("bpo");
    expect(resolverSetorDoModulo("bpo", undefined)).toBe("bpo");
  });

  it("usa o setor transferido quando há um", () => {
    expect(resolverSetorDoModulo("bpo", "financeiro")).toBe("financeiro");
  });

  it("trata texto em branco como não transferido", () => {
    expect(resolverSetorDoModulo("bpo", "  ")).toBe("bpo");
  });
});

describe("setorParaGravar", () => {
  it("grava null ao voltar para o setor do catálogo", () => {
    expect(setorParaGravar("bpo", "bpo")).toBeNull();
    expect(setorParaGravar("bpo", "")).toBeNull();
  });

  it("grava o código quando é outro setor", () => {
    expect(setorParaGravar("bpo", " financeiro ")).toBe("financeiro");
  });
});
