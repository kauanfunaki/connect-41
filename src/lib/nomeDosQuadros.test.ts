import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { TELAS_DO_GERAL } from "@/lib/menuGeral";
import { CAMINHO_DOS_QUADROS, TELAS_GERAIS } from "@/lib/ia/ferramentas-ajuda";
import { nomeDaTela } from "@/lib/ia/chat/telas";
import { artigoDaChave, artigoDoCaminho } from "@/lib/ajuda/artigos";

// "Espaços" virou "Quadros" e a visão da lista virou "Listas"/"Kanban"
// (Kauan, 14/10/2026). Em 20/10 a lista virou "Tarefa", os itens viraram
// "Atividades", e as duas visões da tarefa ficaram "Lista" e "Kanban". O nome mora em vários lugares — o menu, a central de
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

describe("as visões da tarefa: Lista e Kanban", () => {
  it("o seletor da tarefa", () => {
    const codigo = semComentarios("src/components/kanban/BoardView.tsx");
    expect(codigo).toContain('label: "Lista"');
    expect(codigo).toContain('label: "Kanban"');
    expect(codigo).not.toMatch(/label: "(Listas|Quadro)"/);
  });

  it("a ajuda fala dos nomes novos", () => {
    const artigo = JSON.stringify(artigoDaChave("geral:espacos"));
    expect(artigo).toContain("“Lista” e “Kanban”");
    expect(artigo).not.toMatch(/“(Listas|Quadro)”/);
  });
});

describe("Quadro › Pasta › Tarefa › Atividade (20/10/2026)", () => {
  it("a lista se chama tarefa, e o item, atividade, nas telas que criam cada um", () => {
    expect(semComentarios("src/components/kanban/NewListButton.tsx")).toContain('"Nova tarefa"');
    expect(semComentarios("src/components/kanban/NewListButton.tsx")).not.toContain('"Nova lista"');
    expect(semComentarios("src/components/kanban/NovoItemModal.tsx")).toContain('"Nova atividade"');
    expect(semComentarios("src/components/kanban/ItemForm.tsx")).toContain('"Criar atividade"');
    expect(semComentarios("src/components/kanban/TaskListView.tsx")).not.toMatch(/"Adicionar tarefa"/);
  });

  it("o espaço e a pasta listam tarefas, com a coluna Tarefa", () => {
    expect(semComentarios("src/app/(app)/setor/[code]/espacos/[spaceId]/page.tsx")).toContain(">Tarefas<");
    expect(semComentarios("src/app/(app)/setor/[code]/pastas/[folderId]/page.tsx")).toContain(">Tarefas<");
    expect(semComentarios("src/components/kanban/ListsTable.tsx")).toContain('rotulo="Tarefa"');
  });
});
