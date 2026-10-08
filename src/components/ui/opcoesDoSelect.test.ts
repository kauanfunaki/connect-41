import { createElement as h, Fragment } from "react";
import { describe, expect, it } from "vitest";
import {
  agruparEmSecoes,
  ehTeclaDeTexto,
  escolherNoSelect,
  filtrarOpcoes,
  indicePorDigitacao,
  lerOpcoes,
  moverAtiva,
  naLista,
  opcaoMostrada,
  paraTexto,
  vigiarValor,
  type OpcaoDoSelect,
} from "./opcoesDoSelect";

function op(valor: string, rotulo = valor, extra: Partial<OpcaoDoSelect> = {}): OpcaoDoSelect {
  return { valor, rotulo, desabilitada: false, oculta: false, grupo: null, indice: 0, ...extra };
}

describe("lerOpcoes", () => {
  it("lê option solto, de map, de fragmento e de optgroup, na ordem do select", () => {
    const opcoes = lerOpcoes([
      h("option", { key: "v", value: "" }, "Sem centro de custo"),
      false,
      null,
      [h("option", { key: "a", value: "a" }, "Alfa"), h("option", { key: "b", value: "b" }, "Beta")],
      h(Fragment, { key: "f" }, h("option", { value: "c" }, "Gama")),
      h("optgroup", { key: "g", label: "Empresa X" }, h("option", { value: "d" }, "Delta")),
    ]);
    expect(opcoes.map((o) => [o.valor, o.rotulo, o.grupo, o.indice])).toEqual([
      ["", "Sem centro de custo", null, 0],
      ["a", "Alfa", null, 1],
      ["b", "Beta", null, 2],
      ["c", "Gama", null, 3],
      ["d", "Delta", "Empresa X", 4],
    ]);
  });

  it("segue as regras do HTML: sem value vale o texto, label vence o texto, grupo desabilitado desabilita", () => {
    const opcoes = lerOpcoes([
      h("option", { key: 1 }, "  Simples   Nacional "),
      h("option", { key: 2, value: 7, label: "Sete" }, "7"),
      h("optgroup", { key: 3, label: "Velhos", disabled: true }, h("option", { value: "x" }, "X")),
      h("option", { key: 4, value: "", disabled: true, hidden: true }, "Selecione…"),
    ]);
    expect(opcoes[0]).toMatchObject({ valor: "Simples Nacional", rotulo: "Simples Nacional" });
    expect(opcoes[1]).toMatchObject({ valor: "7", rotulo: "Sete" });
    expect(opcoes[2]).toMatchObject({ valor: "x", desabilitada: true, grupo: "Velhos" });
    expect(opcoes[3]).toMatchObject({ desabilitada: true, oculta: true });
  });

  it("junta o texto partido em pedaços, como o `{nome}{inativo ? ' (inativo)' : ''}`", () => {
    const [o] = lerOpcoes(h("option", { value: "1" }, "Comercial", "", " (inativo)"));
    expect(o!.rotulo).toBe("Comercial (inativo)");
  });

  it("sem filhos não tem opção", () => {
    expect(lerOpcoes(undefined)).toEqual([]);
  });
});

describe("paraTexto", () => {
  it("compara como o select: texto; null/undefined é sem valor", () => {
    expect(paraTexto(3)).toBe("3");
    expect(paraTexto("")).toBe("");
    expect(paraTexto(undefined)).toBeUndefined();
    expect(paraTexto(null)).toBeUndefined();
    expect(paraTexto(["a", "b"])).toBe("a");
  });
});

describe("opcaoMostrada", () => {
  const opcoes = [op("", "Selecione…", { desabilitada: true }), op("PJ", "Pessoa jurídica", { indice: 1 }), op("PF", "Pessoa física", { indice: 2 })];

  it("mostra a do valor, mesmo o placeholder desabilitado", () => {
    expect(opcaoMostrada(opcoes, "PF")?.rotulo).toBe("Pessoa física");
    expect(opcaoMostrada(opcoes, "")?.rotulo).toBe("Selecione…");
  });

  it("sem valor, ou com um que não existe, cai na primeira habilitada — o que o navegador faz", () => {
    expect(opcaoMostrada(opcoes, undefined)?.valor).toBe("PJ");
    expect(opcaoMostrada(opcoes, "XX")?.valor).toBe("PJ");
  });

  it("todas desabilitadas e nenhuma com o valor: nada", () => {
    expect(opcaoMostrada([op("a", "A", { desabilitada: true })], undefined)).toBeNull();
  });
});

describe("naLista", () => {
  it("tira da lista o placeholder desabilitado e a oculta, e deixa o vazio que se escolhe", () => {
    expect(naLista(op("", "Selecione…", { desabilitada: true }))).toBe(false);
    expect(naLista(op("x", "X", { oculta: true }))).toBe(false);
    expect(naLista(op("", "Sem responsável"))).toBe(true);
    expect(naLista(op("x", "X", { desabilitada: true }))).toBe(true);
  });
});

describe("filtrarOpcoes", () => {
  const ufs = [op("SP", "São Paulo"), op("PR", "Paraná"), op("SC", "Santa Catarina"), op("x", "Centro A", { grupo: "Padaria Pão" })];

  it("busca sem acento e sem caixa", () => {
    expect(filtrarOpcoes(ufs, "sao").map((o) => o.valor)).toEqual(["SP"]);
    expect(filtrarOpcoes(ufs, "PARANA").map((o) => o.valor)).toEqual(["PR"]);
  });

  it("acha pelo nome do grupo", () => {
    expect(filtrarOpcoes(ufs, "pao").map((o) => o.valor)).toEqual(["x"]);
  });

  it("busca vazia devolve tudo", () => {
    expect(filtrarOpcoes(ufs, "  ")).toHaveLength(4);
  });
});

describe("agruparEmSecoes", () => {
  it("junta as seguidas do mesmo grupo e guarda a posição na lista", () => {
    const secoes = agruparEmSecoes([op("", "Sem"), op("a", "A", { grupo: "X" }), op("b", "B", { grupo: "X" }), op("c", "C", { grupo: "Y" })]);
    expect(secoes.map((s) => [s.grupo, s.itens.map((i) => i.posicao)])).toEqual([
      [null, [0]],
      ["X", [1, 2]],
      ["Y", [3]],
    ]);
  });
});

describe("moverAtiva", () => {
  const lista = [op("a"), op("b", "b", { desabilitada: true }), op("c"), op("d"), op("e", "e", { desabilitada: true })];

  it("pula as desabilitadas", () => {
    expect(moverAtiva(lista, 0, 1)).toBe(2);
    expect(moverAtiva(lista, 2, -1)).toBe(0);
  });

  it("para na ponta, sem dar a volta", () => {
    expect(moverAtiva(lista, 3, 1)).toBe(3);
    expect(moverAtiva(lista, 0, -1)).toBe(0);
  });

  it("de fora (-1): Home é a primeira habilitada, End a última", () => {
    expect(moverAtiva(lista, -1, 1)).toBe(0);
    expect(moverAtiva(lista, -1, -1)).toBe(3);
  });

  it("PageDown passa da ponta e volta para a última habilitada", () => {
    expect(moverAtiva(lista, 0, 10)).toBe(3);
    expect(moverAtiva(lista, 3, -10)).toBe(0);
  });

  it("sem nenhuma habilitada, fica onde está", () => {
    expect(moverAtiva([op("a", "a", { desabilitada: true })], -1, 1)).toBe(-1);
    expect(moverAtiva([], 0, 1)).toBe(-1);
  });
});

describe("indicePorDigitacao", () => {
  const lista = [op("1", "Santa Catarina"), op("2", "São Paulo"), op("3", "Sergipe"), op("4", "Paraná"), op("5", "Sul", { desabilitada: true })];

  it("uma letra anda entre as que começam com ela, a partir da seguinte, e dá a volta", () => {
    expect(indicePorDigitacao(lista, -1, "s")).toBe(0);
    expect(indicePorDigitacao(lista, 0, "s")).toBe(1);
    expect(indicePorDigitacao(lista, 2, "s")).toBe(0);
  });

  it("a mesma letra repetida também anda", () => {
    expect(indicePorDigitacao(lista, 0, "ss")).toBe(1);
  });

  it("mais letras procuram o começo, sem acento, a partir da atual", () => {
    expect(indicePorDigitacao(lista, 0, "sao")).toBe(1);
    expect(indicePorDigitacao(lista, 1, "são p")).toBe(1);
    expect(indicePorDigitacao(lista, 0, "PAR")).toBe(3);
  });

  it("pula a desabilitada e devolve -1 sem nenhuma", () => {
    expect(indicePorDigitacao(lista, 3, "su")).toBe(-1);
    expect(indicePorDigitacao(lista, 0, "x")).toBe(-1);
    expect(indicePorDigitacao(lista, 0, " ")).toBe(-1);
  });
});

describe("ehTeclaDeTexto", () => {
  const tecla = (key: string, mod: Partial<{ ctrlKey: boolean; metaKey: boolean; altKey: boolean }> = {}) => ({
    key,
    ctrlKey: false,
    metaKey: false,
    altKey: false,
    ...mod,
  });

  it("letra e número sim; atalho e tecla de controle não", () => {
    expect(ehTeclaDeTexto(tecla("a"))).toBe(true);
    expect(ehTeclaDeTexto(tecla("7"))).toBe(true);
    expect(ehTeclaDeTexto(tecla("a", { ctrlKey: true }))).toBe(false);
    expect(ehTeclaDeTexto(tecla("ArrowDown"))).toBe(false);
    expect(ehTeclaDeTexto(tecla("Tab"))).toBe(false);
  });
});

// Um `<select>` de mentira: EventTarget com o `value` no protótipo, como o
// `HTMLSelectElement` tem. Uma classe por teste: o `vigiarValor` embrulha o
// protótipo.
function classeDeSelect() {
  return class extends EventTarget {
    #valor = "";
    get value() {
      return this.#valor;
    }
    set value(v: string) {
      this.#valor = String(v);
    }
  };
}

describe("escolherNoSelect", () => {
  it("troca pelo setter do protótipo e dispara input e change que borbulham, já com o valor novo", () => {
    const select = new (classeDeSelect())();
    const vistos: [string, boolean, string][] = [];
    for (const tipo of ["input", "change"]) {
      select.addEventListener(tipo, (e) => vistos.push([e.type, e.bubbles, select.value]));
    }
    escolherNoSelect(select, "PF");
    expect(vistos).toEqual([
      ["input", true, "PF"],
      ["change", true, "PF"],
    ]);
  });
});

describe("vigiarValor", () => {
  it("avisa quando o código escreve no value, só a quem se inscreveu, até desfazer", () => {
    const Classe = classeDeSelect();
    const vigiado = new Classe();
    const outro = new Classe();
    let avisos = 0;
    const desfazer = vigiarValor(vigiado, () => avisos++);
    vigiado.value = "SP";
    outro.value = "RJ";
    expect(avisos).toBe(1);
    expect(vigiado.value).toBe("SP");
    expect(outro.value).toBe("RJ");
    desfazer();
    vigiado.value = "PR";
    expect(avisos).toBe(1);
    expect(vigiado.value).toBe("PR");
    // Nada fica na instância: o embrulho é no protótipo.
    expect(Object.getOwnPropertyDescriptor(vigiado, "value")).toBeUndefined();
  });

  it("embrulha o protótipo uma vez só, e o escolherNoSelect também avisa", () => {
    const Classe = classeDeSelect();
    const a = new Classe();
    const b = new Classe();
    let avisosA = 0;
    let avisosB = 0;
    vigiarValor(a, () => avisosA++);
    const setter = Object.getOwnPropertyDescriptor(Classe.prototype, "value")!.set;
    vigiarValor(b, () => avisosB++);
    expect(Object.getOwnPropertyDescriptor(Classe.prototype, "value")!.set).toBe(setter);
    escolherNoSelect(b, "SC");
    expect([avisosA, avisosB]).toEqual([0, 1]);
  });

  it("sem acessor no protótipo, não faz nada", () => {
    const desfazer = vigiarValor({ value: "x" }, () => {});
    expect(() => desfazer()).not.toThrow();
  });
});
