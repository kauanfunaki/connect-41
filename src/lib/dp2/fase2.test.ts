import { describe, expect, it } from "vitest";
import { importarEventos, lerHoras, rubricaDaColuna, type RubricaParaImportar } from "./importacaoDeEventos";
import { alfa, formaDoPagamento, gerarRemessa, num, problemaDoPagamento, type EmpresaPagadora, type PagamentoDaRemessa } from "./cnab240";
import { contabilizar, csvDosLancamentos, lerContasDaFolha, SEM_CONTA, type RubricaContabil } from "./contabilizacao";
import { pdfDosHolerites } from "./holeritePdf";
import { RUBRICAS_PADRAO } from "./rubricas";

const rubricas: RubricaParaImportar[] = RUBRICAS_PADRAO.map((r, i) => ({ id: `r${i}`, codigo: r.codigo, nome: r.nome, tipo: r.tipo, papel: r.papel, lancamento: r.lancamento, ativa: true }));
const id = (codigo: string) => rubricas.find((r) => r.codigo === codigo)!.id;
const pessoas = [
  { id: "p1", nome: "Joana Ribeiro", cpf: "123.456.789-09" },
  { id: "p2", nome: "Carlos Eduardo Lima", cpf: null },
];

describe("importação de eventos", () => {
  it("lê horas do Pontomais e números com vírgula", () => {
    expect(lerHoras("10:30")).toBe(10.5);
    expect(lerHoras("02:20")).toBe(2.33);
    expect(lerHoras("7,5")).toBe(7.5);
    expect(lerHoras("-")).toBeNull();
  });

  it("casa coluna por código, nome e apelido; ignora o resto", () => {
    expect(rubricaDaColuna("HE 50%", rubricas)?.codigo).toBe("002");
    expect(rubricaDaColuna("Horas Extras 100%", rubricas)?.codigo).toBe("003");
    expect(rubricaDaColuna("009 Comissões", rubricas)?.codigo).toBe("009");
    expect(rubricaDaColuna("Adicional Noturno", rubricas)?.codigo).toBe("004");
    // Calculada pelo motor: não se importa.
    expect(rubricaDaColuna("INSS", rubricas)).toBeNull();
    expect(rubricaDaColuna("Banco de horas", rubricas)).toBeNull();
  });

  it("monta os eventos por CPF ou nome e avisa o que ficou de fora", () => {
    const texto = [
      "Nome\tCPF\tHE 50%\tFaltas\tComissões\tBanco de horas",
      "Joana Ribeiro\t123.456.789-09\t10:30\t1\t250,00\t03:00",
      "Carlos Eduardo Lima\t\t02:00\t\t\t",
      "Fulano\t999.999.999-99\t01:00\t\t\t",
    ].join("\n");
    const r = importarEventos(texto, rubricas, pessoas);
    expect(r.eventos).toEqual([
      { personId: "p1", rubricaId: id("002"), quantidade: 10.5, valor: null },
      { personId: "p1", rubricaId: id("050"), quantidade: 1, valor: null },
      { personId: "p1", rubricaId: id("009"), quantidade: null, valor: 250 },
      { personId: "p2", rubricaId: id("002"), quantidade: 2, valor: null },
    ]);
    expect(r.colunas.find((c) => c.cabecalho === "Banco de horas")?.rubrica).toBeNull();
    expect(r.avisos.some((a) => a.includes("Fulano"))).toBe(true);
  });

  it("pede a coluna de CPF ou nome", () => {
    expect(importarEventos("HE 50\n10", rubricas, pessoas).avisos[0]).toContain("CPF ou Nome");
  });
});

const empresa: EmpresaPagadora = {
  documento: "12.345.678/0001-90",
  nome: "Panificadora Pão Dourado Ltda",
  convenio: "123456",
  nomeDoBanco: "",
  banco: "341",
  agencia: "1234",
  agenciaDigito: "",
  conta: "56789",
  contaDigito: "0",
};
const pag = (extra: Partial<PagamentoDaRemessa>): PagamentoDaRemessa => ({
  nome: "Joana Ribeiro",
  cpf: "12345678909",
  banco: "341",
  agencia: "4321",
  agenciaDigito: "",
  conta: "98765",
  contaDigito: "1",
  tipoConta: "CORRENTE",
  valor: 2986.18,
  seuNumero: "nov26-1",
  ...extra,
});

describe("CNAB 240", () => {
  it("campos alfanuméricos e numéricos", () => {
    expect(alfa("Pão Dourado", 12)).toBe("PAO DOURADO ");
    expect(num("12.345", 7)).toBe("0012345");
  });

  it("forma de lançamento pelo banco e tipo de conta", () => {
    expect(formaDoPagamento({ banco: "341", tipoConta: "CORRENTE" }, "341")).toBe("01");
    expect(formaDoPagamento({ banco: "341", tipoConta: "POUPANCA" }, "341")).toBe("05");
    expect(formaDoPagamento({ banco: "001", tipoConta: "CORRENTE" }, "341")).toBe("41");
  });

  it("aponta quem não pode entrar", () => {
    expect(problemaDoPagamento(pag({ cpf: "" }))).toBe("sem CPF");
    expect(problemaDoPagamento(pag({ conta: "" }))).toContain("conta");
    expect(problemaDoPagamento(pag({ valor: 0 }))).toContain("líquido");
    expect(problemaDoPagamento(pag({}))).toBeNull();
  });

  it("gera 240 posições por linha, um lote por forma e os totais nos trailers", () => {
    const r = gerarRemessa({
      empresa,
      pagamentos: [pag({}), pag({ nome: "Carlos", cpf: "98765432100", banco: "001", valor: 2594.34, seuNumero: "nov26-2" })],
      dataPagamento: "2026-12-05",
      sequencial: 3,
      geradoEm: new Date("2026-12-03T14:05:09Z"),
    });
    // Sem trimEnd: o trailer termina em brancos, que fazem parte das 240 posições.
    const linhas = r.conteudo.replace(/\r\n$/, "").split("\r\n");
    expect(linhas.every((l) => l.length === 240)).toBe(true);
    // header arquivo, (header lote, A, B, trailer lote) × 2, trailer arquivo
    expect(linhas).toHaveLength(10);
    expect(linhas[0].slice(0, 3)).toBe("341");
    expect(linhas[0].slice(157, 163)).toBe("000003");
    expect(linhas[1].slice(11, 13)).toBe("01");
    expect(linhas[5].slice(11, 13)).toBe("41");
    const a = linhas[2];
    expect(a[13]).toBe("A");
    expect(a.slice(93, 101)).toBe("05122026");
    expect(a.slice(119, 134)).toBe("000000000298618");
    expect(linhas[3].slice(18, 32)).toBe("00012345678909");
    expect(linhas[4].slice(17, 23)).toBe("000004");
    expect(linhas[4].slice(23, 41)).toBe("000000000000298618");
    expect(linhas[9].slice(17, 23)).toBe("000002");
    expect(linhas[9].slice(23, 29)).toBe("000010");
    expect(r.total).toBe(5580.52);
  });
});

describe("contabilização", () => {
  const rub = new Map<string, RubricaContabil>([
    ["001", { codigo: "001", nome: "Salário", contaDebito: "4.1.01", contaCredito: null }],
    ["053", { codigo: "053", nome: "INSS", contaDebito: null, contaCredito: "2.1.03" }],
    ["090", { codigo: "090", nome: "FGTS do mês", contaDebito: null, contaCredito: null }],
  ]);
  const calc = {
    itens: [
      { codigo: "001", nome: "Salário", tipo: "PROVENTO", valor: 3000 },
      { codigo: "053", nome: "INSS", tipo: "DESCONTO", valor: 248.6 },
      { codigo: "090", nome: "FGTS do mês", tipo: "INFORMATIVA", valor: 240 },
    ],
    encargos: { inssEmpresa: 600, rat: 60, terceiros: 174 },
    provisoes: { ferias: 250, tercoFerias: 83.33, decimo: 250, encargosFerias: 120, encargosDecimo: 90 },
  };

  it("lança proventos, descontos, FGTS, encargos e provisões, somando pessoas", () => {
    const contas = { ...lerContasDaFolha({ salariosAPagar: "2.1.01", fgtsDespesa: "4.1.05", fgtsARecolher: "2.1.04", inssEmpresaDespesa: "4.1.04", inssARecolher: "2.1.03" }) };
    const r = contabilizar([calc, calc], rub, contas, "11/2026");
    const salario = r.lancamentos.find((l) => l.historico.startsWith("Salário"))!;
    expect(salario).toMatchObject({ debito: "4.1.01", credito: "2.1.01", valor: 6000 });
    expect(r.lancamentos.find((l) => l.historico.startsWith("INSS 11"))).toMatchObject({ debito: "2.1.01", credito: "2.1.03", valor: 497.2 });
    expect(r.lancamentos.find((l) => l.historico.startsWith("FGTS"))).toMatchObject({ debito: "4.1.05", credito: "2.1.04", valor: 480 });
    expect(r.lancamentos.find((l) => l.historico.startsWith("INSS da empresa"))!.valor).toBe(1668);
    expect(r.lancamentos.find((l) => l.historico.startsWith("Provisão de férias"))!.debito).toBe(SEM_CONTA);
    expect(r.faltam.some((f) => f.includes("Provisão de férias"))).toBe(true);
  });

  it("CSV com vírgula decimal e BOM", () => {
    const csv = csvDosLancamentos([{ debito: "1", credito: "2", valor: 1234.5, historico: "Salário; nov" }], "2026-11-30");
    expect(csv.startsWith("﻿Data;Débito")).toBe(true);
    expect(csv).toContain('30/11/2026;1;2;1234,50;"Salário; nov"');
  });
});

describe("holerite em PDF", () => {
  it("uma página por colaborador", async () => {
    const h = {
      empresaNome: "Panificadora Pão Dourado Ltda",
      empresaDocumento: "12.345.678/0001-90",
      competencia: "nov/2026",
      tipo: "Folha mensal",
      colaborador: "Joana Ribeiro",
      cpf: "123.456.789-09",
      admissao: "11/05/2024",
      salarioBase: 3000,
      linhas: [
        { codigo: "001", nome: "Salário", referencia: "30 dias", tipo: "PROVENTO" as const, valor: 3000 },
        { codigo: "053", nome: "INSS", referencia: "8,29%", tipo: "DESCONTO" as const, valor: 248.6 },
      ],
      proventos: 3000,
      descontos: 248.6,
      liquido: 2751.4,
      baseInss: 3000,
      baseFgts: 3000,
      fgts: 240,
      baseIrrf: 2392.8,
    };
    const bytes = await pdfDosHolerites([h, { ...h, colaborador: "Carlos — Lima" }]);
    expect(new TextDecoder().decode(bytes.slice(0, 5))).toBe("%PDF-");
    const { PDFDocument } = await import("pdf-lib");
    expect((await PDFDocument.load(bytes)).getPageCount()).toBe(2);
  });
});
