import { describe, expect, it } from "vitest";
import { COOKIE_DO_MENU_LATERAL, cookieDoMenuLateral, menuRecolhidoDoCookie } from "./menuLateral";

describe("menu lateral recolhido (08/10/2026)", () => {
  it("só o valor gravado pelo botão recolhe; sem cookie, o menu aparece", () => {
    expect(menuRecolhidoDoCookie("recolhido")).toBe(true);
    expect(menuRecolhidoDoCookie(undefined)).toBe(false);
    expect(menuRecolhidoDoCookie("")).toBe(false);
    expect(menuRecolhidoDoCookie("aberto")).toBe(false);
  });

  it("recolher grava por um ano; mostrar de novo apaga o cookie", () => {
    expect(cookieDoMenuLateral(true)).toBe(`${COOKIE_DO_MENU_LATERAL}=recolhido; path=/; max-age=31536000; samesite=lax`);
    expect(cookieDoMenuLateral(false)).toContain("max-age=0");
  });
});
