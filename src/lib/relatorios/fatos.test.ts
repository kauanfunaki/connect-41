import { describe, expect, it } from "vitest";
import { fatosDasBaixas, fatosDasContas, type ContaParaFato } from "./fatos";
import { lerConfiguracao, montarTabela } from "./tabelaDinamica";
import { abaDaTabelaMontada, abaDosDados } from "./exportacaoDaTabela";

const HOJE = "2026-10-20";
const conta = (extra: Partial<ContaParaFato> = {}): ContaParaFato => ({
  id: "c1",
  kind: "PAGAR",
  status: "CONFERIDO",
  paidAt: null,
  approvalStatus: "NAO_REQUER",
  valorCentavos: 1_000,
  baixadoCentavos: 0,
  competencia: "2026-09",
  vencimentoKey: "2026-10-10",
  previsaoKey: null,
  quitacaoKey: null,
  empresa: "Alfa",
  contraparte: "Fornecedor",
  categoria: { nome: "Aluguel", grupo: "Ocupação" },
  centro: { nome: "Loja A" },
  projeto: { nome: null },
  partes: [],
  ...extra,
});

describe("fatosDasContas", () => {
  it("as dimensões da conta: situação do dia, meses, aprovação", () => {
    const [f] = fatosDasContas([conta({ previsaoKey: "2026-11-05", approvalStatus: "AGUARDANDO" })], HOJE);
    expect(f!.dims).toMatchObject({
      tipo: "A pagar",
      situacao: "Vencida",
      competencia: "2026-09",
      vencimento: "2026-10",
      previsao: "2026-11",
      quitacao: null,
      aprovacao: "Aguardando aprovação",
      grupo: "Ocupação",
    });
    expect(f!.medidas).toEqual({ valor: 1_000, baixado: 0, saldo: 1_000 });
  });

  it("recebida diz recebida; o rateio abre em partes com o pago proporcional", () => {
    const [recebida] = fatosDasContas([conta({ kind: "RECEBER", status: "PAGO", paidAt: new Date(), quitacaoKey: "2026-10-12", baixadoCentavos: 1_000 })], HOJE);
    expect(recebida!.dims).toMatchObject({ tipo: "A receber", situacao: "Recebida", quitacao: "2026-10" });
    const partes = fatosDasContas(
      [
        conta({
          baixadoCentavos: 500,
          partes: [
            { categoria: { nome: "Aluguel", grupo: null }, centro: { nome: "Loja A" }, projeto: { nome: null }, centavos: 600 },
            { categoria: { nome: "Água", grupo: null }, centro: { nome: "Loja B" }, projeto: { nome: "Obra" }, centavos: 400 },
          ],
        }),
      ],
      HOJE
    );
    expect(partes.map((p) => [p.chave, p.dims.categoria, p.dims.projeto, p.medidas])).toEqual([
      ["c1", "Aluguel", null, { valor: 600, baixado: 300, saldo: 300 }],
      ["c1", "Água", "Obra", { valor: 400, baixado: 200, saldo: 200 }],
    ]);
  });
});

describe("fatosDasBaixas", () => {
  it("entradas e saídas, a parte da baixa e o líquido com sinal", () => {
    const base = {
      paymentId: "p1",
      pagamentoKey: "2026-10-05",
      competencia: "2026-09",
      empresa: "Alfa",
      contraparte: "Cliente",
      categoria: { nome: "Vendas", grupo: null },
      centro: { nome: null },
      projeto: { nome: null },
    };
    const f = fatosDasBaixas([
      { ...base, kind: "RECEBER", parte: "principal", centavos: 1_000 },
      { ...base, kind: "PAGAR", parte: "desconto", centavos: 50 },
    ]);
    expect(f.map((x) => [x.dims.tipo, x.dims.parte, x.dims.pagamento, x.medidas.liquido])).toEqual([
      ["Entradas", "Principal", "2026-10", 1_000],
      ["Saídas", "Desconto", "2026-10", -50],
    ]);
  });
});

describe("a exportação da tabela", () => {
  const fatos = fatosDasContas(
    [
      conta(),
      conta({ id: "c2", categoria: { nome: "Água", grupo: "Ocupação" }, valorCentavos: 300, competencia: "2026-10" }),
      conta({ id: "c3", centro: { nome: "Loja B" }, valorCentavos: 200 }),
    ],
    HOJE
  );

  it("dois níveis: uma linha por detalhe, com os dois rótulos e as colunas", () => {
    const c = lerConfiguracao({ linhas: "centro,categoria", coluna: "competencia", medida: "valor", periodo: "todos" }, HOJE);
    const aba = abaDaTabelaMontada(montarTabela(fatos, c), c);
    expect(aba.colunas.map((x) => x.nome)).toEqual(["Centro de custo", "Categoria", "Set/26", "Out/26", "Total"]);
    expect(aba.linhas).toEqual([
      ["Loja A", "Aluguel", 1_000, 0, 1_000],
      ["Loja A", "Água", 0, 300, 300],
      ["Loja B", "Aluguel", 200, 0, 200],
    ]);
  });

  it("os dados: as dimensões da base e as medidas em reais", () => {
    const c = lerConfiguracao({}, HOJE);
    const aba = abaDosDados(fatos, c);
    expect(aba.colunas.map((x) => x.nome)).toContain("Saldo em aberto");
    expect(aba.colunas.map((x) => x.nome)).not.toContain("Quantidade");
    expect(aba.colunas.map((x) => x.nome)).not.toContain("Mês do pagamento");
    expect(aba.linhas).toHaveLength(3);
  });
});
