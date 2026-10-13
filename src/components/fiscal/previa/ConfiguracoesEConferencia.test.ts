import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { criarCenario } from "@/lib/fiscal/previa/cenario";
vi.mock("./ContextoFiscal", () => ({ useFiscal: () => ({ cenario: criarCenario() }) }));
import { ConfiguracoesFiscal } from "./ConfiguracoesEConferencia";

describe("consulta das regras de processamento", () => {
  it.each(["cfop", "regras"])("a aba %s exibe as regras sem edição ou coluna de ações", aba => {
    const markup = renderToStaticMarkup(createElement(ConfiguracoesFiscal, { aba }));
    expect(markup).toContain("Regras fiscais</h2>");
    expect(markup).toContain("não podem ser editadas aqui");
    expect(markup).toContain("código de processamento do SPED");
    expect(markup).toContain("1102");
    expect(markup).toContain("Revenda");
    expect(markup).toContain("Fonte / procedência");
    expect(markup).not.toContain("Ações");
    expect(markup).not.toContain("Editar regra");
    expect(markup).not.toMatch(/<(button|form|input)\b/);
  });
});
