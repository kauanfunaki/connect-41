import { describe, expect, it } from "vitest";
import {
  codigoEmPalavras,
  humanizarCodigos,
  lerMarkdown,
  lerTrechos,
  linkPermitido,
  linkSozinho,
  ocultarIds,
  respostaEmTextoSimples,
  type Bloco,
  type Trecho,
} from "./markdown";

// O Markdown da resposta da Ceci (13/10/2026): o pedaço que o chat desenha,
// com link só para dentro do Connect.

const ID = "3f1c2a4b-1111-4222-8333-944455556666";

/** Os trechos de volta em texto, com os links marcados — para comparar sem a árvore. */
function plano(ts: Trecho[]): string {
  return ts
    .map((t) => {
      if (t.t === "texto") return t.v;
      if (t.t === "codigo") return `\`${t.v}\``;
      if (t.t === "link") return `<${t.rotulo}→${t.href}>`;
      if (t.t === "citacao") return `@${t.nome}`;
      return t.t === "negrito" ? `**${plano(t.filhos)}**` : `_${plano(t.filhos)}_`;
    })
    .join("");
}

describe("trechos", () => {
  it("negrito, itálico e código", () => {
    expect(plano(lerTrechos("**3 pendências** esperando, _2 vencidas_ e `x`"))).toBe("**3 pendências** esperando, _2 vencidas_ e `x`");
    expect(plano(lerTrechos("__forte__ e *leve*"))).toBe("**forte** e _leve_");
  });

  it("conta e nome com * e _ soltos não viram itálico", () => {
    expect(plano(lerTrechos("3 * 4 = 12"))).toBe("3 * 4 = 12");
    expect(plano(lerTrechos("arquivo_de_teste.xml"))).toBe("arquivo_de_teste.xml");
  });

  it("link interno de tela conhecida vira link, com o rótulo escrito", () => {
    const ts = lerTrechos("Veja [as pendências aguardando](/pendencias?recorte=aguardando) agora.");
    expect(plano(ts)).toBe("Veja <as pendências aguardando→/pendencias?recorte=aguardando> agora.");
  });

  it("link de fora nunca é clicável: fica só o rótulo, sem o endereço", () => {
    for (const href of ["https://evil.com", "//evil.com/pagar", "javascript:alert(1)", "/\\evil.com", "mailto:a@b.c", "/nao-existe"]) {
      const ts = lerTrechos(`[Clique aqui](${href})`);
      expect(ts.some((t) => t.t === "link"), href).toBe(false);
      expect(plano(ts), href).toBe("Clique aqui");
    }
  });

  it("imagem nunca é carregada: fica o texto alternativo", () => {
    expect(plano(lerTrechos("![logo](https://evil.com/x.png) fim"))).toBe("logo fim");
    expect(plano(lerTrechos("![](https://evil.com/x.png)"))).toBe("");
  });

  it("caminho solto de tela conhecida vira link com o nome da tela; desconhecido fica texto", () => {
    expect(plano(lerTrechos("Fica em /pagar."))).toBe("Fica em <Contas a pagar→/pagar>.");
    expect(plano(lerTrechos("Venceu em 12/09/2026 e /xyz não existe"))).toBe("Venceu em 12/09/2026 e /xyz não existe");
  });

  it("endereço de fora no meio do texto continua texto", () => {
    expect(lerTrechos("veja https://exemplo.com/pagar").some((t) => t.t === "link")).toBe(false);
  });

  it("citação de pessoa com foto continua funcionando", () => {
    const ts = lerTrechos(`Falar com @[Ana Souza](pessoa:${ID}).`);
    expect(ts.find((t) => t.t === "citacao")).toEqual({ t: "citacao", tipo: "pessoa", id: ID, nome: "Ana Souza" });
  });

  it("rótulo que é só o caminho ganha o nome da tela", () => {
    expect(plano(lerTrechos("[/pendencias](/pendencias)"))).toBe("<Abrir Pendências ao cliente→/pendencias>");
  });
});

describe("blocos", () => {
  it("o exemplo do Kauan: resumo, itens em lista, títulos pequenos e o link como botão", () => {
    const blocos = lerMarkdown(
      [
        "**3 pendências esperando o cliente**, 2 vencidas.",
        "",
        "### Vencidas",
        "- **Confirmar o pagamento do aluguel** — Transportes Modelo — venceu em **12/09/2026**",
        "- **Enviar o extrato de setembro** — Transportes Modelo — venceu em **12/09/2026**",
        "",
        "[Abrir as pendências aguardando o cliente](/pendencias?recorte=aguardando)",
      ].join("\n")
    );
    expect(blocos.map((b) => b.t)).toEqual(["paragrafo", "titulo", "lista", "botoes"]);
    const lista = blocos[2] as Extract<Bloco, { t: "lista" }>;
    expect(lista.itens).toHaveLength(2);
    expect(plano(lista.itens[0]!.filhos)).toBe("**Confirmar o pagamento do aluguel** — Transportes Modelo — venceu em **12/09/2026**");
    expect(blocos[3]).toEqual({ t: "botoes", links: [{ rotulo: "Abrir as pendências aguardando o cliente", href: "/pendencias?recorte=aguardando" }] });
  });

  it("o 'Link: /caminho' solto do fim da resposta vira botão", () => {
    expect(lerMarkdown("Link: /pendencias?recorte=aguardando")).toEqual([
      { t: "botoes", links: [{ rotulo: "Abrir Pendências ao cliente", href: "/pendencias?recorte=aguardando" }] },
    ]);
    expect(linkSozinho("🔗 [Abrir as férias](/ferias)")).toEqual({ rotulo: "Abrir as férias", href: "/ferias" });
    expect(linkSozinho("Link: https://evil.com")).toBeNull();
  });

  it("links seguidos ficam lado a lado, no mesmo grupo", () => {
    const b = lerMarkdown("[Contas a pagar](/pagar)\n[Contas a receber](/receber)");
    expect(b).toHaveLength(1);
    expect(b[0]!.t === "botoes" && b[0]!.links.map((l) => l.href)).toEqual(["/pagar", "/receber"]);
  });

  it("título grande desce para o pequeno — não tem título de página no balão", () => {
    expect(lerMarkdown("# Resumo\n## Detalhe").map((b) => b.t)).toEqual(["titulo", "titulo"]);
  });

  it("lista numerada guarda o número de início e a sublista", () => {
    const [l] = lerMarkdown("3. três\n4. quatro\n   - detalhe") as Extract<Bloco, { t: "lista" }>[];
    expect(l!.ordenada).toBe(true);
    expect(l!.inicio).toBe(3);
    expect(l!.itens).toHaveLength(2);
    expect(l!.itens[1]!.sub.map(plano)).toEqual(["detalhe"]);
  });

  it("tabela simples", () => {
    const [t] = lerMarkdown("| Empresa | Vencidas |\n|---|---:|\n| Padaria | **2** |\n| Transportes | 1 |") as Extract<Bloco, { t: "tabela" }>[];
    expect(t!.t).toBe("tabela");
    expect(t!.cabecalho.map(plano)).toEqual(["Empresa", "Vencidas"]);
    expect(t!.linhas.map((l) => l.map(plano))).toEqual([
      ["Padaria", "**2**"],
      ["Transportes", "1"],
    ]);
  });

  it("HTML do modelo nunca vira marcação: as tags saem e fica o texto", () => {
    const b = lerMarkdown('<script>alert(1)</script><b>Oi</b><img src=x onerror="alert(1)"><a href="https://evil.com">aqui</a>');
    const texto = b.map((x) => (x.t === "paragrafo" ? plano(x.filhos) : "")).join("|");
    expect(texto).not.toMatch(/[<>]/);
    expect(texto).toContain("Oi");
    expect(texto).toContain("aqui");
  });

  it("bloco de código fica como texto em fonte fixa", () => {
    expect(lerMarkdown("```\n<b>x</b> **y**\n```")).toEqual([{ t: "codigo", v: "x **y**" }]);
  });
});

describe("id interno no texto", () => {
  it("some, com o '(id: …)' em volta", () => {
    expect(ocultarIds(`Pendência Confirmar aluguel (id: ${ID}) vencida.`)).toBe("Pendência Confirmar aluguel vencida.");
    expect(ocultarIds(`Pendência ${ID} vencida`)).toBe("Pendência vencida");
    expect(ocultarIds(`Etapa — id ${ID}.`)).toBe("Etapa.");
    expect(ocultarIds(`(${ID.toUpperCase()})`)).toBe("");
    expect(ocultarIds("Processo 3f1c2a4b-1111-4222… parado")).toBe("Processo parado");
  });

  it("número de verdade fica: data, valor, protocolo, CNPJ", () => {
    for (const t of ["12/09/2026", "R$ 1.234,56", "Protocolo 20261013-0001", "CNPJ 12.345.678/0001-90", "12345678-1234-5678"]) {
      expect(ocultarIds(t)).toBe(t);
    }
  });

  it("no link para o item, o id fica no endereço e não aparece", () => {
    const [p] = lerMarkdown(`Veja [Confirmar aluguel](/pendencias/${ID}) — id ${ID}`) as Extract<Bloco, { t: "paragrafo" }>[];
    expect(plano(p!.filhos)).toBe(`Veja <Confirmar aluguel→/pendencias/${ID}>`);
  });
});

describe("código de situação que escapou", () => {
  it("vira palavra", () => {
    expect(codigoEmPalavras("SEM_PRAZO")).toBe("sem prazo");
    expect(codigoEmPalavras("EM_ANALISE")).toBe("em análise");
    expect(codigoEmPalavras("PENDENTE_APROVACAO")).toBe("pendente de aprovação");
    expect(humanizarCodigos("Status: ABERTA — Prazo: SEM_PRAZO — Situação do prazo: VENCIDA")).toBe(
      "Status: aberta — Prazo: sem prazo — Situação do prazo: vencida"
    );
  });

  it("sigla e nome de empresa em maiúsculas ficam", () => {
    for (const t of ["BLD LOGISTICA LTDA", "TRANSPORTES ATIVO LTDA", "NF-e, CT-e, DRE, BPO, CNPJ", "PADARIA ABERTA", "EXTRATO_SETEMBRO.pdf", "PENDENTE.xml"]) {
      expect(humanizarCodigos(t)).toBe(t);
    }
  });
});

describe("texto para copiar", () => {
  it("sem marcação, sem id e sem botão", () => {
    const t = respostaEmTextoSimples(
      `**3 pendências**, 2 vencidas.\n- **[Confirmar aluguel](/pendencias/${ID})** — vencida\n\n[Abrir as pendências](/pendencias)`
    );
    expect(t).toBe("3 pendências, 2 vencidas.\n• Confirmar aluguel — vencida");
  });
});

describe("linkPermitido", () => {
  it("só tela do Connect", () => {
    expect(linkPermitido("/pagar?recorte=vencidas")).toBe(true);
    expect(linkPermitido(`/processos/${ID}`)).toBe(true);
    expect(linkPermitido("/api/ia/chat")).toBe(false);
    expect(linkPermitido("https://app.useconnect.com.br/pagar")).toBe(false);
  });
});
