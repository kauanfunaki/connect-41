import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { categoriasClassificaveis, categoriasDaEdicao, gruposDeCategorias, type CategoriaNaArvore } from "@/lib/chamados/catalogo";
import { CampoDeCategoria } from "./CampoDeCategoria";
import { juntarTags, LIMITE_DE_TAGS } from "./CampoDeTags";

beforeAll(() => vi.stubGlobal("React", React));
afterAll(() => vi.unstubAllGlobals());

const cat = (id: string, name: string, parentId: string | null = null, active = true): CategoriaNaArvore => ({ id, name, parentId, active });
const arvore = [
  cat("classificar", "A classificar"),
  cat("dev", "Desenvolvimento"), cat("bug", "Bug | Correção", "dev"), cat("rel", "Ajuste | Criação de Relatório", "dev"), cat("velha", "Velha", "dev", false),
  cat("sup", "Suporte"), cat("treino", "Treinamento", "sup"), cat("sis", "Sistemas", "sup"), cat("dom", "Domínio", "sis"),
];

describe("gruposDeCategorias (melhoria-809)", () => {
  it("na edição: um grupo por raiz, as folhas ativas, a raiz sem filhas ela mesma, e a atual mesmo inativa", () => {
    expect(gruposDeCategorias(arvore, categoriasDaEdicao(arvore, "velha"))).toEqual([
      { id: "classificar", nome: "A classificar", opcoes: [{ id: "classificar", nome: "A classificar" }] },
      { id: "dev", nome: "Desenvolvimento", opcoes: [{ id: "bug", nome: "Bug | Correção" }, { id: "rel", nome: "Ajuste | Criação de Relatório" }, { id: "velha", nome: "Velha" }] },
      { id: "sup", nome: "Suporte", opcoes: [{ id: "treino", nome: "Treinamento" }, { id: "dom", nome: "Sistemas › Domínio" }] },
    ]);
  });
  it("na abertura: só as classificáveis, sem o A classificar nem as inativas", () => {
    const grupos = gruposDeCategorias(arvore, categoriasClassificaveis(arvore));
    expect(grupos.map(g => g.nome)).toEqual(["Desenvolvimento", "Suporte"]);
    expect(grupos[0]!.opcoes.map(o => o.id)).toEqual(["bug", "rel"]);
  });
});

describe("CampoDeCategoria", () => {
  const html = (props: Partial<React.ComponentProps<typeof CampoDeCategoria>>) => renderToStaticMarkup(React.createElement(CampoDeCategoria, {
    categorias: arvore, escolhiveis: categoriasClassificaveis(arvore), value: "", onChange: () => {}, ...props,
  }));
  it("é o Select do Connect: combobox com os grupos em optgroup", () => {
    const h = html({ value: "bug" });
    expect(h).toContain('role="combobox"');
    expect(h).toMatch(/<optgroup label="Desenvolvimento"><option value="bug" selected="">Bug \| Correção<\/option>/);
    expect(h).toMatch(/<span class="text-fg-muted">Desenvolvimento › <\/span>Bug \| Correção/);
  });
  it("vazio, pede a escolha; no Novo chamado, a opção de deixar para a equipe", () => {
    expect(html({})).toContain("Escolha a categoria");
    const novo = html({ vazia: "Deixar para a equipe classificar" });
    expect(novo).toMatch(/<option value=""[^>]*>Deixar para a equipe classificar<\/option>/);
    expect(novo).not.toContain("Escolha a categoria");
  });
});

describe("juntarTags", () => {
  it("separa por vírgula, tira espaços, ignora vazia e repetida", () => {
    expect(juntarTags(["Fiscal"], " relatórios, fiscal ,, novo ")).toEqual(["Fiscal", "relatórios", "novo"]);
  });
  it("corta em 60 caracteres e para em 20 tags", () => {
    expect(juntarTags([], "a".repeat(80))).toEqual(["a".repeat(60)]);
    const cheias = Array.from({ length: LIMITE_DE_TAGS }, (_, i) => `t${i}`);
    expect(juntarTags(cheias, "mais")).toEqual(cheias);
  });
});
