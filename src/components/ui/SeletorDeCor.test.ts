import { describe, expect, it } from "vitest";
import { PALETA_DO_CONNECT, hexCanonico } from "./SeletorDeCor";
import { SECTOR_COLOR_PALETTE } from "@/lib/sector-constants";

describe("hexCanonico", () => {
  it("devolve sempre #RRGGBB em maiúsculas — o formato que o seletor nativo salvava, normalizado", () => {
    expect(hexCanonico("#2e6fb8")).toBe("#2E6FB8");
    expect(hexCanonico("2E6FB8")).toBe("#2E6FB8");
    expect(hexCanonico("#abc")).toBe("#AABBCC");
  });

  it("recusa o que não é cor", () => {
    expect(hexCanonico("")).toBeNull();
    expect(hexCanonico("#12345")).toBeNull();
    expect(hexCanonico("azul")).toBeNull();
  });
});

describe("PALETA_DO_CONNECT", () => {
  it("começa pelas cores dos setores, na mesma ordem (a primeira segue sendo o padrão)", () => {
    expect(PALETA_DO_CONNECT.slice(0, SECTOR_COLOR_PALETTE.length)).toEqual(SECTOR_COLOR_PALETTE);
  });

  it("não repete cor e já está no formato canônico", () => {
    expect(new Set(PALETA_DO_CONNECT).size).toBe(PALETA_DO_CONNECT.length);
    for (const cor of PALETA_DO_CONNECT) expect(hexCanonico(cor)).toBe(cor);
  });
});
