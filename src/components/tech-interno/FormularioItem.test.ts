import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({ useRouter: () => ({ replace: vi.fn(), refresh: vi.fn(), push: vi.fn() }) }));
vi.mock("@/components/ui/Toast", () => ({ useToast: () => ({ show: vi.fn() }) }));
vi.mock("@/app/(app)/controle-interno/actions", () => ({ salvarItemTech: vi.fn(), comentarItemTech: vi.fn() }));

import { FormularioItem, type ItemDoFormulario } from "./FormularioItem";

beforeAll(() => vi.stubGlobal("React", React));
afterAll(() => vi.unstubAllGlobals());

const base = { sistemas: [], users: [{ id: "u1", name: "Pessoa Um" }], entregas: [{ id: "e1", title: "Entrega antiga" }, { id: "i1", title: "O próprio item" }], voltar: "/controle-interno" };
const item: ItemDoFormulario = {
  id: "i1", version: 3, title: "Botão não salva", description: "Passos…", type: "FEATURE", priority: 3, status: "IN_PROGRESS",
  systemMode: "NONE", systemKey: null, assigneeId: "u1", assigneeName: "Pessoa Um", dueDate: null, size: "M", originItemId: null,
};
type Props = React.ComponentProps<typeof FormularioItem>;
const html = (extra: Partial<Props> = {}) => renderToStaticMarkup(React.createElement(FormularioItem, { ...base, podeEditar: true, ...extra } as Props));

/** Os rádios de um grupo, com o valor, se vem marcado e se é obrigatório. */
function radios(h: string, name: string) {
  return [...h.matchAll(/<input type="radio"[^>]*>/g)].map(m => m[0]).filter(t => t.includes(`name="${name}"`)).map(t => ({
    valor: /value="([^"]*)"/.exec(t)?.[1], marcado: / checked=""/.test(t), obrigatorio: / required=""/.test(t),
  }));
}
const valoresEscondidos = (h: string, name: string) => [...h.matchAll(/<input type="hidden" name="([^"]+)" value="([^"]*)"\/>/g)].filter(m => m[1] === name).map(m => m[2]);

describe("FormularioItem — item novo (disposição de página)", () => {
  it("duas colunas pela largura do formulário: o texto à esquerda e o cartão Detalhes ao lado", () => {
    const h = html();
    expect(h).toContain("@4xl:grid-cols-[minmax(0,1fr)_24rem]");
    expect(h).toContain('id="tech-detalhes"');
    // No celular é uma coluna só: a ordem do HTML deixa os detalhes embaixo.
    const titulo = h.indexOf('id="tech-title"'), descricao = h.indexOf('id="tech-description"'), evidencias = h.indexOf("Evidências"), detalhes = h.indexOf('id="tech-detalhes"');
    expect(titulo).toBeGreaterThan(-1);
    expect(descricao).toBeGreaterThan(titulo);
    expect(evidencias).toBeGreaterThan(descricao);
    expect(detalhes).toBeGreaterThan(evidencias);
  });
  it("título grande e descrição alta", () => {
    const h = html();
    const campo = /<input[^>]*id="tech-title"[^>]*>/.exec(h)?.[0] ?? "";
    expect(campo).toContain("h-12 text-fs-7");
    expect(h).toMatch(/<textarea[^>]*rows="12"/);
  });
  it("evidências aceitam arrastar, colar e escolher", () => {
    const h = html();
    expect(h).toContain("Arraste os arquivos aqui, cole (Ctrl+V) ou");
    expect(h).toContain('type="file"');
  });
  it("Tipo e Prioridade são pílulas em radiogroup, com Média marcada e nenhum tipo pré-escolhido", () => {
    const h = html();
    expect(h.match(/role="radiogroup"/g)).toHaveLength(2);
    const tipo = radios(h, "type"), prioridade = radios(h, "priority");
    expect(tipo.map(r => r.valor)).toEqual(["BUG", "IMPROVEMENT", "FEATURE", "TEST", "MIGRATION"]);
    expect(tipo.every(r => r.obrigatorio && !r.marcado)).toBe(true);
    expect(prioridade.map(r => r.valor)).toEqual(["0", "1", "2", "3"]);
    expect(prioridade.filter(r => r.marcado).map(r => r.valor)).toEqual(["1"]);
    // O select antigo saiu: o valor só vem dos rádios.
    expect(h).not.toMatch(/<select[^>]*name="(type|priority)"/);
  });
  it("rodapé preso no pé da tela com Cancelar (para a lista) e Criar item", () => {
    const h = html();
    expect(h).toContain("sticky bottom-0");
    expect(h).toMatch(/href="\/controle-interno"[^>]*>Cancelar|>Cancelar<\/a>/);
    expect(h).toContain("Criar item");
  });
  it("sem coordenar a Tech: o tamanho não se escolhe e vai vazio, como hoje", () => {
    const h = html();
    expect(h).not.toContain('id="tech-size"');
    expect(valoresEscondidos(h, "size")).toEqual([""]);
    expect(h).toContain("Quem coordena a Tech define.");
  });
  it("quem coordena escolhe o tamanho do item novo", () => {
    const h = html({ podeDefinirTamanho: true });
    expect(h).toContain('id="tech-size"');
    expect(h).toMatch(/<select[^>]*name="size"/);
    expect(valoresEscondidos(h, "size")).toEqual([]);
  });
});

describe("FormularioItem — tela do item (disposição compacta)", () => {
  const compacta = (extra: Partial<Props> = {}) => html({ item, disposicao: "compacta", ...extra });
  it("uma coluna: título, detalhes, descrição; sem cartão dentro de cartão, sem evidências e sem rodapé preso", () => {
    const h = compacta();
    expect(h).not.toContain('id="tech-detalhes"');
    expect(h).not.toContain("Evidências");
    expect(h).not.toContain("sticky bottom-0");
    const titulo = h.indexOf('id="tech-title"'), tipo = h.indexOf(">Tipo<"), descricao = h.indexOf('id="tech-description"');
    expect(tipo).toBeGreaterThan(titulo);
    expect(descricao).toBeGreaterThan(tipo);
    expect(h).toContain("Salvar alterações");
  });
  it("as pílulas trazem marcados o tipo e a prioridade do item", () => {
    const h = compacta();
    expect(radios(h, "type").filter(r => r.marcado).map(r => r.valor)).toEqual(["FEATURE"]);
    expect(radios(h, "priority").filter(r => r.marcado).map(r => r.valor)).toEqual(["3"]);
  });
  it("tamanho travado depois de Pendente: mostra o valor e o mantém no envio", () => {
    const h = compacta({ podeDefinirTamanho: true });
    expect(h).not.toContain('id="tech-size"');
    expect(valoresEscondidos(h, "size")).toEqual(["M"]);
    expect(h).toContain("M · Médio");
    expect(h).toContain("Travado: o item já começou.");
  });
  it("ainda Pendente, quem coordena muda o tamanho", () => {
    const h = compacta({ podeDefinirTamanho: true, item: { ...item, status: "PENDING" } });
    expect(h).toContain('id="tech-size"');
    expect(valoresEscondidos(h, "size")).toEqual([]);
  });
  it('"veio de" lista as entregas, menos o próprio item', () => {
    const h = compacta();
    expect(h).toContain("Entrega antiga");
    expect(h).not.toContain("O próprio item");
  });
  it("somente consulta: tudo desligado e sem botões de envio", () => {
    const h = compacta({ podeEditar: false });
    expect(h).toMatch(/<fieldset disabled=""[^>]*class="contents"/);
    expect(h).toContain("Acesso somente para consulta.");
    expect(h).not.toContain('type="submit"');
  });
});
