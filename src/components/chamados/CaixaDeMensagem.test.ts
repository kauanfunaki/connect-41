import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

// A caixa chama a action e o roteador; aqui só importa o que ela desenha.
vi.mock("@/app/(app)/chamados/actions", () => ({ responder: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));

beforeAll(() => vi.stubGlobal("React", React));
afterAll(() => vi.unstubAllGlobals());

const chamado = { id: "t1", draftId: "d1", version: 3 };
async function html(props: { podeInterno: boolean; abertaInicial?: boolean }) {
  const { CaixaDeMensagem } = await import("./CaixaDeMensagem");
  return renderToStaticMarkup(React.createElement(CaixaDeMensagem, { chamado, ...props }));
}

describe("CaixaDeMensagem — recolhida e aberta", () => {
  it("começa recolhida: uma linha para escrever e o clipe, sem a barra de envio", async () => {
    const h = await html({ podeInterno: true });
    expect(h).toContain('placeholder="Escrever uma resposta…"');
    expect(h).toContain('rows="1"');
    expect(h).toContain('aria-label="Anexar arquivos"');
    expect(h).not.toContain("Enviar mensagem");
    expect(h).not.toContain("Somente a equipe");
    expect(h).not.toContain("Ctrl+Enter envia");
  });
  it("aberta mostra a caixa de hoje: campo maior, Somente a equipe, Recolher e Enviar", async () => {
    const h = await html({ podeInterno: true, abertaInicial: true });
    expect(h).toContain('rows="3"');
    expect(h).toContain("Cole prints e arquivos com Ctrl+V");
    expect(h).toContain("Somente a equipe");
    expect(h).toContain('aria-label="Recolher a caixa (o rascunho fica)"');
    expect(h).toContain("Enviar mensagem");
    expect(h).toContain("Ctrl+Enter envia");
  });
  it("sem permissão de nota interna, aberta não oferece Somente a equipe", async () => {
    expect(await html({ podeInterno: false, abertaInicial: true })).not.toContain("Somente a equipe");
  });
});
