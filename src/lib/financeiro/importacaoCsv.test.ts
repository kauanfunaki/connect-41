import { describe, it, expect } from "vitest";
import { prepararImportacao, chaveDeDuplicidade, tipoDeTexto, dataDeTexto, competenciaDeTexto } from "./importacaoCsv";

const HOJE = "2026-09-15";
const CATEGORIAS = [
  { id: "c-aluguel", nome: "Aluguel", kind: "PAGAR" as const },
  { id: "c-vendas", nome: "Vendas de Serviço", kind: "RECEBER" as const },
];

const CABECALHO = "Tipo;Fornecedor;CNPJ;Categoria;Competência;Vencimento;Valor;Descrição;Pago em";

function csv(...linhas: string[]) {
  return [CABECALHO, ...linhas].join("\n");
}

describe("prepararImportacao", () => {
  it("lê linhas válidas com os formatos que planilha exporta", () => {
    const r = prepararImportacao(
      csv(
        "pagar;Imobiliária X;12.345.678/0001-90;aluguel;09/2026;10/09/2026;2.500,00;Aluguel setembro;10/09/2026",
        "receber;Cliente Y;;Vendas de serviço;;2026-09-30;1000.50;;"
      ),
      HOJE,
      CATEGORIAS,
      new Set()
    );
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.linhas).toHaveLength(2);
    expect(r.linhas[0]).toMatchObject({
      numero: 2,
      situacao: "valida",
      dados: {
        kind: "PAGAR",
        contraparteDocumento: "12345678000190",
        categoryId: "c-aluguel",
        competencia: "2026-09",
        vencimentoKey: "2026-09-10",
        centavos: 250_000,
        pagoEmKey: "2026-09-10",
      },
    });
    // Competência em branco herda o mês do vencimento.
    expect(r.linhas[1]).toMatchObject({ situacao: "valida", dados: { competencia: "2026-09", categoryId: "c-vendas", centavos: 100_050 } });
  });

  it("recusa cabeçalho sem as colunas obrigatórias", () => {
    const r = prepararImportacao("Nome;Valor\nX;10", HOJE, CATEGORIAS, new Set());
    expect(r).toMatchObject({ ok: false });
  });

  // "Aluguel" de despesa não serve para uma receita — casa pelo nome E pelo tipo.
  it("categoria casa pelo tipo, e categoria escrita que não existe é erro", () => {
    const r = prepararImportacao(csv("receber;Z;;Aluguel;;2026-09-30;10;;"), HOJE, CATEGORIAS, new Set());
    expect(r.ok && r.linhas[0]!.situacao).toBe("erro");
  });

  it("pagar sem categoria é erro; receber sem categoria passa", () => {
    const r = prepararImportacao(csv("pagar;Z;;;;2026-09-30;10;;", "receber;Z;;;;2026-09-30;10;;"), HOJE, CATEGORIAS, new Set());
    expect(r.ok && r.linhas.map((l) => l.situacao)).toEqual(["erro", "valida"]);
  });

  it("duplicada contra o banco e contra linha anterior do próprio arquivo", () => {
    const linha = "pagar;Imobiliária X;12345678000190;Aluguel;2026-09;2026-09-10;2500;;";
    const existente = chaveDeDuplicidade({
      kind: "PAGAR",
      contraparteDocumento: "12345678000190",
      contraparteNome: "outro nome",
      competencia: "2026-09",
      vencimentoKey: "2026-09-10",
      centavos: 250_000,
    });
    const contraBanco = prepararImportacao(csv(linha), HOJE, CATEGORIAS, new Set([existente]));
    expect(contraBanco.ok && contraBanco.linhas[0]!.situacao).toBe("duplicada");

    const noArquivo = prepararImportacao(csv(linha, linha), HOJE, CATEGORIAS, new Set());
    expect(noArquivo.ok && noArquivo.linhas.map((l) => l.situacao)).toEqual(["valida", "duplicada"]);
  });

  it("sem documento, a duplicidade casa pelo nome normalizado", () => {
    const a = chaveDeDuplicidade({ kind: "PAGAR", contraparteDocumento: null, contraparteNome: "Padaria  São João", competencia: "2026-09", vencimentoKey: "2026-09-10", centavos: 1 });
    const b = chaveDeDuplicidade({ kind: "PAGAR", contraparteDocumento: null, contraparteNome: "padaria sao joao", competencia: "2026-09", vencimentoKey: "2026-09-10", centavos: 1 });
    expect(a).toBe(b);
  });

  it("documento com dígitos de menos é erro", () => {
    const r = prepararImportacao(csv("pagar;X;123;Aluguel;;2026-09-10;10;;"), HOJE, CATEGORIAS, new Set());
    expect(r.ok && r.linhas[0]!.situacao).toBe("erro");
  });
});

describe("prepararImportacao — centro de custo", () => {
  const CENTROS = [
    { id: "cc-loja", nome: "Loja Centro", codigo: "LJ1" },
    { id: "cc-obra", nome: "Obra 12", codigo: null },
  ];
  const comCentro = (...linhas: string[]) => [`${CABECALHO};Centro de custo`, ...linhas].join("\n");

  it("casa por nome ou código, e coluna vazia fica sem centro (herda na gravação)", () => {
    const r = prepararImportacao(
      comCentro("pagar;A;;Aluguel;;2026-09-10;10;;;lj1", "pagar;B;;Aluguel;;2026-09-10;11;;;obra 12", "pagar;C;;Aluguel;;2026-09-10;12;;;"),
      HOJE,
      CATEGORIAS,
      new Set(),
      CENTROS
    );
    expect(r.ok && r.linhas.map((l) => (l.situacao === "valida" ? l.dados.centroDeCustoId : l.situacao))).toEqual(["cc-loja", "cc-obra", null]);
  });

  it("centro escrito e não encontrado é erro da linha", () => {
    const r = prepararImportacao(comCentro("receber;A;;;;2026-09-10;10;;;Fábrica"), HOJE, CATEGORIAS, new Set(), CENTROS);
    expect(r.ok && r.linhas[0]).toMatchObject({ situacao: "erro", erro: expect.stringMatching(/Fábrica/) });
  });

  it("sem a coluna, o arquivo de antes continua válido e sem centro", () => {
    const r = prepararImportacao(csv("pagar;A;;Aluguel;;2026-09-10;10;;"), HOJE, CATEGORIAS, new Set(), CENTROS);
    expect(r.ok && r.linhas[0]).toMatchObject({ situacao: "valida", dados: { centroDeCustoId: null } });
  });

  it("o centro não entra na chave de duplicidade", () => {
    const r = prepararImportacao(
      comCentro("pagar;A;;Aluguel;;2026-09-10;10;;;LJ1", "pagar;A;;Aluguel;;2026-09-10;10;;;Obra 12"),
      HOJE,
      CATEGORIAS,
      new Set(),
      CENTROS
    );
    expect(r.ok && r.linhas.map((l) => l.situacao)).toEqual(["valida", "duplicada"]);
  });
});

describe("conversões de texto", () => {
  it("tipo, data e competência", () => {
    expect(tipoDeTexto("Despesa")).toBe("PAGAR");
    expect(tipoDeTexto("Receita")).toBe("RECEBER");
    expect(tipoDeTexto("?")).toBeNull();
    expect(dataDeTexto("5/9/2026")).toBe("2026-09-05");
    expect(competenciaDeTexto("9/2026")).toBe("2026-09");
  });
});
