import { describe, expect, it } from "vitest";
import { FONTES_DA_AGENDA, fonteDoTipo, gravarFontesOcultas, lerFontesOcultas, tipoAtrasa, type TipoDePrazo } from "./fontesDaAgenda";
import { ROTULO_DO_PRAZO } from "./prazosDaAgendaRegras";

// O catálogo das fontes da Agenda (10/11/2026).

const TIPOS = Object.keys(ROTULO_DO_PRAZO) as TipoDePrazo[];

describe("catálogo das fontes", () => {
  it("todo tipo de prazo tem uma fonte, e uma só", () => {
    for (const t of TIPOS) {
      expect(FONTES_DA_AGENDA.filter((f) => f.tipos.includes(t)), t).toHaveLength(1);
      expect(fonteDoTipo(t)).toBeDefined();
    }
  });

  it("chaves sem repetição, cor de token (nenhuma cor nova) e rótulo curto", () => {
    expect(new Set(FONTES_DA_AGENDA.map((f) => f.chave)).size).toBe(FONTES_DA_AGENDA.length);
    for (const f of FONTES_DA_AGENDA) {
      expect(f.cor).toMatch(/^var\(--c41-[a-z0-9-]+\)$/);
      expect(f.rotulo.length).toBeLessThanOrEqual(18);
    }
  });

  it("as fontes novas dependem da regra da própria tela", () => {
    const def = (k: string) => FONTES_DA_AGENDA.find((f) => f.chave === k)!;
    // Guias do mês: o módulo de Autorizações (acessoAsAutorizacoes).
    expect(def("guias").modulos).toEqual(["fiscal_autorizacoes"]);
    // Obrigações: atividades dos Quadros — o escopo do quadro, sem módulo.
    expect(def("obrigacoes").modulos).toEqual([]);
    expect(fonteDoTipo("obrigacao")).toBe("obrigacoes");
    expect(fonteDoTipo("guia")).toBe("guias");
  });

  it("férias que começaram e inscrição encerrada não são atraso", () => {
    expect(tipoAtrasa("ferias")).toBe(false);
    expect(tipoAtrasa("vaga")).toBe(false);
    expect(tipoAtrasa("obrigacao")).toBe(true);
    expect(tipoAtrasa("guia")).toBe(true);
    expect(tipoAtrasa("tarefa")).toBe(true);
  });
});

describe("fontes escondidas gravadas", () => {
  it("sem escolha (nulo, vazio ou JSON quebrado) é nulo — vale o padrão de cima", () => {
    expect(lerFontesOcultas(null)).toBeNull();
    expect(lerFontesOcultas("")).toBeNull();
    expect(lerFontesOcultas("{{")).toBeNull();
    expect(lerFontesOcultas('{"a":1}')).toBeNull();
  });

  it("lista vazia é escolha: nenhuma escondida", () => {
    expect(lerFontesOcultas("[]")).toEqual([]);
  });

  it("descarta chave desconhecida e repetida, na ordem do catálogo", () => {
    expect(lerFontesOcultas('["dp","fantasma","obrigacoes","dp"]')).toEqual(["obrigacoes", "dp"]);
    expect(gravarFontesOcultas(["dp", "fantasma", "guias", "guias"])).toBe('["guias","dp"]');
  });
});
