import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { categoriaSchema, type DadosDoChamado } from "@/lib/chamados/regras";
import { EditarDadosDoChamado } from "./EditarDadosDoChamado";

beforeAll(() => vi.stubGlobal("React", React));
afterAll(() => vi.unstubAllGlobals());

const raiz = { ...categoriaSchema.parse({ name: "Infraestrutura" }), id: "raiz" };
const categoria = { ...categoriaSchema.parse({ name: "Hardware", parentId: "raiz", formSchema: [{ key: "local", label: "Local", type: "text" }] }), id: "cat-1" };
const outra = { ...categoriaSchema.parse({ name: "Rede", parentId: "raiz" }), id: "cat-2" };
const inicial: DadosDoChamado = { title: "Impressora não imprime", description: "Desde ontem.", categoryId: "cat-1", requesterSectorCode: "bpo", priority: "ALTA", requestData: { local: "2º andar" }, tags: ["fiscal"], handlingSectorCode: "" };
const html = (extra: Partial<React.ComponentProps<typeof EditarDadosDoChamado>> = {}) => renderToStaticMarkup(React.createElement(EditarDadosDoChamado, {
  inicial, categorias: [raiz, categoria, outra], setores: [{ code: "bpo", label: "BPO" }], salvando: false, erro: "", onSalvar: () => {}, onFechar: () => {}, ...extra,
}));

describe("EditarDadosDoChamado — a janela (melhoria-809, uma coluna)", () => {
  it("é um diálogo de 672 px, sem as duas colunas, com a categoria antes do título e os campos dela depois da descrição", () => {
    const h = html();
    expect(h).toContain('role="dialog"');
    expect(h).toContain("Editar dados do chamado");
    expect(h).toContain("max-w-2xl");
    expect(h).not.toContain("lg:grid-cols-2");
    expect(h).not.toContain("Selecione a categoria do chamado");
    const categoriaEm = h.indexOf('role="combobox"'), tituloEm = h.indexOf('value="Impressora não imprime"'), descricaoEm = h.indexOf("Desde ontem."), campoEm = h.indexOf('value="2º andar"'), prioridadeEm = h.indexOf('aria-label="Prioridade"');
    expect(categoriaEm).toBeGreaterThan(-1);
    expect(tituloEm).toBeGreaterThan(categoriaEm);
    expect(descricaoEm).toBeGreaterThan(tituloEm);
    expect(campoEm).toBeGreaterThan(descricaoEm);
    expect(prioridadeEm).toBeGreaterThan(campoEm);
  });
  it("a categoria é um campo de escolha com o grupo apagado antes do tipo", () => {
    const h = html();
    expect(h).toMatch(/<span class="text-fg-muted">Infraestrutura › <\/span>Hardware/);
    expect(h).toMatch(/<optgroup label="Infraestrutura"><option value="cat-1" selected="">Hardware<\/option><option value="cat-2">Rede<\/option><\/optgroup>/);
  });
  it("o setor solicitante é só leitura, com o cadeado, e não um campo desabilitado", () => {
    const h = html();
    expect(h).toContain("Setor solicitante");
    expect(h).toContain(">BPO<");
    expect(h).not.toContain("Selecione o setor");
  });
  it("descrição com o contador, prioridade em botões e tags como etiquetas", () => {
    const h = html();
    expect(h).toContain("12 / 15.000");
    expect(h).toMatch(/aria-pressed="true"[^>]*>(?:<span[^>]*><\/span>)?Alta/);
    for (const nivel of ["Baixa", "Média", "Urgente"]) expect(h).toContain(nivel);
    expect(h).toContain('aria-label="Tirar a tag fiscal"');
    expect(h).toContain("Enter adiciona");
  });
  it("Salvar dados travado até mudar algo", () => {
    const h = html();
    expect(h).toContain("Nada alterado ainda.");
    expect(/<button[^>]*type="submit"[^>]*disabled=""[^>]*>[\s\S]*?Salvar dados/.test(h)).toBe(true);
  });
  it("mostra o erro da gravação dentro da janela", () => {
    expect(html({ erro: "O chamado mudou. Atualize a página." })).toContain('role="alert"');
  });
  it("a confirmação de descarte só aparece ao pedir para fechar", () => {
    expect(html()).not.toContain("Descartar as alterações?");
  });
});
