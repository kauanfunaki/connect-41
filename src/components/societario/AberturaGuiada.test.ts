import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

// A abertura guiada abria o processo sozinha ao passar do passo 2 para o 3
// (relato do Kauan, 10/11/2026): o "Continuar" (type="button") e o "Abrir
// processo" (type="submit") ocupam o mesmo lugar, e sem `key` o React troca só o
// `type` do botão que está sendo clicado — o navegador envia o formulário.
// O guarda: todo botão desse rodapé tem `key` própria.
describe("AberturaGuiada — o rodapé de passos não reaproveita o botão do clique", () => {
  it("Continuar, Abrir processo e Abrir sem pedir nada têm cada um a sua key", () => {
    const src = readFileSync(path.join(__dirname, "AberturaGuiada.tsx"), "utf8");
    // Os atributos podem ter "=>" (onClick), então a tag vai até o rótulo sem atravessar outro <Button.
    const botoes = [...src.matchAll(/<Button\b((?:(?!<Button\b)[\s\S])*?)>\s*(Continuar|Abrir processo|Abrir sem pedir nada)/g)];
    expect(botoes.map((b) => b[2]).sort()).toEqual(["Abrir processo", "Abrir sem pedir nada", "Continuar"]);
    for (const b of botoes) expect(b[0], b[2]).toMatch(/\bkey="[^"]+"/);
    const keys = botoes.map((b) => b[0].match(/\bkey="([^"]+)"/)![1]);
    expect(new Set(keys).size).toBe(keys.length);
  });
});
