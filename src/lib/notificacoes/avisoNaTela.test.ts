import { describe, expect, it } from "vitest";
import {
  MAXIMO_DE_AVISOS,
  MOSTRADOS_GUARDADOS,
  avisosParaMostrar,
  cursorDepois,
  destinoDoClique,
  lembrarMostrados,
  lerDesde,
  type NotificacaoNova,
} from "./avisoNaTela";

const nova = (id: string, minuto: number, extra: Partial<NotificacaoNova> = {}): NotificacaoNova => ({
  id,
  tipo: "ROBO_CAPTCHA",
  titulo: "O robô parou no captcha",
  mensagem: "Abra e marque com o mouse.",
  href: `/robo/assistir/${id}`,
  lida: false,
  criadaEm: new Date(Date.UTC(2026, 10, 9, 14, minuto)).toISOString(),
  ...extra,
});

describe("avisosParaMostrar (quais notificações viram aviso no canto)", () => {
  it("as não lidas que ainda não apareceram, na ordem em que chegaram", () => {
    const r = avisosParaMostrar([nova("b", 2), nova("a", 1)], new Set());
    expect(r.map((n) => n.id)).toEqual(["a", "b"]);
  });
  it("lida não vira aviso", () => {
    expect(avisosParaMostrar([nova("a", 1, { lida: true })], new Set())).toEqual([]);
  });
  it("sem repetir: o que já apareceu (nesta aba ou em outra) fica de fora, e o mesmo id duas vezes vira um aviso só", () => {
    expect(avisosParaMostrar([nova("a", 1), nova("b", 2)], new Set(["a"])).map((n) => n.id)).toEqual(["b"]);
    expect(avisosParaMostrar([nova("a", 1), nova("a", 1)], new Set()).map((n) => n.id)).toEqual(["a"]);
  });
  it("no máximo 3 juntos: ficam as mais novas", () => {
    const r = avisosParaMostrar([nova("a", 1), nova("b", 2), nova("c", 3), nova("d", 4), nova("e", 5)], new Set());
    expect(MAXIMO_DE_AVISOS).toBe(3);
    expect(r.map((n) => n.id)).toEqual(["c", "d", "e"]);
  });
});

describe("destinoDoClique", () => {
  it("o caminho do aviso, quando é do próprio Connect", () => {
    expect(destinoDoClique({ href: "/robo/assistir/t1" })).toBe("/robo/assistir/t1");
    expect(destinoDoClique({ href: "/certidoes?recorte=positivas" })).toBe("/certidoes?recorte=positivas");
  });
  it("sem caminho, ou fora do Connect, o aviso não vira link", () => {
    expect(destinoDoClique({ href: null })).toBeNull();
    expect(destinoDoClique({ href: "" })).toBeNull();
    expect(destinoDoClique({ href: "https://exemplo.invalid/x" })).toBeNull();
    expect(destinoDoClique({ href: "//exemplo.invalid/x" })).toBeNull();
    expect(destinoDoClique({ href: "/\\exemplo.invalid" })).toBeNull();
    expect(destinoDoClique({ href: "javascript:alert(1)" })).toBeNull();
  });
});

describe("o cursor da conferência", () => {
  it("lerDesde aceita só instante válido", () => {
    expect(lerDesde("2026-11-09T14:00:00.000Z")?.toISOString()).toBe("2026-11-09T14:00:00.000Z");
    expect(lerDesde(null)).toBeNull();
    expect(lerDesde("")).toBeNull();
    expect(lerDesde("ontem")).toBeNull();
  });
  it("anda até a mais nova que chegou, e nunca para trás", () => {
    const desde = "2026-11-09T14:02:00.000Z";
    expect(cursorDepois(desde, [nova("a", 1), nova("b", 5), nova("c", 3)])).toBe(nova("b", 5).criadaEm);
    expect(cursorDepois(desde, [])).toBe(desde);
    expect(cursorDepois(desde, [nova("a", 1)])).toBe(desde);
  });
});

describe("lembrarMostrados", () => {
  it("sem repetir, os mais recentes no fim, com teto", () => {
    expect(lembrarMostrados(["a", "b"], ["b", "c"])).toEqual(["a", "b", "c"]);
    const muitos = Array.from({ length: MOSTRADOS_GUARDADOS }, (_, i) => `x${i}`);
    const r = lembrarMostrados(muitos, ["novo"]);
    expect(r).toHaveLength(MOSTRADOS_GUARDADOS);
    expect(r[r.length - 1]).toBe("novo");
    expect(r[0]).toBe("x1");
  });
});
