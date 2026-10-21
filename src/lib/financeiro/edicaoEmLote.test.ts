import { describe, expect, it } from "vitest";
import { travasDaEdicao, type ContaParaEditar } from "./edicao";
import {
  campoDoLote,
  categoriasEmComum,
  idsMarcados,
  motivosAgrupados,
  porQueFica,
  separarAlteracao,
  valeNaEmpresa,
  type ContaDaAlteracao,
} from "./edicaoEmLote";

const ABERTA: ContaParaEditar = {
  status: "CONFERIDO",
  paidAt: null,
  closeReason: null,
  fiscalDocumentId: null,
  agreementId: null,
  doOmie: false,
  conciliada: false,
};

/** A conta como o servidor monta: o veredito de `travasDaEdicao` sobre o estado dela. */
function conta(id: string, estado: Partial<ContaParaEditar> = {}, extra: Partial<ContaDaAlteracao> = {}): ContaDaAlteracao {
  const v = travasDaEdicao({ ...ABERTA, ...estado });
  return {
    id,
    kind: "PAGAR",
    empresaId: "e1",
    contraparteNome: `Fornecedor ${id}`,
    encerrada: v.pode ? null : v.motivo,
    travas: v.pode ? v.travas : {},
    ...extra,
  };
}

describe("porQueFica", () => {
  it("conta em aberto: tudo entra", () => {
    expect(porQueFica(conta("1"), { campos: ["vencimento", "competencia", "categoria", "centro", "projeto"], categoriaId: "c" })).toBeNull();
  });

  it("paga: a categoria muda, o vencimento não — com o caminho da janela de uma conta", () => {
    const paga = conta("1", { status: "PAGO", paidAt: new Date() });
    expect(porQueFica(paga, { campos: ["categoria"], categoriaId: "c" })).toBeNull();
    expect(porQueFica(paga, { campos: ["categoria", "vencimento"], categoriaId: "c" })).toMatch(/desfaça o pagamento/);
  });

  it("do Omie: categoria, competência, vencimento, previsão e conta corrente travados; centro e projeto livres", () => {
    const omie = conta("1", { doOmie: true });
    for (const campo of ["categoria", "competencia", "vencimento", "previsao", "conta"] as const) {
      expect(porQueFica(omie, { campos: [campo], categoriaId: "c", contaDaEmpresa: "e1" })).toMatch(/Omie/);
    }
    expect(porQueFica(omie, { campos: ["centro", "projeto"] })).toBeNull();
  });

  it("do Omie com um departamento só: o centro fica de fora com o motivo, e o projeto muda (20/10)", () => {
    const comDepartamento = conta("1", { doOmie: true, centroDoOmie: true });
    expect(porQueFica(comDepartamento, { campos: ["centro"], centroDaEmpresa: "e1" })).toMatch(/departamento do título no Omie/);
    expect(porQueFica(comDepartamento, { campos: ["projeto"], projetoDaEmpresa: "e1" })).toBeNull();
  });

  it("do Omie: a conta prevista e a previsão de um lote misto mudam só nas que não vêm de lá (20/10)", () => {
    const contas = [conta("1"), conta("2", { doOmie: true }), conta("3", { doOmie: true, status: "PAGO", paidAt: new Date() })];
    for (const campos of [["conta"], ["previsao"]] as const) {
      const { entram, ficam } = separarAlteracao(contas, { campos: [...campos], contaDaEmpresa: "e1" });
      expect(entram.map((c) => c.id)).toEqual(["1"]);
      expect(ficam.map((f) => f.motivo)).toEqual([expect.stringMatching(/Vem do Omie/), expect.stringMatching(/Vem do Omie/)]);
    }
  });

  it("encerrada fica de fora, menos quando só muda o centro", () => {
    const renegociada = conta("1", { status: "CANCELADO", closeReason: "RENEGOCIADO" });
    expect(porQueFica(renegociada, { campos: ["projeto"] })).toMatch(/renegociada/);
    expect(porQueFica(renegociada, { campos: ["centro", "projeto"] })).toMatch(/renegociada/);
    expect(porQueFica(renegociada, { campos: ["centro"], centroDaEmpresa: "e1" })).toBeNull();
  });

  it("tirar a categoria: só na conta a receber", () => {
    expect(porQueFica(conta("1"), { campos: ["categoria"], categoriaId: null })).toMatch(/precisa de categoria/);
    expect(porQueFica(conta("1", {}, { kind: "RECEBER" }), { campos: ["categoria"], categoriaId: null })).toBeNull();
  });

  it("categoria, centro e projeto de outra empresa ficam de fora; tirar vale em qualquer empresa", () => {
    const daE2 = conta("1", {}, { empresaId: "e2" });
    expect(porQueFica(daE2, { campos: ["categoria"], categoriaId: "c", categoriaValeEm: new Set(["e1"]) })).toMatch(/plano de contas/);
    expect(porQueFica(daE2, { campos: ["centro"], centroDaEmpresa: "e1" })).toMatch(/centro de custo escolhido é de outra/);
    expect(porQueFica(daE2, { campos: ["projeto"], projetoDaEmpresa: "e1" })).toMatch(/projeto escolhido é de outra/);
    expect(porQueFica(daE2, { campos: ["conta"], contaDaEmpresa: "e1" })).toMatch(/conta corrente escolhida é de outra/);
    expect(porQueFica(daE2, { campos: ["centro", "projeto", "conta"], centroDaEmpresa: null, projetoDaEmpresa: null, contaDaEmpresa: null })).toBeNull();
  });

  it("conta rateada: categoria, centro e projeto ficam nas linhas; o resto muda", () => {
    const rateada = conta("1", {}, { rateada: true });
    for (const campo of ["categoria", "centro", "projeto"] as const) {
      expect(porQueFica(rateada, { campos: [campo], categoriaId: "c", centroDaEmpresa: "e1", projetoDaEmpresa: "e1" })).toMatch(/Tem rateio/);
    }
    expect(porQueFica(rateada, { campos: ["vencimento", "competencia", "conta"], contaDaEmpresa: "e1" })).toBeNull();
  });

  it("previsão: só de conta em aberto", () => {
    const paga = conta("1", { status: "PAGO", paidAt: new Date() });
    expect(porQueFica(paga, { campos: ["previsao"] })).toBe("Paga — a previsão é só de conta em aberto.");
    expect(porQueFica(conta("2", { conciliada: true }), { campos: ["previsao"] })).toBeNull();
  });

  it("a conta corrente prevista muda até em conta paga — é sugestão para a baixa", () => {
    expect(porQueFica(conta("1", { status: "PAGO", paidAt: new Date() }), { campos: ["conta"], contaDaEmpresa: "e1" })).toBeNull();
    expect(porQueFica(conta("1", { status: "CANCELADO", closeReason: "PERDA" }), { campos: ["conta"], contaDaEmpresa: "e1" })).toMatch(/perda/);
  });
});

describe("separarAlteracao e motivosAgrupados", () => {
  it("separa e agrupa do motivo mais comum ao menos", () => {
    const contas = [
      conta("1"),
      conta("2", { status: "PAGO", paidAt: new Date() }),
      conta("3", { status: "PAGO", paidAt: new Date() }),
      conta("4", { conciliada: true }),
    ];
    const { entram, ficam } = separarAlteracao(contas, { campos: ["vencimento"] });
    expect(entram.map((c) => c.id)).toEqual(["1"]);
    expect(ficam).toHaveLength(3);
    const grupos = motivosAgrupados(ficam);
    expect(grupos[0]!.nomes).toEqual(["Fornecedor 2", "Fornecedor 3"]);
    expect(grupos[1]!.motivo).toMatch(/Conciliada/);
  });
});

describe("idsMarcados e campoDoLote", () => {
  it("tira repetidos e vazios, e respeita o teto", () => {
    expect(idsMarcados(["a", "a", "", "b"])).toEqual(["a", "b"]);
    expect(idsMarcados([])).toEqual({ erro: "Marque ao menos uma conta." });
    expect(idsMarcados(Array.from({ length: 201 }, (_, i) => `id${i}`))).toEqual({ erro: "No máximo 200 contas por vez." });
  });

  it("só os campos do lote — valor e fornecedor ficam na janela de uma conta", () => {
    expect(campoDoLote("vencimento")).toBe(true);
    expect(campoDoLote("conta")).toBe(true);
    expect(campoDoLote("valor")).toBe(false);
    expect(campoDoLote("contraparte")).toBe(false);
  });
});

describe("categorias", () => {
  const padrao = { id: "p", nome: "Aluguel", empresaId: null, ocultaEm: [] as string[] };
  const escondida = { id: "x", nome: "Fretes", empresaId: null, ocultaEm: ["e2"] };
  const daE1 = { id: "q", nome: "Salários (E1)", empresaId: "e1", ocultaEm: [] as string[] };

  it("vale na empresa: a do escritório se não escondida; a própria", () => {
    expect(valeNaEmpresa(padrao, "e2")).toBe(true);
    expect(valeNaEmpresa(escondida, "e2")).toBe(false);
    expect(valeNaEmpresa(daE1, "e1")).toBe(true);
    expect(valeNaEmpresa(daE1, "e2")).toBe(false);
  });

  it("em comum: uma empresa vê o plano dela inteiro; várias, só o que vale em todas", () => {
    expect(categoriasEmComum([padrao, escondida, daE1], ["e1"]).map((c) => c.id)).toEqual(["p", "x", "q"]);
    expect(categoriasEmComum([padrao, escondida, daE1], ["e1", "e2"]).map((c) => c.id)).toEqual(["p"]);
  });
});
