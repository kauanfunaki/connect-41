import { describe, expect, it } from "vitest";
import { MODULE_ROUTES, MODULOS_DO_MENU_GERAL, MODULOS_NOS_CADASTROS, getModuleDef } from "./module-catalog";
import { CAMINHO_DOS_FORNECEDORES } from "./cadastrosNav";
import { artigoDoCaminho } from "./ajuda/artigos";

// Fornecedores e sacados virou aba de Cadastros em 21/10/2026 (pedido do Kauan
// de 15/10): sai do menu do BPO, mas continua sendo do BPO — é o setor que
// decide quem abre a tela e quem liga o módulo.
describe("Fornecedores e sacados nos Cadastros", () => {
  it("continua módulo do BPO, no endereço novo", () => {
    expect(getModuleDef("bpo_cadastros")?.sectorCode).toBe("bpo");
    expect(MODULE_ROUTES.bpo_cadastros).toBe(CAMINHO_DOS_FORNECEDORES);
  });

  // `MODULOS_DO_MENU_GERAL` é o que tira a tela da lista do setor na lateral.
  it("sai do menu do BPO", () => {
    expect(MODULOS_NOS_CADASTROS.has("bpo_cadastros")).toBe(true);
    for (const code of MODULOS_NOS_CADASTROS) expect(MODULOS_DO_MENU_GERAL.has(code), code).toBe(true);
  });

  it("a ajuda acha o artigo pelo endereço novo", () => {
    expect(artigoDoCaminho(CAMINHO_DOS_FORNECEDORES)?.chave).toBe("bpo_cadastros");
  });
});
