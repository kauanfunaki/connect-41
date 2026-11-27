import { describe, expect, it } from "vitest";
import { texto } from "@/lib/contabil-core/motor/decimal";
import { lerPlanilhaDasLinhas } from "@/lib/contabil-core/extrato/planilha";
import type { Celula } from "@/lib/contabil-core/planilha/celula";
import { colunasExtras, ehPlanilha, lerExtratoEmPlanilha, natureza, prepararLinhas } from "./planilha";

const ler = (linhas: Celula[][]) => lerPlanilhaDasLinhas(prepararLinhas(linhas), 2026).map((t) => [t.historico, texto(t.valor)]);

// O formato do extrato da QI Tech, como no teste do Conciliador BPO: "Tipo" (tipo da
// transação) e "D/C" em colunas separadas, do mais recente para o mais antigo, com
// linhas "Saldo do dia" sem valor.
const QI: Celula[][] = [
  ["Data Referência", "Hora da transação", "Tipo", "Descrição", "Valor Transação (R$)", "D/C", "Saldo após transação (R$)", "Saldo Final (R$)"],
  ["17/09/2026", null, "Saldo do dia", null, null, null, null, "0"],
  ["17/09/2026", "15:50:20", "Tarifa de PIX", "BANCO XYZ S.A.", "-6.9", "D", "0", null],
  ["17/09/2026", "15:50:20", "Transferência de PIX", "BANCO XYZ S.A.", "-2000", "D", "6.9", null],
  ["17/09/2026", "07:06:02", "Depósito", "CLIENTE UM S A", "1500", "C", "2006.9", null],
  ["16/09/2026", null, "Saldo do dia", null, null, null, null, "506.9"],
  ["16/09/2026", "16:56:45", "Depósito de PIX", "CLIENTE DOIS S.A.", "500", "C", "506.9", null],
  ["16/09/2026", "02:06:36", "Liquidação de Boleto", "Liquidação | Quantidade: 1", "6.9", "C", "6.9", null],
];

describe("extrato em planilha com natureza (D/C) e tipo da transação", () => {
  it("acha a coluna D/C como natureza e o Tipo como tipo da transação", () => {
    expect(colunasExtras(QI)).toEqual({ cabecalho: 0, natureza: 5, tipo: 2 });
  });

  it("QI Tech: depósito entra como entrada, o tipo vai para o histórico e o saldo do dia fica fora", () => {
    expect(ler(QI)).toEqual([
      ["Liquidação de Boleto — Liquidação | Quantidade: 1", "6.9"],
      ["Depósito de PIX — CLIENTE DOIS S.A.", "500"],
      ["Depósito — CLIENTE UM S A", "1500"],
      ["Transferência de PIX — BANCO XYZ S.A.", "-2000"],
      ["Tarifa de PIX — BANCO XYZ S.A.", "-6.9"],
    ]);
  });

  it("valor sem sinal: a coluna D/C decide", () => {
    const linhas: Celula[][] = [
      ["Data", "Histórico", "Valor", "D/C"],
      ["15/09/2026", "TARIFA", "6,90", "D"],
      ["15/09/2026", "PIX RECEBIDO", "10,00", "C"],
    ];
    expect(ler(linhas)).toEqual([
      ["TARIFA", "-6.90"],
      ["PIX RECEBIDO", "10.00"],
    ]);
  });

  it("coluna \"Tipo\" que só tem D e C é a natureza, não o tipo da transação", () => {
    const linhas: Celula[][] = [
      ["Data", "Histórico", "Valor", "Tipo"],
      ["15/09/2026", "TARIFA", "6,90", "D"],
      ["15/09/2026", "PIX", "10,00", "C"],
    ];
    expect(colunasExtras(linhas)).toEqual({ cabecalho: 0, natureza: 3, tipo: null });
    expect(ler(linhas)).toEqual([
      ["TARIFA", "-6.90"],
      ["PIX", "10.00"],
    ]);
  });

  it("\"Débito/Crédito\" com D e C é a natureza, e não a coluna de débito", () => {
    const linhas: Celula[][] = [
      ["Data", "Histórico", "Valor", "Débito/Crédito"],
      ["15/09/2026", "TARIFA", "6,90", "Débito"],
      ["15/09/2026", "PIX", "10,00", "Crédito"],
    ];
    expect(ler(linhas)).toEqual([
      ["TARIFA", "-6.90"],
      ["PIX", "10.00"],
    ]);
  });

  it("planilha sem natureza nem tipo passa como está", () => {
    const linhas: Celula[][] = [
      ["Data", "Histórico", "Crédito", "Débito", "Saldo"],
      ["15/09/2026", "PIX", "10,00", null, "10,00"],
    ];
    expect(prepararLinhas(linhas)).toBe(linhas);
  });
});

describe("natureza", () => {
  it.each([
    ["D", -1],
    ["d", -1],
    ["Débito", -1],
    ["DEB", -1],
    ["Saída", -1],
    ["C", 1],
    ["Crédito", 1],
    ["CRED", 1],
    ["Entrada", 1],
    ["Depósito de PIX", 0],
    ["Depósito", 0],
    ["", 0],
    [null, 0],
  ] as const)("%j → %d", (valor, esperado) => {
    expect(natureza(valor)).toBe(esperado);
  });
});

describe("lerExtratoEmPlanilha", () => {
  const csv = (t: string) => new TextEncoder().encode(t);
  const ARQUIVO = [
    "Data;Historico;Valor;D/C;Saldo",
    "15/09/2026;TARIFA;6,90;D;93,10",
    "15/09/2026;PIX RECEBIDO;10,00;C;103,10",
    "15/09/2026;TARIFA;6,90;D;96,20",
    "16/09/2026;PAGAMENTO FORNECEDOR;50,00;D;46,20",
  ].join("\n");

  it("devolve o mesmo extrato do OFX: centavos com sinal, período e o saldo da última linha", () => {
    const r = lerExtratoEmPlanilha(csv(ARQUIVO), "extrato.csv");
    if (!r.ok) throw new Error(r.erro);
    expect(r.extrato.transacoes.map((t) => [t.dataKey, t.centavos, t.memo, t.tipo])).toEqual([
      ["2026-09-15", -690, "TARIFA", "DEBIT"],
      ["2026-09-15", 1000, "PIX RECEBIDO", "CREDIT"],
      ["2026-09-15", -690, "TARIFA", "DEBIT"],
      ["2026-09-16", -5000, "PAGAMENTO FORNECEDOR", "DEBIT"],
    ]);
    expect(r.extrato.inicioKey).toBe("2026-09-15");
    expect(r.extrato.fimKey).toBe("2026-09-16");
    expect(r.extrato.saldo).toEqual({ centavos: 4620, dataKey: "2026-09-16" });
  });

  it("sem FITID: id gerado, igual na reimportação e diferente entre as duas tarifas iguais", () => {
    const a = lerExtratoEmPlanilha(csv(ARQUIVO), "extrato.csv");
    const b = lerExtratoEmPlanilha(csv(ARQUIVO), "extrato.csv");
    if (!a.ok || !b.ok) throw new Error("não leu");
    expect(a.extrato.transacoes.every((t) => t.fitIdGerado)).toBe(true);
    expect(a.extrato.transacoes.map((t) => t.fitId)).toEqual(b.extrato.transacoes.map((t) => t.fitId));
    expect(new Set(a.extrato.transacoes.map((t) => t.fitId)).size).toBe(4);
  });

  it("recusa com a frase do leitor quando o saldo não caminha com os lançamentos", () => {
    const errado = ["Data;Historico;Valor;Saldo", "15/09/2026;PIX;10,00;10,00", "16/09/2026;TARIFA;-5,00;50,00"].join("\n");
    const r = lerExtratoEmPlanilha(csv(errado), "extrato.csv");
    expect(r).toEqual({ ok: false, erro: expect.stringContaining("o saldo do extrato não caminha com os lançamentos") });
  });

  it("recusa a planilha sem cabeçalho de extrato", () => {
    const r = lerExtratoEmPlanilha(csv("Nome;Idade\nAna;30"), "lista.csv");
    expect(r).toEqual({ ok: false, erro: expect.stringContaining("cabeçalho") });
  });

  it("arquivo vazio", () => {
    expect(lerExtratoEmPlanilha(new Uint8Array(), "x.xls")).toEqual({ ok: false, erro: "O arquivo está vazio." });
  });
});

describe("ehPlanilha", () => {
  it.each([
    ["extrato.xls", true],
    ["EXTRATO.XLSX", true],
    ["extrato.csv", true],
    ["extrato.xlsm", true],
    ["extrato.ofx", false],
    ["extrato.pdf", false],
  ])("%s → %s", (nome, esperado) => {
    expect(ehPlanilha(nome)).toBe(esperado);
  });
});
