import { describe, expect, it } from "vitest";
import { escolherModo } from "./modo";

describe("seleção do modo das telas fiscais", () => {
  it("a integração configurada é usada mesmo no ambiente local", () => {
    expect(escolherModo({ motorConfigurado: true, previaLocal: true })).toBe("motor");
    expect(escolherModo({ motorConfigurado: true, previaLocal: false })).toBe("motor");
  });
  it("sem integração, permanece indisponível mesmo quando há cenário local", () => {
    expect(escolherModo({ motorConfigurado: false, previaLocal: true })).toBe("indisponivel");
    expect(escolherModo({ motorConfigurado: false, previaLocal: false })).toBe("indisponivel");
  });
});
