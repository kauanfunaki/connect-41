import * as React from "react";
import { readdirSync, readFileSync } from "node:fs";
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

  it("na coluna à esquerda, o rótulo segue à esquerda; na à direita, vai para a direita", () => {
    expect(
      regra(".c41-tabela > table > thead > tr > th:is(.c41-a-esquerda, .c41-a-direita) > .c41-cabecalho-com-funil::before")
    ).toContain("content: none");
    expect(regra(".c41-tabela > table > thead > tr > th.c41-a-esquerda > .c41-cabecalho-com-funil > .c41-cabecalho-rotulo")).toContain(
      "margin-left: 0"
    );
    expect(regra(".c41-tabela > table > thead > tr > th.c41-a-direita > .c41-cabecalho-com-funil > .c41-cabecalho-rotulo")).toContain(
      "margin-right: 0"
    );
  });

  // Empresas e a lista de tarefas ficam fora da `.c41-tabela` e o funil ia
  // colado ao rótulo, centralizado com ele (Kauan, 14/10/2026). A classe do
  // <thead> que já dava o fio entre as colunas dá também o funil no canto: cada
  // regra de cima vale, na mesma lista de seletores, para a tabela que a usa.
  it("a tabela fora dela pede o mesmo cabeçalho pela classe `c41-cabecalho-dividido`", () => {
    const plano = css.replace(/\r\n/g, "\n");
    for (const [th, resto] of [
      ["th", " > .c41-cabecalho-com-funil"],
      ["th", " > .c41-cabecalho-com-funil::before"],
      ["th", " > .c41-cabecalho-com-funil > .c41-cabecalho-rotulo"],
      ["th", " > .c41-cabecalho-com-funil > .c41-cabecalho-funil"],
      ["th:is(.c41-a-esquerda, .c41-a-direita)", " > .c41-cabecalho-com-funil::before"],
      ["th.c41-a-esquerda", " > .c41-cabecalho-com-funil > .c41-cabecalho-rotulo"],
      ["th.c41-a-direita", " > .c41-cabecalho-com-funil > .c41-cabecalho-rotulo"],
    ]) {
      expect(plano).toContain(`.c41-cabecalho-dividido > tr > ${th}${resto},\n.c41-tabela > table > thead > tr > ${th}${resto} {`);
    }
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

// A regra vale para toda tabela do app (Kauan, 14/10/2026): o funil da coluna
// fica na borda direita da célula, fora da centralização do rótulo, com o fio
// entre as colunas. Sem navegador, a conferência é na fonte: cada funil
// (`FiltroDaColuna`, `FiltroDaColunaNaUrl`) vai direto num <th> — o cabeçalho
// padrão (`CabecalhoComFunil`) vem com ele —, numa tabela em que o CSS do
// cabeçalho padrão vale; e nenhum <th> desenha um funil por conta própria.
// Tabela nova que fugir disso aparece aqui, com o arquivo e a linha.
describe("toda tabela do app com funil na coluna", () => {
  const SRC = path.join(process.cwd(), "src");
  const fontes = listarTsx(SRC)
    .filter((f) => path.basename(f) !== "FiltroDeColunas.tsx")
    .map((arquivo) => ({ arquivo: path.relative(process.cwd(), arquivo), fonte: semComentarios(readFileSync(arquivo, "utf8")) }));

  const funis = fontes.flatMap(({ arquivo, fonte }) =>
    [...fonte.matchAll(/<(FiltroDaColuna|FiltroDaColunaNaUrl)\b/g)].map((m) => ({
      arquivo,
      fonte,
      inicio: m.index ?? 0,
      onde: `${arquivo}:${fonte.slice(0, m.index).split("\n").length}`,
    }))
  );

  it("a varredura acha os funis do app, Empresas e a lista de tarefas inclusive", () => {
    expect(funis.length).toBeGreaterThan(100);
    const arquivos = new Set(funis.map((f) => f.arquivo));
    expect(arquivos).toContain(path.join("src", "components", "empresas", "EmpresasTable.tsx"));
    expect(arquivos).toContain(path.join("src", "components", "kanban", "TaskListView.tsx"));
    expect(arquivos).toContain(path.join("src", "app", "(portal)", "portal", "(area)", "cobranca", "page.tsx"));
  });

  it("cada funil vai direto num <th>, sem nada em volta", () => {
    const fora = funis.filter((f) => !thDoFunil(f.fonte, f.inicio)).map((f) => f.onde);
    expect(fora).toEqual([]);
  });

  it("cada tabela com funil tem o cabeçalho padrão: `.c41-tabela` ou `c41-cabecalho-dividido` no <thead>", () => {
    const sem = funis.filter((f) => cabecalhoDaTabela(f.fonte, f.inicio) === null).map((f) => f.onde);
    expect(sem).toEqual([]);
  });

  it("fora da `.c41-tabela`, o rótulo segue o lado das células: `c41-a-esquerda` ou `c41-a-direita` no <th>", () => {
    const errados: string[] = [];
    for (const f of funis) {
      if (cabecalhoDaTabela(f.fonte, f.inicio) !== "pela-classe") continue;
      const th = thDoFunil(f.fonte, f.inicio);
      if (!th) continue;
      const antes = f.fonte.slice(0, th.abre);
      const tr = /<tr\b[^>]*>/g;
      const linha = [...antes.matchAll(tr)].at(-1)?.[0] ?? "";
      const classe = (tag: string, nome: string) => new RegExp(`\\b${nome}\\b`).test(tag);
      const lado = classe(th.tag, "text-right")
        ? "c41-a-direita"
        : classe(th.tag, "text-left") || (classe(linha, "text-left") && !classe(th.tag, "text-center"))
          ? "c41-a-esquerda"
          : null;
      if (lado && !classe(th.tag, lado)) errados.push(`${f.onde} (falta ${lado})`);
    }
    expect(errados).toEqual([]);
  });

  it("nenhum <th> desenha o funil à mão", () => {
    const amao: string[] = [];
    for (const { arquivo, fonte } of fontes) {
      for (const m of fonte.matchAll(/<th[\s>][\s\S]*?<\/th>/g)) {
        if (/<(ListFilter|Filter|FilterIcon|Funnel|FunnelIcon)\b/.test(m[0])) {
          amao.push(`${arquivo}:${fonte.slice(0, m.index).split("\n").length}`);
        }
      }
    }
    expect(amao).toEqual([]);
  });
});

function listarTsx(pasta: string): string[] {
  return readdirSync(pasta, { withFileTypes: true }).flatMap((e) => {
    const p = path.join(pasta, e.name);
    if (e.isDirectory()) return e.name === "generated" ? [] : listarTsx(p);
    return e.name.endsWith(".tsx") ? [p] : [];
  });
}

/**
 * A fonte sem os comentários `{/* … *\/}` e `/* … *\/`, trocados por espaço —
 * as quebras de linha ficam, e a linha que o teste aponta segue certa. Um
 * comentário que fale em "<thead>" ou "<th>" não confunde a varredura.
 */
function semComentarios(fonte: string): string {
  const branco = (c: string) => c.replace(/[^\r\n]/g, " ");
  return fonte.replace(/\{\/\*[\s\S]*?\*\/\}/g, branco).replace(/\/\*[\s\S]*?\*\//g, branco);
}

/** Onde termina a tag que abre em `i`: o primeiro `>` fora de chaves (uma seta `=>` numa prop não conta). */
function fimDaTag(fonte: string, i: number): number {
  let chaves = 0;
  for (let j = i; j < fonte.length; j++) {
    const c = fonte[j];
    if (c === "{") chaves++;
    else if (c === "}") chaves--;
    else if (c === ">" && chaves === 0) return j;
  }
  return -1;
}

function ultimo(fonte: string, padrao: RegExp): number {
  return [...fonte.matchAll(padrao)].at(-1)?.index ?? -1;
}

/**
 * O <th> de que o funil é filho direto. Entre a tag e o funil só cabe espaço,
 * comentário e o começo de uma condição (`{temFiltro ? (`) — um elemento em
 * volta tiraria o funil do seletor `th > .c41-cabecalho-com-funil` do CSS.
 */
function thDoFunil(fonte: string, inicio: number): { abre: number; tag: string } | null {
  const antes = fonte.slice(0, inicio);
  const abre = ultimo(antes, /<th[\s>]/g);
  if (abre < 0 || abre < antes.lastIndexOf("</th>")) return null;
  const fim = fimDaTag(fonte, abre);
  if (fim < 0 || fim > inicio) return null;
  const entre = fonte.slice(fim + 1, inicio);
  if (!/^\s*(\{[^<>{}]*\?\s*\(?)?\s*$/.test(entre)) return null;
  return { abre, tag: fonte.slice(abre, fim + 1) };
}

/**
 * Como a tabela do funil ganha o cabeçalho padrão: filha direta da
 * `.c41-tabela` (o div escrito à mão ou o `TabelaNoDesktop padrao`), ou pela
 * classe `c41-cabecalho-dividido` no <thead>. `null` quando por nenhum.
 */
function cabecalhoDaTabela(fonte: string, inicio: number): "c41-tabela" | "pela-classe" | null {
  const antes = fonte.slice(0, inicio);
  const tabela = ultimo(antes, /<table[\s>]/g);
  if (tabela < 0) return null;
  const thead = /<thead\b[^>]*>/.exec(fonte.slice(tabela, inicio))?.[0] ?? "";
  if (/\bc41-cabecalho-dividido\b/.test(thead)) return "pela-classe";
  const pai = fonte.slice(0, tabela).trimEnd();
  const tag = /<([A-Za-z][\w.]*)\b[^<]*$/.exec(pai);
  if (!tag || !pai.endsWith(">") || pai.endsWith("/>")) return null;
  if (/\bc41-tabela\b/.test(tag[0])) return "c41-tabela";
  if (tag[1] === "TabelaNoDesktop" && /\spadrao(\s|>|=\{true\})/.test(tag[0])) return "c41-tabela";
  return null;
}

/** Quantas chaves estão abertas no CSS antes do trecho, sem contar comentários. 0 = nível de cima do arquivo. */
function profundidadeAntes(css: string, trecho: string): number {
  const antes = css.slice(0, css.indexOf(trecho)).replace(/\/\*[\s\S]*?\*\//g, "");
  return (antes.match(/\{/g) ?? []).length - (antes.match(/\}/g) ?? []).length;
}
