import { describe, expect, it } from "vitest";
import { MODULE_CATALOG } from "@/lib/module-catalog";
import { lerOrdemDoMenu, montarMenuDoSetor, ordemEhPadrao, telasDoBloco, telasVisiveis } from "./menuDoSetor";
import { alternarOculta, moverNaLista, moverNoMenu, ordemDosBlocos } from "./organizarMenu";

// Organizar no próprio menu (09/11/2026): arrastar mexe numa lista só, e o
// olho tira a tela do menu (com as filhas dela) sem tirá-la do lugar.

const soc = MODULE_CATALOG.filter((m) => m.sectorCode === "societario").map((m) => ({ code: m.code, label: m.label, href: `/${m.code}` }));
const codigos = (blocos: ReturnType<typeof montarMenuDoSetor>) => blocos.flatMap(telasDoBloco).map((t) => t.code);

describe("mover numa lista", () => {
  it("antes de um item mais abaixo, mais acima, e no fim", () => {
    expect(moverNaLista(["a", "b", "c", "d"], 0, 3)).toEqual(["b", "c", "a", "d"]);
    expect(moverNaLista(["a", "b", "c", "d"], 3, 1)).toEqual(["a", "d", "b", "c"]);
    expect(moverNaLista(["a", "b", "c", "d"], 1, 4)).toEqual(["a", "c", "d", "b"]);
  });

  it("soltar no próprio lugar, ou fora da lista, não muda nada", () => {
    expect(moverNaLista(["a", "b", "c"], 1, 1)).toEqual(["a", "b", "c"]);
    expect(moverNaLista(["a", "b", "c"], 1, 2)).toEqual(["a", "b", "c"]);
    expect(moverNaLista(["a", "b", "c"], 0, -1)).toEqual(["a", "b", "c"]);
    expect(moverNaLista(["a", "b", "c"], 2, 99)).toEqual(["a", "b", "c"]);
  });
});

describe("mover no menu", () => {
  const blocos = montarMenuDoSetor(soc);

  it("os blocos trocam de lugar e a ordem gravada reproduz o menu", () => {
    const movidos = moverNoMenu(blocos, { tipo: "blocos" }, blocos.length - 1, 0);
    expect(movidos[0]!.grupo).toBe(blocos.at(-1)!.grupo);
    const ordem = ordemDosBlocos(movidos);
    expect(montarMenuDoSetor(soc, ordem).map((b) => b.grupo)).toEqual(movidos.map((b) => b.grupo));
    expect(codigos(montarMenuDoSetor(soc, ordem))).toEqual(codigos(movidos));
  });

  it("uma tela anda só dentro do grupo dela", () => {
    const grupo = blocos.find((b) => b.tipo === "grupo" && b.entradas.length > 1);
    if (!grupo || grupo.tipo !== "grupo") throw new Error("o Societário precisa de um grupo com duas telas");
    const ultima = grupo.entradas.at(-1)!.tela.code;
    const movidos = moverNoMenu(blocos, { tipo: "grupo", grupo: grupo.grupo }, grupo.entradas.length - 1, 0);
    const novo = movidos.find((b) => b.grupo === grupo.grupo)!;
    expect(novo.tipo === "grupo" && novo.entradas[0]!.tela.code).toBe(ultima);
    expect(movidos.map((b) => b.grupo)).toEqual(blocos.map((b) => b.grupo));
    expect(codigos(montarMenuDoSetor(soc, ordemDosBlocos(movidos)))).toEqual(codigos(movidos));
  });

  it("as telas escondidas vão na ordem gravada, e nada escondido não grava o campo", () => {
    expect(ordemDosBlocos(blocos, { ocultas: ["societario_robo"] }).ocultas).toEqual(["societario_robo"]);
    expect(ordemDosBlocos(blocos)).not.toHaveProperty("ocultas");
  });
});

describe("esconder do menu", () => {
  it("o olho alterna", () => {
    expect(alternarOculta([], "x")).toEqual(["x"]);
    expect(alternarOculta(["x", "y"], "x")).toEqual(["y"]);
  });

  // Desde 09/11/2026 o Societário não tem Tela 2 (Painel e Órgãos viraram telas
  // do grupo Operação): a mãe e as filhas são as do BPO, a DRE e as dela.
  it("a tela escondida e as filhas dela saem do menu; as outras ficam", () => {
    const bpo = MODULE_CATALOG.filter((m) => m.sectorCode === "bpo").map((m) => ({ code: m.code, label: m.label, href: `/${m.code}` }));
    const filha = MODULE_CATALOG.find((m) => m.sectorCode === "bpo" && m.telaMae);
    if (!filha?.telaMae) throw new Error("o BPO precisa de uma Tela 2");
    const visiveis = telasVisiveis(bpo, { grupos: [], telas: [], ocultas: [filha.telaMae] }).map((t) => t.code);
    expect(visiveis).not.toContain(filha.telaMae);
    expect(visiveis).not.toContain(filha.code);
    expect(visiveis.length).toBeGreaterThan(0);
    expect(telasVisiveis(soc, null)).toEqual(soc);
  });

  it("lê as escondidas gravadas, e só esconder já não é a ordem padrão", () => {
    expect(lerOrdemDoMenu('{"grupos":[],"telas":[],"ocultas":["a","a",1]}')).toEqual({ grupos: [], telas: [], ocultas: ["a"] });
    expect(ordemEhPadrao({ grupos: [], telas: [], ocultas: ["a"] })).toBe(false);
    expect(ordemEhPadrao({ grupos: [], telas: [] })).toBe(true);
  });
});

describe("o Geral e o que fica dentro de cada menu (09/11/2026)", () => {
  it("lê e grava só listas de texto, por menu", () => {
    expect(lerOrdemDoMenu('{"grupos":[],"telas":[],"geral":["agenda"],"dentro":{"tech_ops_center":["sub:Apps","sub:Robôs",3],"vazio":[],"ruim":"x"}}')).toEqual({
      grupos: [],
      telas: [],
      geral: ["agenda"],
      dentro: { tech_ops_center: ["sub:Apps", "sub:Robôs"] },
    });
    expect(ordemEhPadrao({ grupos: [], telas: [], dentro: { apoio: ["quadros"] } })).toBe(false);
    expect(ordemEhPadrao({ grupos: [], telas: [], geral: ["agenda"] })).toBe(false);
  });

  it("a ordem gravada leva o Geral e os menus com alguma ordem", () => {
    const ordem = ordemDosBlocos(montarMenuDoSetor(soc), { geral: ["agenda", "cadastros"], dentro: { apoio: ["quadros", "senhas"], vazio: [] } });
    expect(ordem.geral).toEqual(["agenda", "cadastros"]);
    expect(ordem.dentro).toEqual({ apoio: ["quadros", "senhas"] });
  });

  it("o olho no Geral e dentro dos menus vai para a ordem gravada, e a leitura volta igual", () => {
    const ordem = ordemDosBlocos(montarMenuDoSetor(soc), { ocultasGeral: ["agenda"], ocultasDentro: { tech_ops_center: ["sub:Sites"], vazio: [] } });
    expect(ordem.ocultasGeral).toEqual(["agenda"]);
    expect(ordem.ocultasDentro).toEqual({ tech_ops_center: ["sub:Sites"] });
    expect(lerOrdemDoMenu(JSON.stringify(ordem))).toEqual(ordem);
    expect(ordemEhPadrao({ grupos: [], telas: [], ocultasGeral: ["agenda"] })).toBe(false);
    expect(ordemEhPadrao({ grupos: [], telas: [], ocultasDentro: { apoio: ["senhas"] } })).toBe(false);
  });

  it("mover no Geral ou dentro de um menu não mexe nos blocos do setor", () => {
    const blocos = montarMenuDoSetor(soc);
    expect(moverNoMenu(blocos, { tipo: "geral" }, 0, 2)).toEqual(blocos);
    expect(moverNoMenu(blocos, { tipo: "dentro", mae: "apoio", chaves: ["a", "b"] }, 0, 2)).toEqual(blocos);
  });
});
