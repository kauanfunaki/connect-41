import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { categoriaSchema, type DadosDoChamado } from "@/lib/chamados/regras";
import { EditarDadosDoChamado } from "./EditarDadosDoChamado";

beforeAll(() => vi.stubGlobal("React", React));
afterAll(() => vi.unstubAllGlobals());

const categoria = { ...categoriaSchema.parse({ name: "Infraestrutura", formSchema: [{ key: "local", label: "Local", type: "text" }] }), id: "cat-1" };
const inicial: DadosDoChamado = { title: "Impressora não imprime", description: "Desde ontem.", categoryId: "cat-1", requesterSectorCode: "bpo", priority: "ALTA", requestData: { local: "2º andar" }, tags: [], handlingSectorCode: "" };
const html = (extra: Partial<React.ComponentProps<typeof EditarDadosDoChamado>> = {}) => renderToStaticMarkup(React.createElement(EditarDadosDoChamado, {
  inicial, categorias: [categoria], setores: [{ code: "bpo", label: "BPO" }], salvando: false, erro: "", onSalvar: () => {}, onFechar: () => {}, ...extra,
}));

describe("EditarDadosDoChamado — a janela", () => {
  it("é um diálogo com título, em duas colunas: categoria à esquerda, o resto à direita", () => {
    const h = html();
    expect(h).toContain('role="dialog"');
    expect(h).toContain("Editar dados do chamado");
    expect(h).toContain("lg:grid-cols-2");
    const categoriaEm = h.indexOf("Selecione a categoria do chamado"), tituloEm = h.indexOf('value="Impressora não imprime"');
    expect(categoriaEm).toBeGreaterThan(-1);
    expect(tituloEm).toBeGreaterThan(categoriaEm);
    expect(h).toContain('value="2º andar"');
  });
  it("mesmos campos de antes, com o setor fixo, e Salvar dados travado até mudar algo", () => {
    const h = html();
    expect(h).toContain("Setor solicitante");
    expect(h).toContain("Descrição");
    expect(h).toContain("Tags (separadas por vírgula)");
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
