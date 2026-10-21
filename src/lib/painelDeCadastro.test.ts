import { describe, expect, it } from "vitest";
import { abreNoPainel } from "./painelDeCadastro";

describe("abreNoPainel", () => {
  it("o endereço do painel, de criar ou de editar", () => {
    expect(abreNoPainel("/admin/tags?editar=abc")).toBe(true);
    expect(abreNoPainel("/admin/tags?novo=1")).toBe(true);
    expect(abreNoPainel("/admin/plano-de-contas?filtro=x&editar=abc")).toBe(true);
  });

  it("página de edição de verdade continua rolando para o topo", () => {
    expect(abreNoPainel("/admin/campos/abc/editar")).toBe(false);
    expect(abreNoPainel("/admin/tags")).toBe(false);
    expect(abreNoPainel("/admin/tags?editarDepois=1")).toBe(false);
  });
});
