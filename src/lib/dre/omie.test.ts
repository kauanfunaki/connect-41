import { describe, it, expect } from "vitest";
import {
  lerExportDoOmie,
  centavosDaCelula,
  mesesDoExport,
  mesDaData,
  ExportIlegivel,
  type Celula,
} from "./omie";

/** O cabeçalho do export observado, nas posições em que ele aparece. */
function cabecalho(tipo: "pagamento" | "recebimento"): Celula[] {
  const c: Celula[] = new Array(33).fill("");
  c[0] = "Minha Empresa (Nome Fantasia)";
  c[3] = "Data de Crédito ou Débito (No Extrato)";
  c[5] = tipo === "pagamento" ? "Fornecedor" : "Cliente";
  c[8] = "Vencimento";
  c[11] = "Categoria";
  c[21] = "Valor da Conta";
  c[31] = tipo === "pagamento" ? "Valor Pago" : "Recebido";
  c[32] = tipo === "pagamento" ? "A Pagar" : "A Receber";
  return c;
}

function linha(data: Celula, categoria: Celula, valor: Celula): Celula[] {
  const l: Celula[] = new Array(33).fill(null);
  l[0] = "IRRIGA FOUR LTDA";
  l[3] = data;
  l[11] = categoria;
  l[31] = valor;
  return l;
}

const D = (iso: string) => new Date(`${iso}T12:00:00Z`);

describe("lerExportDoOmie", () => {
  it("lê o export de pagamentos", () => {
    const r = lerExportDoOmie([
      cabecalho("pagamento"),
      linha(D("2025-10-06"), "Pré-labore", -5425.48),
      linha(D("2025-10-15"), "Compra de consumiveis", -50),
    ]);
    expect(r.origem).toBe("pagamento");
    expect(r.linhas).toHaveLength(2);
    expect(r.linhas[0]).toMatchObject({ categoria: "Pré-labore", valorCentavos: -542548 });
    expect(r.linhas[1]!.valorCentavos).toBe(-5000);
  });

  it("lê o export de recebimentos e marca a origem", () => {
    const r = lerExportDoOmie([
      cabecalho("recebimento"),
      linha(D("2025-10-02"), "Clientes - Venda de sucata", 12588),
    ]);
    expect(r.origem).toBe("recebimento");
    expect(r.linhas[0]!.valorCentavos).toBe(1_258_800);
  });

  // Fixar a posição seria fixar uma observação: basta o Omie acrescentar uma
  // coluna para tudo deslocar, e o import passaria a somar a coluna errada sem
  // erro nenhum — a pior forma de quebrar.
  it("acha as colunas pelo nome, não pela posição", () => {
    const cab: Celula[] = ["Categoria", "Valor Pago", "Data de Crédito ou Débito (No Extrato)"];
    const r = lerExportDoOmie([cab, ["Aluguel", -100, D("2025-03-04")]]);
    expect(r.linhas[0]).toMatchObject({ categoria: "Aluguel", valorCentavos: -10_000 });
  });

  it("o cabeçalho é encontrado mesmo com linhas de título acima", () => {
    const r = lerExportDoOmie([
      ["Relatório de Contas a Pagar", null, null],
      ["Emitido em 01/11/2025", null, null],
      [],
      cabecalho("pagamento"),
      linha(D("2025-10-06"), "Aluguel", -2562.35),
    ]);
    expect(r.linhas).toHaveLength(1);
  });

  // Zero é movimento real — o arquivo de outubro tem duas devoluções de venda
  // com valor 0, com data e categoria. Pular o que é zero é o mesmo hábito que
  // faz o relatório perder o que não entendeu.
  it("valor zero entra, e não é ignorado", () => {
    const r = lerExportDoOmie([
      cabecalho("pagamento"),
      linha(D("2025-10-13"), "Devolução de Venda", 0),
    ]);
    expect(r.linhas).toHaveLength(1);
    expect(r.linhas[0]!.valorCentavos).toBe(0);
    expect(r.ignoradas).toHaveLength(0);
  });

  it("linha em branco é pulada em silêncio; sem valor ou sem data, com motivo", () => {
    const r = lerExportDoOmie([
      cabecalho("pagamento"),
      new Array(33).fill(null),
      linha(D("2025-10-06"), "Aluguel", null),
      linha(null, "Aluguel", -100),
      linha(D("2025-10-06"), "Aluguel", -100),
    ]);
    expect(r.linhas).toHaveLength(1);
    expect(r.ignoradas.map((i) => i.motivo)).toEqual(["sem valor", "sem data de crédito ou débito"]);
  });

  it("categoria vazia vira nulo, e a linha entra assim mesmo", () => {
    const r = lerExportDoOmie([cabecalho("pagamento"), linha(D("2025-10-06"), "  ", -100)]);
    expect(r.linhas[0]!.categoria).toBeNull();
  });

  it("arquivo sem as colunas certas explica o que fazer", () => {
    expect(() => lerExportDoOmie([["Nome", "Valor"], ["x", 1]])).toThrow(ExportIlegivel);
    expect(() => lerExportDoOmie([["Nome", "Valor"], ["x", 1]])).toThrow(/Contas a Pagar/);
  });

  it("sem a coluna de data, recusa explicando por quê", () => {
    expect(() => lerExportDoOmie([["Categoria", "Valor Pago"], ["Aluguel", -100]])).toThrow(
      /define o mês/
    );
  });

  it("arquivo vazio recusa em vez de devolver nada", () => {
    expect(() => lerExportDoOmie([])).toThrow(ExportIlegivel);
  });
});

describe("centavosDaCelula", () => {
  it("número vira centavos arredondados", () => {
    expect(centavosDaCelula(-5425.48)).toBe(-542548);
    expect(centavosDaCelula(0)).toBe(0);
    expect(centavosDaCelula(1640.0)).toBe(164000);
  });

  // Um CSV exportado traz "1.234,56", e lê-lo como 1.23 seria errar por mil.
  it("texto no formato brasileiro", () => {
    expect(centavosDaCelula("1.234,56")).toBe(123456);
    expect(centavosDaCelula("-1.234,56")).toBe(-123456);
    expect(centavosDaCelula("R$ 12.588,00")).toBe(1258800);
    expect(centavosDaCelula("50")).toBe(5000);
  });

  it("o que não é número devolve nulo", () => {
    expect(centavosDaCelula(null)).toBeNull();
    expect(centavosDaCelula("")).toBeNull();
    expect(centavosDaCelula("  ")).toBeNull();
    expect(centavosDaCelula("abc")).toBeNull();
    expect(centavosDaCelula(NaN)).toBeNull();
  });
});

describe("mesesDoExport", () => {
  // Um arquivo com duas competências dentro, importado como se fosse uma, é um
  // DRE errado nos dois meses. A tela mostra isto antes de gravar.
  it("conta as linhas de cada mês, na ordem", () => {
    const r = lerExportDoOmie([
      cabecalho("pagamento"),
      linha(D("2025-10-06"), "Aluguel", -100),
      linha(D("2025-10-20"), "Aluguel", -100),
      linha(D("2025-09-30"), "Aluguel", -100),
    ]);
    expect(mesesDoExport(r.linhas)).toEqual([
      { ano: 2025, mes: 9, linhas: 1 },
      { ano: 2025, mes: 10, linhas: 2 },
    ]);
  });

  it("lista vazia não quebra", () => {
    expect(mesesDoExport([])).toEqual([]);
  });
});

describe("data que vem da planilha", () => {
  // O leitor devolve "06/10/2025" como meia-noite EM UTC. Tratar isso como
  // instante e converter para São Paulo joga para as 21h do dia anterior — e
  // todo dia 1º vira o mês passado. Peguei rodando contra o arquivo real: 20
  // das 473 linhas de outubro caíram em setembro.
  it("meia-noite UTC continua sendo o dia que o arquivo escreveu", () => {
    const r = lerExportDoOmie([
      cabecalho("pagamento"),
      linha(new Date("2025-10-01T00:00:00Z"), "Aluguel", -100),
      linha(new Date("2025-10-31T00:00:00Z"), "Aluguel", -100),
    ]);
    expect(mesesDoExport(r.linhas)).toEqual([{ ano: 2025, mes: 10, linhas: 2 }]);
  });

  it("o mesmo vale para o texto dd/mm/aaaa", () => {
    const r = lerExportDoOmie([cabecalho("pagamento"), linha("01/10/2025", "Aluguel", -100)]);
    expect(mesesDoExport(r.linhas)).toEqual([{ ano: 2025, mes: 10, linhas: 1 }]);
  });

  it("a virada do ano também", () => {
    const r = lerExportDoOmie([
      cabecalho("pagamento"),
      linha(new Date("2026-01-01T00:00:00Z"), "Aluguel", -100),
    ]);
    expect(mesesDoExport(r.linhas)).toEqual([{ ano: 2026, mes: 1, linhas: 1 }]);
  });
});

describe("mesDaData", () => {
  it("o mês é o de São Paulo", () => {
    expect(mesDaData(new Date("2025-10-01T12:00:00Z"))).toEqual({ ano: 2025, mes: 10 });
  });

  // 01/10 às 02:00 UTC ainda é 30/09 em São Paulo. Ancorar a data no meio do
  // dia é o que impede o fuso de empurrar o mês.
  it("a virada do mês é a de São Paulo, não a de UTC", () => {
    expect(mesDaData(new Date("2025-10-01T02:00:00Z"))).toEqual({ ano: 2025, mes: 9 });
    expect(mesDaData(new Date("2025-10-01T12:00:00Z"))).toEqual({ ano: 2025, mes: 10 });
  });
});
