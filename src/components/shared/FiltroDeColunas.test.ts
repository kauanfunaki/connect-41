import * as React from "react";
import { readFileSync } from "node:fs";
import path from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { FiltroDaColuna, TabelaFiltravel } from "./FiltroDeColunas";

// O funil fora da centralização do rótulo (pedido do Kauan, 13/10/2026). Sem
// navegador, a conferência é em duas partes: o HTML que o cabeçalho gera tem o
// rótulo e o funil em caixas próprias, com as classes que o CSS usa; e o CSS da
// tabela padrão (globals.css) tem as regras que tiram o funil da conta, depois
// da regra que centraliza o conteúdo flex da célula — mesma especificidade, e
// quem vem depois ganha.

beforeAll(() => vi.stubGlobal("React", React));
afterAll(() => vi.unstubAllGlobals());

// Os filhos vão como argumento do createElement (a regra do lint), e o tipo
// do componente pede `children` nas props — daí o tipo sem eles.
const Tabela = TabelaFiltravel as unknown as React.FC<Omit<React.ComponentProps<typeof TabelaFiltravel>, "children">>;

function cabecalho(rotulo: string): string {
  return renderToStaticMarkup(
    React.createElement(
      Tabela,
      { linhas: [{ id: "1", valores: { situacao: "Paga" } }] },
      React.createElement("th", null, React.createElement(FiltroDaColuna, { rotulo, chave: "situacao" }))
    )
  );
}

describe("o cabeçalho com funil", () => {
  const html = cabecalho("Situação");

  it("o rótulo e o funil em caixas próprias, dentro do cabeçalho", () => {
    expect(html).toMatch(
      /<th><span class="c41-cabecalho-com-funil[^"]*"><span class="c41-cabecalho-rotulo">Situação<\/span><span class="c41-cabecalho-funil[^"]*">/
    );
  });

  it("o funil é o botão de filtrar a coluna, fechado e sem filtro", () => {
    const funil = /<span class="c41-cabecalho-funil[^"]*">([\s\S]*?)<\/span><\/span><\/th>/.exec(html)?.[1] ?? "";
    expect(funil).toContain('aria-label="Filtrar a coluna situação"');
    expect(funil).toContain('aria-expanded="false"');
    expect(funil).not.toContain("bg-brand-solid");
  });

  it("fora da tabela que filtra, só o rótulo — sem funil", () => {
    const solto = renderToStaticMarkup(React.createElement(FiltroDaColuna, { rotulo: "Situação", chave: "situacao" }));
    expect(solto).toBe("Situação");
  });
});

describe("o CSS da tabela padrão", () => {
  const css = readFileSync(path.join(process.cwd(), "src", "app", "globals.css"), "utf8");
  const BASE = ".c41-tabela > table > thead > tr > th > .c41-cabecalho-com-funil";
  const regra = (seletor: string) => {
    const i = css.indexOf(`${seletor} {`);
    return i < 0 ? null : css.slice(i, css.indexOf("}", i) + 1);
  };

  it("o cabeçalho ocupa a célula, sem centralizar o par", () => {
    const r = regra(BASE);
    expect(r).toContain("display: flex");
    expect(r).toContain("justify-content: flex-start");
  });

  it("um par invisível do funil à esquerda, que encolhe primeiro", () => {
    expect(regra(`${BASE}::before`)).toMatch(/content: "";[\s\S]*flex: 0 1 1\.5rem/);
  });

  it("o rótulo no centro e o funil na borda direita, sem encolher", () => {
    expect(regra(`${BASE} > .c41-cabecalho-rotulo`)).toContain("margin-inline: auto");
    const funil = regra(`${BASE} > .c41-cabecalho-funil`);
    expect(funil).toContain("flex-shrink: 0");
    expect(funil).toContain("margin-left: 0.25rem");
  });

  it("na coluna à esquerda, o rótulo segue à esquerda", () => {
    expect(regra(".c41-tabela > table > thead > tr > th.c41-a-esquerda > .c41-cabecalho-com-funil::before")).toContain("content: none");
  });

  it("vem depois da regra que centraliza o conteúdo flex da célula, fora de @layer", () => {
    const centraliza = css.indexOf(".c41-tabela > table > :is(thead, tbody, tfoot) > tr > :is(th, td) > :is(.flex, .inline-flex) {");
    expect(centraliza).toBeGreaterThan(-1);
    expect(css.indexOf(`${BASE} {`)).toBeGreaterThan(centraliza);
    // No nível de cima do arquivo (nenhuma chave aberta), e não dentro de um
    // `@layer`: aí as utilidades do Tailwind (`inline-flex`, `gap-1`) ganhariam.
    expect(profundidadeAntes(css, `${BASE} {`)).toBe(0);
  });
});

// A divisória entre as colunas do cabeçalho (pedido do Kauan, 14/10/2026): com
// o funil na borda direita, ele parecia ser do rótulo da coluna seguinte. Sem
// navegador, confere-se o CSS: o token nos dois temas e a regra do fio.
describe("a divisória entre as colunas do cabeçalho", () => {
  // Sem o \r do Windows, para casar a lista de seletores, que ocupa duas linhas.
  const css = readFileSync(path.join(process.cwd(), "src", "app", "globals.css"), "utf8").replace(/\r\n/g, "\n");
  const TOKEN = "--c41-table-header-divider";
  const SELETOR = [
    ".c41-tabela > table > thead > tr > th:not(:empty) + th,",
    ".c41-cabecalho-dividido > tr > th:not(:empty) + th {",
  ].join("\n");
  const inicio = css.indexOf(SELETOR);
  const corpo = inicio < 0 ? "" : css.slice(inicio + SELETOR.length, css.indexOf("}", inicio));

  const valorNoBloco = (abertura: string) => {
    const i = css.indexOf(`${abertura} {`);
    if (i < 0) return null;
    const linha = css
      .slice(i, css.indexOf("}", i))
      .split("\n")
      .map((l) => l.trim())
      .find((l) => l.startsWith(`${TOKEN}:`));
    return linha ? linha.slice(TOKEN.length + 1).replace(/;$/, "").trim() : null;
  };

  it("o token tem valor no claro, no escuro escolhido e no escuro do sistema", () => {
    const claro = valorNoBloco(":root");
    const escuro = valorNoBloco(':root[data-theme="dark"]');
    expect(claro).toBeTruthy();
    expect(escuro).toBeTruthy();
    expect(escuro).not.toBe(claro);
    expect(valorNoBloco(':root:not([data-theme="light"]):not([data-theme="dark"])')).toBe(escuro);
  });

  it("vale na tabela padrão e na que pede pela classe, só depois de um cabeçalho com conteúdo", () => {
    expect(inicio).toBeGreaterThan(-1);
  });

  it("1px, metade da altura, na borda esquerda e centralizado, na cor do token", () => {
    expect(corpo).toContain(`background-image: linear-gradient(var(${TOKEN}), var(${TOKEN}))`);
    expect(corpo).toContain("background-repeat: no-repeat");
    expect(corpo).toContain("background-size: 1px 50%");
    expect(corpo).toContain("background-position: left center");
  });

  it("não mexe na posição da célula: o cabeçalho preso na rolagem segue preso", () => {
    expect(corpo).not.toMatch(/(^|[^-])position\s*:/);
  });

  it("fora de @layer, como o resto da tabela padrão", () => {
    expect(profundidadeAntes(css, SELETOR)).toBe(0);
  });

  it("Empresas e a lista de tarefas, que ficam fora da `.c41-tabela`, pedem o fio pela classe", () => {
    for (const arquivo of [
      path.join("src", "components", "empresas", "EmpresasTable.tsx"),
      path.join("src", "components", "kanban", "TaskListView.tsx"),
    ]) {
      const fonte = readFileSync(path.join(process.cwd(), arquivo), "utf8");
      expect(fonte, arquivo).toMatch(/<thead className="[^"]*\bc41-cabecalho-dividido\b/);
    }
  });
});

/** Quantas chaves estão abertas no CSS antes do trecho, sem contar comentários. 0 = nível de cima do arquivo. */
function profundidadeAntes(css: string, trecho: string): number {
  const antes = css.slice(0, css.indexOf(trecho)).replace(/\/\*[\s\S]*?\*\//g, "");
  return (antes.match(/\{/g) ?? []).length - (antes.match(/\}/g) ?? []).length;
}
