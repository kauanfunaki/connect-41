import { describe, expect, it } from "vitest";
import {
  celulaDeTexto,
  celulaParaTexto,
  contasDaCelula,
  dataDeCaixa,
  diasSemBanco,
  montarPrevisto,
  periodosDoPrevisto,
  proximoDiaUtil,
  type Classificacao,
  type RegrasDaData,
  type TituloDoPrevisto,
} from "./projecao";

// 25/11/2026 é uma quarta-feira.
const HOJE = "2026-11-25";
const semBanco = diasSemBanco(HOJE);
const regras = (diasReceber = 0, diasPagar = 0): RegrasDaData => ({ diasReceber, diasPagar, semBanco });

let seq = 0;
function conta(kind: "PAGAR" | "RECEBER", reais: number, venc: string, extra: Partial<TituloDoPrevisto> = {}): TituloDoPrevisto {
  return {
    id: `t${++seq}`,
    kind,
    centavos: reais * 100,
    vencimentoKey: venc,
    previsaoKey: null,
    categoryId: null,
    contraparte: "Contraparte",
    descricao: null,
    ...extra,
  };
}

/** Classifica pelo categoryId de teste: "linha/item". */
const classificar = (t: TituloDoPrevisto): Classificacao => {
  const [linha, item] = (t.categoryId ?? (t.kind === "RECEBER" ? "recebimentos/Vendas" : "outras_saidas/Diversos")).split("/");
  return { linha: linha!, item: item! };
};

describe("data de caixa", () => {
  it("passa fim de semana e feriado para o próximo dia útil", () => {
    expect(proximoDiaUtil("2026-11-28", semBanco)).toBe("2026-11-30"); // sábado → segunda
    expect(proximoDiaUtil("2026-12-25", semBanco)).toBe("2026-12-28"); // Natal (sexta) → segunda
    expect(proximoDiaUtil("2026-11-26", semBanco)).toBe("2026-11-26");
  });

  it("a segunda e a terça de Carnaval não têm banco", () => {
    // Carnaval de 2027: 08 e 09/02.
    expect(proximoDiaUtil("2027-02-08", semBanco)).toBe("2027-02-10");
  });

  it("soma os dias da empresa antes do dia útil, cada lado com os seus", () => {
    // Vence na sexta 27/11: +1 dia cai no sábado → segunda 30/11.
    expect(dataDeCaixa(conta("RECEBER", 10, "2026-11-27"), regras(1, 0))).toBe("2026-11-30");
    expect(dataDeCaixa(conta("PAGAR", 10, "2026-11-27"), regras(1, 0))).toBe("2026-11-27");
  });

  it("usa a previsão quando a conta tem uma", () => {
    expect(dataDeCaixa(conta("PAGAR", 10, "2026-11-26", { previsaoKey: "2026-12-02" }), regras())).toBe("2026-12-02");
  });
});

describe("períodos", () => {
  it("semanas de sete dias a partir de hoje, como a planilha de 13 semanas", () => {
    const p = periodosDoPrevisto(HOJE, "semanas");
    expect(p).toHaveLength(13);
    expect(p[0]).toEqual({ chave: "2026-11-25", rotulo: "25/11 a 01/12", inicioKey: "2026-11-25", fimKey: "2026-12-01" });
    expect(p[12]!.fimKey).toBe("2027-02-23");
  });

  it("meses do calendário, o primeiro de hoje ao fim do mês", () => {
    const p = periodosDoPrevisto(HOJE, "meses");
    expect(p).toHaveLength(12);
    expect(p[0]).toMatchObject({ rotulo: "nov/26 (de 25)", inicioKey: "2026-11-25", fimKey: "2026-11-30" });
    expect(p[1]).toMatchObject({ rotulo: "dez/26", inicioKey: "2026-12-01", fimKey: "2026-12-31" });
    expect(p[11]).toMatchObject({ rotulo: "out/27", fimKey: "2027-10-31" });
  });

  it("dias com o dia da semana", () => {
    const p = periodosDoPrevisto(HOJE, "dias");
    expect(p).toHaveLength(31);
    expect(p[0]!.rotulo).toBe("qua 25/11");
  });
});

describe("montarPrevisto", () => {
  it("soma por linha e item, com o sinal do lado, e encadeia o saldo a partir do das contas", () => {
    const titulos = [
      conta("RECEBER", 1000, "2026-11-26", { categoryId: "recebimentos/Vendas" }),
      conta("PAGAR", 300, "2026-11-27", { categoryId: "pessoal/Folha" }),
      conta("PAGAR", 200, "2026-12-03", { categoryId: "pessoal/Folha" }),
      conta("PAGAR", 50, "2026-12-03", { categoryId: "juros/Banco" }),
    ];
    const p = montarPrevisto({ titulos, classificar, regras: regras(), hojeKey: HOJE, granularidade: "semanas", saldoInicial: 100_00 });
    const op = p.grupos.find((g) => g.code === "operacional")!;
    expect(op.linhas.map((l) => [l.code, l.valores.slice(0, 2)])).toEqual([
      ["recebimentos", [1000_00, 0]],
      ["pessoal", [-300_00, -200_00]],
    ]);
    expect(op.linhas[1]!.itens).toEqual([{ nome: "Folha", valores: expect.arrayContaining([-300_00, -200_00]) }]);
    expect(p.grupos.find((g) => g.code === "financiamento")!.valores.slice(0, 2)).toEqual([0, -50_00]);
    expect(p.variacao.slice(0, 2)).toEqual([700_00, -250_00]);
    expect(p.saldoInicial.slice(0, 2)).toEqual([100_00, 800_00]);
    expect(p.saldoFinal.slice(0, 2)).toEqual([800_00, 550_00]);
    expect(p.comSaldo).toBe(true);
  });

  it("deixa o atrasado, o fora do fluxo e o depois do horizonte à parte", () => {
    const titulos = [
      conta("RECEBER", 500, "2026-11-20"),
      conta("PAGAR", 80, "2026-11-24"),
      conta("PAGAR", 1000, "2026-11-26", { categoryId: "fora/Transferência" }),
      conta("PAGAR", 70, "2027-06-01"),
      conta("PAGAR", 10, "2026-11-26"),
    ];
    const p = montarPrevisto({ titulos, classificar, regras: regras(), hojeKey: HOJE, granularidade: "semanas", saldoInicial: null });
    expect(p.atrasados).toEqual({ entradas: 500_00, saidas: 80_00, n: 2 });
    expect(p.foraDoFluxo).toEqual({ centavos: -1000_00, n: 1 });
    expect(p.depoisDoHorizonte).toBe(1);
    expect(p.variacao[0]).toBe(-10_00);
    expect(p.comSaldo).toBe(false);
  });

  it("acha o menor saldo do dia e os períodos com saldo negativo", () => {
    const titulos = [
      conta("PAGAR", 500, "2026-11-30"), // segunda: o saldo vai a −400
      conta("RECEBER", 1000, "2026-12-01"), // terça: volta a +600
    ];
    const p = montarPrevisto({ titulos, classificar, regras: regras(), hojeKey: HOJE, granularidade: "meses", saldoInicial: 100_00 });
    // No mês, novembro fecha em −400; a soma de dezembro esconde nada aqui, mas o dia mostra o aperto.
    expect(p.indicadores.menor).toEqual({ centavos: -400_00, dataKey: "2026-11-30" });
    expect(p.indicadores.periodosNegativos).toBe(1);
    expect(p.indicadores.primeiroNegativo?.chave).toBe("2026-11-25");
    const semanas = montarPrevisto({ titulos, classificar, regras: regras(), hojeKey: HOJE, granularidade: "semanas", saldoInicial: 100_00 });
    // Na semana de 25/11 a 01/12 o saldo final é positivo, mas passou por −400 no meio.
    expect(semanas.saldoFinal[0]).toBe(600_00);
    expect(semanas.indicadores.periodosNegativos).toBe(1);
  });

  it("a soma das contas da célula bate com a célula", () => {
    const titulos = [
      conta("PAGAR", 300, "2026-11-27", { categoryId: "pessoal/Folha" }),
      conta("PAGAR", 120, "2026-11-30", { categoryId: "pessoal/Encargos" }),
      conta("PAGAR", 50, "2026-11-30", { categoryId: "juros/Banco" }),
    ];
    const p = montarPrevisto({ titulos, classificar, regras: regras(), hojeKey: HOJE, granularidade: "semanas", saldoInicial: 0 });
    const linha = p.grupos[0]!.linhas.find((l) => l.code === "pessoal")!;
    const contas = contasDaCelula({ nivel: "linha", code: "pessoal", periodo: "2026-11-25" }, titulos, classificar, regras(), HOJE, "semanas");
    expect(contas.reduce((s, c) => s + c.centavos, 0)).toBe(linha.valores[0]);
    expect(contas.map((c) => c.item)).toEqual(["Folha", "Encargos"]);
    const doItem = contasDaCelula({ nivel: "item", code: "pessoal", item: "Encargos", periodo: "2026-11-25" }, titulos, classificar, regras(), HOJE, "semanas");
    expect(doItem.map((c) => c.centavos)).toEqual([-120_00]);
    const doGrupo = contasDaCelula({ nivel: "grupo", code: "financiamento", periodo: "2026-11-25" }, titulos, classificar, regras(), HOJE, "semanas");
    expect(doGrupo.map((c) => c.centavos)).toEqual([-50_00]);
  });
});

describe("celula no endereço", () => {
  it("vai e volta, com nome de item que tem dois-pontos e barra", () => {
    const c = { nivel: "item" as const, code: "pessoal", item: "Folha: 13º | férias", periodo: "2026-11-25" };
    expect(celulaDeTexto(celulaParaTexto(c))).toEqual(c);
    expect(celulaDeTexto("l:pessoal|2026-11-25")).toEqual({ nivel: "linha", code: "pessoal", periodo: "2026-11-25" });
    expect(celulaDeTexto("x|2026-11-25")).toBeNull();
    expect(celulaDeTexto("l:pessoal|ontem")).toBeNull();
  });
});
