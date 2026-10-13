import { describe, expect, it } from "vitest";
import { SEM_CATEGORIA, type ValorDaCategoria } from "./calculo";
import { DESCONSIDERAR } from "./estrutura";
import type { CategoriaResolvida } from "./mapeamento";
import { desconsideradasDoPeriodo, excecoesDaEmpresa, itensDaFila, totalForaDasLinhas } from "./fila";

const v = (categoria: string, centavos: number, origem: "recebimento" | "pagamento" = "pagamento"): ValorDaCategoria => ({
  categoria,
  centavos,
  origem,
});
const cat = (id: string, nome: string, grupo: string | null = null, origem: CategoriaResolvida["origem"] = null): CategoriaResolvida => ({
  id,
  nome,
  grupo,
  origem,
});

const DO_ARQUIVO = { temImport: true, doSemCategoria: ["import" as const] };
const DO_FINANCEIRO = { temImport: false, doSemCategoria: ["financeiro" as const] };

describe("itensDaFila", () => {
  // O caso do print do Kauan (13/10/2026): a categoria existe no plano, sem
  // grupo, e a linha do arquivo escreve o nome com outro espaço e outra caixa.
  // O cálculo já casava pela chave e mandava a linha para a fila; a tela
  // procurava pelo nome exato e mostrava "classifique na ficha dele".
  it("acha a categoria pela chave do de-para — caixa, acento e espaço não separam", () => {
    const r = itensDaFila(
      [v("Compra de Matéria Prima -  Cantoneira", -500)],
      [cat("c1", "Compra de Materia Prima - cantoneira")],
      DO_ARQUIVO
    );
    expect(r[0]!.acao).toEqual({ tipo: "classificar", categoryId: "c1" });
  });

  it("nome do arquivo que o plano não tem: classificar cria a categoria", () => {
    const r = itensDaFila([v("Compra de Moldes", -300)], [cat("c1", "Frete")], DO_ARQUIVO);
    expect(r[0]!.acao).toEqual({ tipo: "criar" });
  });

  it("lançamento sem categoria leva a fonte, para a tela dizer onde corrigir", () => {
    expect(itensDaFila([v(SEM_CATEGORIA, -10)], [], DO_ARQUIVO)[0]!.acao).toEqual({ tipo: "sem-categoria", fontes: ["import"] });
    expect(itensDaFila([v(SEM_CATEGORIA, -10)], [], DO_FINANCEIRO)[0]!.acao).toEqual({ tipo: "sem-categoria", fontes: ["financeiro"] });
  });

  // No financeiro o nome sai da própria categoria; sem arquivo no período não
  // há de onde criar uma — e oferecer "criar" levaria a um erro.
  it("sem import no período, nome sem categoria não oferece criar", () => {
    const r = itensDaFila([v("Fantasma", -1)], [], DO_FINANCEIRO);
    expect(r[0]!.acao.tipo).toBe("sem-categoria");
  });

  it("no ano, o sem categoria leva as fontes dos meses em que apareceu", () => {
    const r = itensDaFila([v(SEM_CATEGORIA, -1)], [], { temImport: true, doSemCategoria: ["import", "financeiro"] });
    expect(r[0]!.acao).toEqual({ tipo: "sem-categoria", fontes: ["import", "financeiro"] });
  });

  it("do maior para o menor valor, recebido ou pago", () => {
    const r = itensDaFila([v("A", -100), v("B", 900, "recebimento"), v("C", -500)], [], DO_ARQUIVO);
    expect(r.map((i) => i.categoria)).toEqual(["B", "C", "A"]);
  });

  // Com o mesmo nome no padrão e na empresa, a da empresa — como no de-para,
  // que recebe a lista por `padraoAntesDaEmpresa`.
  it("com duas categorias na mesma chave, a última (a da empresa)", () => {
    const r = itensDaFila([v("Salários", -1)], [cat("padrao", "Salários"), cat("empresa", "salarios")], DO_ARQUIVO);
    expect(r[0]!.acao).toEqual({ tipo: "classificar", categoryId: "empresa" });
  });
});

describe("totalForaDasLinhas", () => {
  it("soma os valores absolutos — recebido e pago não se anulam no que falta", () => {
    expect(totalForaDasLinhas([v("A", -300), v("B", 100, "recebimento")])).toBe(400);
    expect(totalForaDasLinhas([])).toBe(0);
  });
});

describe("desconsideradasDoPeriodo", () => {
  const categorias = [
    cat("e1", "Compra de Moldes", DESCONSIDERAR, "excecao"),
    cat("p1", "Doação", DESCONSIDERAR, "padrao"),
    cat("e2", "Reembolso de sócio", DESCONSIDERAR, "excecao"),
    cat("x", "Frete", "cmv", "padrao"),
  ];

  it("as com valor no período, na ordem do cálculo, com o que dá para desfazer aqui", () => {
    const r = desconsideradasDoPeriodo([v("compra de  moldes", -300), v("Doação", -50)], categorias);
    expect(r.slice(0, 2)).toEqual([
      { nome: "compra de  moldes", centavos: -300, origem: "pagamento", categoryId: "e1", excecao: true },
      { nome: "Doação", centavos: -50, origem: "pagamento", categoryId: "p1", excecao: false },
    ]);
  });

  // Senão a decisão da empresa sumiria da tela no mês em que a categoria não
  // andou, e não teria onde voltar ao padrão.
  it("e as exceções da empresa sem valor no período, no fim", () => {
    const r = desconsideradasDoPeriodo([v("Compra de Moldes", -300)], categorias);
    expect(r.map((d) => [d.nome, d.centavos])).toEqual([
      ["Compra de Moldes", -300],
      ["Reembolso de sócio", null],
    ]);
  });
});

describe("excecoesDaEmpresa", () => {
  it("só as exceções que não são desconsiderar — essas têm o resumo próprio", () => {
    const r = excecoesDaEmpresa([
      cat("a", "Aluguel", "comerciais", "excecao"),
      cat("b", "Moldes", DESCONSIDERAR, "excecao"),
      cat("c", "Frete", "cmv", "padrao"),
    ]);
    expect(r).toEqual([{ categoryId: "a", nome: "Aluguel", grupo: "comerciais" }]);
  });
});
