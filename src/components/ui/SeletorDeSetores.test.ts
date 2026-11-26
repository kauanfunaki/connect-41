import { describe, expect, it } from "vitest";
import { alternarSetor, marcarEmLote, setoresDaBusca, type OpcaoDeSetor } from "./SeletorDeSetores";

const opcoes: OpcaoDeSetor[] = [
  { value: "contabil", label: "Contábil" },
  { value: "fiscal", label: "Fiscal" },
  { value: "dp", label: "Departamento Pessoal" },
  { value: "societario", label: "Societário", disabled: true },
];

describe("setoresDaBusca", () => {
  it("acha pelo nome sem acento e sem caixa", () => {
    expect(setoresDaBusca(opcoes, "CONTA").map((o) => o.value)).toEqual(["contabil"]);
    expect(setoresDaBusca(opcoes, "societ").map((o) => o.value)).toEqual(["societario"]);
  });

  it("busca vazia (ou só espaço) devolve todos", () => {
    expect(setoresDaBusca(opcoes, "  ")).toHaveLength(4);
  });
});

describe("alternarSetor", () => {
  it("marca e desmarca na ordem das opções, não na do clique", () => {
    const um = alternarSetor([], opcoes, "dp", true);
    expect(alternarSetor(um, opcoes, "contabil", true)).toEqual(["contabil", "dp"]);
    expect(alternarSetor(["contabil", "dp"], opcoes, "contabil", false)).toEqual(["dp"]);
  });

  it("guarda no fim o código marcado que não está entre as opções (setor desativado)", () => {
    expect(alternarSetor(["antigo", "dp"], opcoes, "fiscal", true)).toEqual(["fiscal", "dp", "antigo"]);
  });
});

describe("marcarEmLote", () => {
  it("Todos marca os à vista, sem os desabilitados", () => {
    expect(marcarEmLote([], opcoes, opcoes, true)).toEqual(["contabil", "fiscal", "dp"]);
  });

  it("com busca, mexe só nos setores da busca", () => {
    const daBusca = setoresDaBusca(opcoes, "fiscal");
    expect(marcarEmLote(["dp"], opcoes, daBusca, true)).toEqual(["fiscal", "dp"]);
    expect(marcarEmLote(["fiscal", "dp"], opcoes, daBusca, false)).toEqual(["dp"]);
  });

  it("Nenhum não tira o desabilitado que já estava marcado", () => {
    expect(marcarEmLote(["societario", "dp"], opcoes, opcoes, false)).toEqual(["societario"]);
  });
});
