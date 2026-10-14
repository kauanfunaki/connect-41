import { describe, expect, it } from "vitest";
import { ROTULO_DO_PRAZO, ROTULO_DO_STATUS } from "@/lib/financeiro/pendencias/regras";
import { chavesLegiveis, codigoEmPalavras, comMinuscula, linkDaTela, mesLegivel, situacaoLegivel } from "./legivel";
import { rotuloDasPendencias } from "./ferramentas-bpo";
import { linkSozinho } from "./chat/markdown";

// O que as ferramentas da Lígia devolvem, em palavras (13/10/2026) — o
// "Status: Aberta — Prazo: SEM_PRAZO" do print do Kauan.

describe("situação em palavras", () => {
  it("o exemplo do Kauan", () => {
    expect(situacaoLegivel("ABERTA", ROTULO_DO_STATUS)).toBe("aguardando cliente");
    expect(situacaoLegivel("SEM_PRAZO", ROTULO_DO_PRAZO)).toBe("sem prazo");
    expect(situacaoLegivel("VENCIDA", ROTULO_DO_PRAZO)).toBe("vencida");
  });

  it("sem rótulo da tela, o código traduzido", () => {
    expect(codigoEmPalavras("EM_EXIGENCIA")).toBe("em exigência");
    expect(codigoEmPalavras("AGUARDANDO_ORGAO")).toBe("aguardando órgão");
    expect(codigoEmPalavras("sem_previsao")).toBe("sem previsão");
    expect(situacaoLegivel("TRIAGEM")).toBe("triagem");
    expect(situacaoLegivel(null)).toBeNull();
  });

  it("sigla não perde a maiúscula", () => {
    expect(comMinuscula("NF-e")).toBe("NF-e");
    expect(comMinuscula("Em gozo")).toBe("em gozo");
  });

  it("as chaves de contagem também", () => {
    expect(chavesLegiveis({ ATIVO: 3, EM_FERIAS: 1 })).toEqual({ ativo: 3, "em férias": 1 });
    expect(chavesLegiveis({ NFE: 2 }, { NFE: "NF-e" })).toEqual({ "NF-e": 2 });
  });
});

describe("link pronto para a Lígia copiar", () => {
  it("rótulo e caminho em Markdown, que a tela transforma em botão", () => {
    const l = linkDaTela(rotuloDasPendencias("aguardando", false), "/pendencias?recorte=aguardando");
    expect(l).toBe("[Abrir as pendências aguardando o cliente](/pendencias?recorte=aguardando)");
    expect(linkSozinho(l)).toEqual({ rotulo: "Abrir as pendências aguardando o cliente", href: "/pendencias?recorte=aguardando" });
  });

  it("colchete e quebra de linha no título não quebram o link", () => {
    expect(linkDaTela("[demo] Confirmar\no aluguel", "/pendencias/x")).toBe("[(demo) Confirmar o aluguel](/pendencias/x)");
  });

  it("o rótulo das pendências segue o recorte", () => {
    expect(rotuloDasPendencias("andamento", true)).toBe("Abrir as pendências vencidas");
    expect(rotuloDasPendencias("respondidas", false)).toBe("Abrir as pendências respondidas pelo cliente");
    expect(mesLegivel("2026-9")).toBe("09/2026");
  });
});
