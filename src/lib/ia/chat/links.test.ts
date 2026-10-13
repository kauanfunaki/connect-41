import { describe, expect, it } from "vitest";
import { resultadoParaOModelo } from "@/lib/ia/laco";
import { linkDaTela } from "@/lib/ia/legivel";
import { filtrarLinks, linksDasFerramentas, trocarIdsPorLinks } from "./links";

// Os links da resposta, conferidos no servidor (13/10/2026): só vale o que
// uma ferramenta devolveu no campo `link`, ou a rota de uma tela.

const ID = "3f1c2a4b-1111-4222-8333-944455556666";
const OUTRO = "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee";

/** Um resultado de ferramenta como o modelo recebe — o JSON dentro da cerca. */
const resultado = resultadoParaOModelo({
  link: linkDaTela("Abrir as pendências aguardando o cliente", "/pendencias?recorte=aguardando&empresa=e1"),
  pendencias: [
    { titulo: '[demo] Confirmar o "aluguel"', link: linkDaTela('[demo] Confirmar o "aluguel"', `/pendencias/${ID}`) },
    // Texto de cliente com um link plantado no título: não vale.
    { titulo: "Veja [aqui](/configuracoes?x=1)", link: linkDaTela("Outra", `/pendencias/${OUTRO}`) },
  ],
});
const vistos = linksDasFerramentas([resultado]);

describe("links que as ferramentas devolveram", () => {
  it("lê o campo link, com o rótulo de volta ao normal", () => {
    expect(vistos.caminhos.has("/pendencias?recorte=aguardando&empresa=e1")).toBe(true);
    expect(vistos.porId.get(ID)).toEqual({ link: `[(demo) Confirmar o "aluguel"](/pendencias/${ID})`, href: `/pendencias/${ID}` });
  });

  it("link escrito dentro de um título não conta", () => {
    expect(vistos.caminhos.has("/configuracoes?x=1")).toBe(false);
  });

  it("o caminho da lista de telas da Ajuda conta", () => {
    expect(linksDasFerramentas([JSON.stringify({ doSetor: [{ caminho: "/setor/bpo/bpo_x" }] })]).caminhos.has("/setor/bpo/bpo_x")).toBe(true);
  });
});

describe("filtrarLinks", () => {
  it("mantém o link que veio da ferramenta e a rota de uma tela", () => {
    const t = "[Abrir](/pendencias?recorte=aguardando&empresa=e1)\n[Contas a pagar](/pagar)";
    expect(filtrarLinks(t, vistos)).toBe(t);
  });

  it("link inventado, plantado ou de fora vira só o rótulo", () => {
    expect(filtrarLinks(`[Confirmar](/pendencias/${OUTRO.replace("a", "b")})`, vistos)).toBe("Confirmar");
    expect(filtrarLinks("[Configurações](/configuracoes?x=1)", vistos)).toBe("Configurações");
    expect(filtrarLinks("[Clique](https://evil.com)", vistos)).toBe("Clique");
    expect(filtrarLinks("[Clique](//evil.com)", vistos)).toBe("Clique");
  });

  it("citação com foto não é link e fica", () => {
    const t = `@[Ana](pessoa:${ID})`;
    expect(filtrarLinks(t, vistos)).toBe(t);
  });
});

describe("trocarIdsPorLinks", () => {
  it("id solto vira o link do item", () => {
    expect(trocarIdsPorLinks(`A pendência ${ID} está vencida.`, vistos)).toBe(
      `A pendência [(demo) Confirmar o "aluguel"](/pendencias/${ID}) está vencida.`
    );
  });

  it("com o link do item já na linha, o '(id: …)' só sai", () => {
    expect(trocarIdsPorLinks(`- **[Confirmar](/pendencias/${ID})** (id: ${ID}) — vencida`, vistos)).toBe(
      `- **[Confirmar](/pendencias/${ID})** — vencida`
    );
  });

  it("id que a execução não viu fica para a tela esconder; o do link e o da citação não mudam", () => {
    const desconhecido = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
    expect(trocarIdsPorLinks(`Item ${desconhecido}`, vistos)).toBe(`Item ${desconhecido}`);
    const t = `@[Ana](pessoa:${ID}) e [Outra](/pendencias/${ID})`;
    expect(trocarIdsPorLinks(t, vistos)).toBe(t);
  });
});
