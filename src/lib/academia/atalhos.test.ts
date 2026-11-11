import { describe, expect, it } from "vitest";
import {
  BANCO_DE_ATALHOS, PEDIDOS_POR_RODADA, atalhosDoNivel, avaliarAtalhos, combinacaoDoEvento, navegadorPrende, sortearPedidos, type TeclaApertada,
} from "./atalhos";

const tecla = (key: string, code: string, mods: Partial<TeclaApertada> = {}): TeclaApertada => ({
  key, code, ctrlKey: false, shiftKey: false, altKey: false, metaKey: false, ...mods,
});

describe("banco de atalhos", () => {
  it("ids únicos, e toda combinação na ordem Ctrl, Shift, Alt, tecla", () => {
    const ids = BANCO_DE_ATALHOS.map((x) => x.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const x of BANCO_DE_ATALHOS) {
      expect(x.teclas.length, x.id).toBeGreaterThan(0);
      for (const t of x.teclas) expect(t, x.id).toMatch(/^(Ctrl\+)?(Shift\+)?(Alt\+)?[^\s]+$/);
    }
  });

  it("nenhum atalho do banco é dos que o navegador não deixa a página pegar", () => {
    for (const x of BANCO_DE_ATALHOS) for (const t of x.teclas) expect(navegadorPrende(t), `${x.id}: ${t}`).toBe(false);
    expect(navegadorPrende("Ctrl+T")).toBe(true);
    expect(navegadorPrende("Ctrl+1")).toBe(true);
    expect(navegadorPrende("Ctrl+PageDown")).toBe(true);
  });

  it("o médio inclui os fáceis, e o difícil inclui todos", () => {
    const facil = atalhosDoNivel("facil");
    const medio = atalhosDoNivel("medio");
    expect(facil.every((x) => x.nivel === "facil")).toBe(true);
    expect(medio.length).toBeGreaterThan(facil.length);
    expect(atalhosDoNivel("dificil")).toHaveLength(BANCO_DE_ATALHOS.length);
  });

  it("o sorteio não repete o mesmo atalho seguido", () => {
    const pedidos = sortearPedidos("facil");
    expect(pedidos).toHaveLength(PEDIDOS_POR_RODADA);
    for (let i = 1; i < pedidos.length; i++) expect(pedidos[i]).not.toBe(pedidos[i - 1]);
  });
});

describe("combinacaoDoEvento", () => {
  it("letra pela posição, com Ctrl (e Cmd conta como Ctrl)", () => {
    expect(combinacaoDoEvento(tecla("c", "KeyC", { ctrlKey: true }))).toBe("Ctrl+C");
    expect(combinacaoDoEvento(tecla("c", "KeyC", { metaKey: true }))).toBe("Ctrl+C");
    expect(combinacaoDoEvento(tecla("L", "KeyL", { ctrlKey: true, shiftKey: true }))).toBe("Ctrl+Shift+L");
  });

  it("pontuação pelo caractere: Ctrl+; , Alt+= , Ctrl+Shift+$ e Ctrl+-", () => {
    expect(combinacaoDoEvento(tecla(";", "Slash", { ctrlKey: true }))).toBe("Ctrl+;");
    expect(combinacaoDoEvento(tecla("=", "Equal", { altKey: true }))).toBe("Alt+=");
    expect(combinacaoDoEvento(tecla("$", "Digit4", { ctrlKey: true, shiftKey: true }))).toBe("Ctrl+Shift+$");
    expect(combinacaoDoEvento(tecla("-", "Minus", { ctrlKey: true }))).toBe("Ctrl+-");
  });

  it("teclas especiais sozinhas valem; letra sozinha e modificador sozinho, não", () => {
    expect(combinacaoDoEvento(tecla("F2", "F2"))).toBe("F2");
    expect(combinacaoDoEvento(tecla("F2", "F2", { shiftKey: true }))).toBe("Shift+F2");
    expect(combinacaoDoEvento(tecla("Escape", "Escape"))).toBe("Esc");
    expect(combinacaoDoEvento(tecla("a", "KeyA"))).toBeNull();
    expect(combinacaoDoEvento(tecla("A", "KeyA", { shiftKey: true }))).toBeNull();
    expect(combinacaoDoEvento(tecla("Control", "ControlLeft", { ctrlKey: true }))).toBeNull();
    expect(combinacaoDoEvento(tecla("ArrowDown", "ArrowDown"))).toBeNull();
    // O Tab (e o Shift+Tab) continua andando pela tela.
    expect(combinacaoDoEvento(tecla("Tab", "Tab"))).toBeNull();
    expect(combinacaoDoEvento(tecla("Tab", "Tab", { shiftKey: true }))).toBeNull();
  });

  it("setas, espaço e Enter com modificador", () => {
    expect(combinacaoDoEvento(tecla("ArrowDown", "ArrowDown", { ctrlKey: true }))).toBe("Ctrl+↓");
    expect(combinacaoDoEvento(tecla("ArrowDown", "ArrowDown", { ctrlKey: true, shiftKey: true }))).toBe("Ctrl+Shift+↓");
    expect(combinacaoDoEvento(tecla(" ", "Space", { shiftKey: true }))).toBe("Shift+Espaço");
    expect(combinacaoDoEvento(tecla(" ", "Space", { ctrlKey: true }))).toBe("Ctrl+Espaço");
    expect(combinacaoDoEvento(tecla("Enter", "Enter", { altKey: true }))).toBe("Alt+Enter");
  });
});

describe("avaliarAtalhos", () => {
  const pedidos = ["copiar", "colar", "salvar", "buscar-connect"];

  it("conta os acertos entre os respondidos, e aceita a variante do Excel em inglês", () => {
    const r = avaliarAtalhos({ pedidos, respostas: ["Ctrl+C", "Ctrl+X", "Ctrl+S"], duracaoDoNavegadorMs: 30_000, decorridoNoServidorMs: 31_000 });
    expect(r).toMatchObject({ ok: true, acertos: 2, total: 3, precisao: 66.67, duracaoMs: 30_000 });
    if (r.ok) expect(r.correcao[1]).toMatchObject({ certa: "Ctrl+V", respondida: "Ctrl+X", acertou: false });
  });

  it("a duração tem teto de 60 s e cai para a do servidor quando a do navegador não confere", () => {
    const r = avaliarAtalhos({ pedidos, respostas: ["Ctrl+C"], duracaoDoNavegadorMs: 5_000, decorridoNoServidorMs: 70_000 });
    expect(r).toMatchObject({ ok: true, duracaoMs: 60_000 });
  });

  it("recusa respostas demais, rodada curta e resposta rápida demais", () => {
    expect(avaliarAtalhos({ pedidos: ["copiar"], respostas: ["Ctrl+C", "Ctrl+V"], duracaoDoNavegadorMs: 10_000, decorridoNoServidorMs: 10_000 })).toMatchObject({ ok: false, codigo: "respostas" });
    expect(avaliarAtalhos({ pedidos, respostas: [], duracaoDoNavegadorMs: 1_000, decorridoNoServidorMs: 1_000 })).toMatchObject({ ok: false, codigo: "curta" });
    expect(avaliarAtalhos({ pedidos, respostas: ["Ctrl+C", "Ctrl+V", "Ctrl+B", "Ctrl+K"], duracaoDoNavegadorMs: 3_200, decorridoNoServidorMs: 3_300 }).ok).toBe(true);
    const muitas = sortearPedidos("facil", Math.random, 40);
    expect(avaliarAtalhos({ pedidos: muitas, respostas: muitas.map(() => "Ctrl+C"), duracaoDoNavegadorMs: 5_000, decorridoNoServidorMs: 5_000 })).toMatchObject({ ok: false, codigo: "rapida" });
  });
});
