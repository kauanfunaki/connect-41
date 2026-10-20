import { describe, expect, it } from "vitest";
import { SECTOR_COLOR_PALETTE } from "@/lib/sector-constants";
import { corDaCategoria } from "./cores";

describe("corDaCategoria", () => {
  it("mantém a mesma cor para a mesma categoria", () => {
    expect(corDaCategoria("categoria-123")).toBe(corDaCategoria("categoria-123"));
  });

  it("escolhe uma cor da paleta padrão do produto", () => {
    expect(SECTOR_COLOR_PALETTE).toContain(corDaCategoria("categoria-123"));
  });
});
