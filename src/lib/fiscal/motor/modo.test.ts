import { describe, expect, it } from "vitest";
import { escolherModo } from "./modo";

describe("seleção do modo das telas fiscais", () => {
  it("o motor real tem precedência sobre a prévia local", () => {
    expect(escolherModo({ motorConfigurado: true, previaLocal: true })).toBe("motor");
    expect(escolherModo({ motorConfigurado: true, previaLocal: false })).toBe("motor");
  });
  it("sem motor, a prévia do banco local; sem as duas, indisponível", () => {
    expect(escolherModo({ motorConfigurado: false, previaLocal: true })).toBe("local");
    expect(escolherModo({ motorConfigurado: false, previaLocal: false })).toBe("indisponivel");
  });
});
