import { describe, expect, it } from "vitest";
import {
  JANELA_DA_CONFERENCIA,
  MAXIMO_DE_AVISOS,
  MOSTRADOS_GUARDADOS,
  TIPOS_NO_RESUMO,
  anuncioDaConferencia,
  avisoDoCanto,
  cursorDepois,
  destinoDoClique,
  lembrarMostrados,
  lerDesde,
  textoDoResumo,
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

/** A resposta da rota com a lista inteira (sem nada além da janela). */
const resposta = (novas: NotificacaoNova[], total = novas.length) => ({ novas, total });
const ids = (ns: readonly NotificacaoNova[]) => ns.map((n) => n.id);

describe("avisoDoCanto (um aviso só por conferência, nunca uma pilha)", () => {
  it("nada novo, nada no canto", () => {
    expect(avisoDoCanto(resposta([]), new Set())).toEqual({ aviso: null, mostradas: [] });
  });
  it("uma nova: o aviso dela, como no #449", () => {
    const r = avisoDoCanto(resposta([nova("a", 1)]), new Set());
    expect(r.aviso).toEqual({ tipo: "uma", notificacao: nova("a", 1) });
    expect(r.mostradas).toEqual(["a"]);
  });
  it("mais de uma (a volta à aba, ou o mesmo minuto): um resumo com quantas, e todas contam como mostradas", () => {
    const r = avisoDoCanto(resposta([nova("c", 3), nova("b", 2), nova("a", 1)]), new Set());
    expect(r.aviso).toMatchObject({ tipo: "resumo", quantas: 3, foraDaLista: 0 });
    expect(r.mostradas).toEqual(["a", "b", "c"]);
  });
  it("o que já apareceu no canto (nesta aba ou em outra) não conta de novo", () => {
    const r = avisoDoCanto(resposta([nova("a", 1), nova("b", 2), nova("c", 3)]), new Set(["a", "b"]));
    expect(r.aviso).toEqual({ tipo: "uma", notificacao: nova("c", 3) });
    expect(r.mostradas).toEqual(["c"]);
    expect(avisoDoCanto(resposta([nova("a", 1), nova("b", 2)]), new Set(["a", "b"]))).toEqual({ aviso: null, mostradas: [] });
  });
  it("lida não conta, e o mesmo id duas vezes conta uma", () => {
    expect(avisoDoCanto(resposta([nova("a", 1, { lida: true })]), new Set()).aviso).toBeNull();
    const r = avisoDoCanto(resposta([nova("a", 1), nova("a", 1)]), new Set());
    expect(r.aviso).toMatchObject({ tipo: "uma" });
    expect(r.mostradas).toEqual(["a"]);
  });
  it("os tipos do resumo: sem repetir, o mais novo primeiro", () => {
    const r = avisoDoCanto(
      resposta([
        nova("a", 1, { titulo: "Nova solicitação" }),
        nova("b", 2, { titulo: "Certidão positiva" }),
        nova("c", 3, { titulo: "Nova solicitação" }),
      ]),
      new Set()
    );
    expect(r.aviso).toMatchObject({ tipo: "resumo", quantas: 3, tipos: ["Nova solicitação", "Certidão positiva"] });
  });

  describe("além da lista (a rota traz só as mais novas e conta o resto)", () => {
    const lista = Array.from({ length: JANELA_DA_CONFERENCIA }, (_, i) => nova(`n${i}`, 10 + i));
    it("a lista toda inédita: as de fora entram na conta", () => {
      const r = avisoDoCanto(resposta(lista, JANELA_DA_CONFERENCIA + 7), new Set());
      expect(r.aviso).toMatchObject({ tipo: "resumo", quantas: JANELA_DA_CONFERENCIA + 7, foraDaLista: 7 });
      expect(r.mostradas).toEqual(ids(lista));
    });
    it("uma inédita na lista e mais de fora: já é resumo", () => {
      const r = avisoDoCanto(resposta([nova("a", 1)], 4), new Set());
      expect(r.aviso).toMatchObject({ tipo: "resumo", quantas: 4, foraDaLista: 3 });
    });
    it("a mais antiga da lista já apareceu: as de antes dela também — nada de aviso antigo", () => {
      const jaMostradas = new Set(ids(lista.slice(0, -1)));
      const r = avisoDoCanto(resposta(lista, JANELA_DA_CONFERENCIA + 7), jaMostradas);
      expect(r.aviso).toEqual({ tipo: "uma", notificacao: lista[lista.length - 1] });
    });
    it("a lista toda já apareceu: nada, mesmo com a contagem maior", () => {
      expect(avisoDoCanto(resposta(lista, JANELA_DA_CONFERENCIA + 7), new Set(ids(lista))).aviso).toBeNull();
    });
  });
});

describe("textoDoResumo", () => {
  it("o título diz quantas; embaixo, os tipos que chegaram", () => {
    expect(textoDoResumo({ quantas: 4, tipos: ["Nova solicitação"], foraDaLista: 0 })).toEqual({
      titulo: "4 avisos novos",
      mensagem: "Nova solicitação",
    });
    expect(textoDoResumo({ quantas: 2, tipos: ["Nova solicitação", "Certidão positiva"], foraDaLista: 0 }).mensagem).toBe(
      "Nova solicitação e Certidão positiva"
    );
  });
  it(`no máximo ${TIPOS_NO_RESUMO} tipos; o resto, e o que veio de fora da lista, vira "e outros"`, () => {
    expect(textoDoResumo({ quantas: 5, tipos: ["A", "B", "C", "D"], foraDaLista: 0 }).mensagem).toBe("A, B, C e outros");
    expect(textoDoResumo({ quantas: 5, tipos: ["A", "B", "C"], foraDaLista: 0 }).mensagem).toBe("A, B e C");
    expect(textoDoResumo({ quantas: 30, tipos: ["A"], foraDaLista: 10 }).mensagem).toBe("A e outros");
  });
});

describe("anuncioDaConferencia (o som e o aviso no computador)", () => {
  it("as não lidas que nenhuma aba anunciou, na ordem em que chegaram", () => {
    const r = anuncioDaConferencia([nova("b", 2), nova("a", 1), nova("c", 3, { lida: true })], new Set());
    expect(ids(r.anunciar)).toEqual(["a", "b"]);
    expect(r.anunciadas).toEqual(["a", "b"]);
  });
  it("o já anunciado não toca de novo — a aba em segundo plano confere a mesma lista a cada minuto", () => {
    const r = anuncioDaConferencia([nova("a", 1), nova("b", 2)], new Set(["a", "b"]));
    expect(r).toEqual({ anunciar: [], anunciadas: [] });
  });
  it("no computador, só as 3 mais novas; todas contam como anunciadas", () => {
    const r = anuncioDaConferencia([nova("a", 1), nova("b", 2), nova("c", 3), nova("d", 4), nova("e", 5)], new Set());
    expect(MAXIMO_DE_AVISOS).toBe(3);
    expect(ids(r.anunciar)).toEqual(["c", "d", "e"]);
    expect(r.anunciadas).toEqual(["a", "b", "c", "d", "e"]);
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
