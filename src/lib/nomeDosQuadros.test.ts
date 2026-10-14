import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { TELAS_DO_GERAL } from "@/lib/menuGeral";
import { CAMINHO_DOS_QUADROS, TELAS_GERAIS } from "@/lib/ia/ferramentas-ajuda";
import { nomeDaTela } from "@/lib/ia/chat/telas";
import { artigoDaChave, artigoDoCaminho } from "@/lib/ajuda/artigos";

// "Espaços" virou "Quadros" e a visão da lista virou "Listas"/"Kanban"
// (Kauan, 14/10/2026). O nome mora em vários lugares — o menu, a central de
// Ajuda, o artigo, o que a Ceci lê — e este teste garante que todos dizem o
// mesmo. A chave `espacos` não muda: é ela que fica gravada no banco.

const RAIZ = path.resolve(__dirname, "../..");

/** O código sem comentários: os de bloco (também os de JSX) e os de linha, menos o "//" de "https://". */
function semComentarios(arquivo: string): string {
  return readFileSync(path.join(RAIZ, arquivo), "utf-8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/.*$/gm, "$1");
}

const quadros = TELAS_DO_GERAL.find((t) => t.chave === "espacos");

describe("a tela Quadros (antes Espaços)", () => {
  it("no menu Geral, com a chave de sempre", () => {
    expect(quadros?.rotulo).toBe("Quadros");
    expect(quadros?.descricao).toMatch(/espaços/);
  });

  it("a central de Ajuda e a Ceci usam o nome do menu", () => {
    const daAjuda = TELAS_GERAIS.find((t) => t.caminho === CAMINHO_DOS_QUADROS);
    expect(daAjuda?.tela).toBe(quadros?.rotulo);
    // Quem procurar "espaços" na central ainda acha a tela pela descrição.
    expect(daAjuda?.descricao).toMatch(/espaços/);
    expect(nomeDaTela("/setor/bpo")).toBe(quadros?.rotulo);
    expect(nomeDaTela("/setor/bpo/espacos/abc")).toBe(quadros?.rotulo);
    expect(nomeDaTela("/kanban/abc")).toBe(quadros?.rotulo);
  });

  it("o artigo tem o nome novo e o endereço de antes", () => {
    const artigo = artigoDaChave("geral:espacos");
    expect(artigo?.titulo).toBe(quadros?.rotulo);
    expect(artigoDoCaminho("/setor/bpo")?.chave).toBe("geral:espacos");
  });

  it("o item do menu e o título da tela", () => {
    const menu = semComentarios("src/components/shell/AppShell.tsx");
    expect(menu).toContain('label="Quadros"');
    expect(menu).not.toContain("Espaços");
    const tela = semComentarios("src/app/(app)/setor/[code]/page.tsx");
    expect(tela).toContain('title="Quadros"');
    expect(tela).not.toContain("Espaços");
  });

  it("nenhum texto que a pessoa lê chama a tela de Espaços", () => {
    for (const arquivo of [
      "src/lib/menuGeral.ts",
      "src/lib/ia/ferramentas-ajuda.ts",
      "src/lib/ia/chat/telas.ts",
      "src/lib/ajuda/artigos/geral.ts",
      "src/app/(app)/ajuda/page.tsx",
    ]) {
      expect(semComentarios(arquivo), arquivo).not.toContain("Espaços");
    }
  });
});

describe("a visão da lista: Listas e Kanban", () => {
  it("o seletor da lista", () => {
    const codigo = semComentarios("src/components/kanban/BoardView.tsx");
    expect(codigo).toContain('label: "Listas"');
    expect(codigo).toContain('label: "Kanban"');
    expect(codigo).not.toMatch(/label: "(Lista|Quadro)"/);
  });

  it("a ajuda fala dos nomes novos", () => {
    const artigo = JSON.stringify(artigoDaChave("geral:espacos"));
    expect(artigo).toContain("“Listas” e “Kanban”");
    expect(artigo).not.toMatch(/“(Lista|Quadro)”/);
  });
});
