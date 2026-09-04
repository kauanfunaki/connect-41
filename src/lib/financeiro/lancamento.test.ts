import { describe, expect, it } from "vitest";
import {
  vencimentoPresumido,
  podeLancar,
  categoriaDoLancamento,
  categoriaObrigatoria,
  type DocumentoParaLancar,
} from "./lancamento";

const bom: DocumentoParaLancar = {
  situacao: "AUTORIZADA",
  destino: "PENDENTE",
  removidoNaOrigem: false,
  jaTemLancamento: false,
  valor: "1234.50",
  direcao: "PAGAR",
};

const doc = (over: Partial<DocumentoParaLancar> = {}): DocumentoParaLancar => ({ ...bom, ...over });

describe("vencimentoPresumido", () => {
  // A NF-e não carrega vencimento — ele vive na duplicata. Nascer sem data
  // tiraria o lançamento do fluxo de caixa e do relatório de quem paga.
  it("são 30 dias depois da emissão", () => {
    const v = vencimentoPresumido(new Date("2026-09-01T10:00:00Z"));
    expect(v.toISOString().slice(0, 10)).toBe("2026-10-01");
  });

  it("atravessa a virada de mês curto", () => {
    const v = vencimentoPresumido(new Date("2026-01-31T12:00:00Z"));
    expect(v.toISOString().slice(0, 10)).toBe("2026-03-02");
  });

  it("não altera a data recebida", () => {
    const emitido = new Date("2026-09-01T10:00:00Z");
    vencimentoPresumido(emitido);
    expect(emitido.toISOString()).toBe("2026-09-01T10:00:00.000Z");
  });
});

describe("podeLancar", () => {
  it("documento normal vira lançamento a pagar", () => {
    expect(podeLancar(doc())).toEqual({ pode: true, kind: "PAGAR" });
  });

  it("documento de saída vira a receber", () => {
    expect(podeLancar(doc({ direcao: "RECEBER" }))).toEqual({ pode: true, kind: "RECEBER" });
  });

  // O vínculo é 1:1. Relançar duplicaria valor no financeiro — é a recusa mais
  // cara de todas.
  it("recusa documento já lançado, pelos dois sinais", () => {
    expect(podeLancar(doc({ jaTemLancamento: true }))).toMatchObject({ motivo: "ja_lancado" });
    expect(podeLancar(doc({ destino: "LANCADO" }))).toMatchObject({ motivo: "ja_lancado" });
  });

  it("recusa nota cancelada — cancelada na SEFAZ não é obrigação de ninguém", () => {
    expect(podeLancar(doc({ situacao: "CANCELADA" }))).toMatchObject({ motivo: "cancelada" });
  });

  // Lápide do SPED: o Portal Nacional passou a mostrar a nota como cancelada ou
  // substituída. Lançar cria crédito indevido.
  it("recusa documento removido na origem", () => {
    expect(podeLancar(doc({ removidoNaOrigem: true }))).toMatchObject({
      motivo: "removido_na_origem",
    });
  });

  // Empresa nas duas pontas (transferência entre estabelecimentos) ou em
  // nenhuma. Chutar o lado lançaria dinheiro que não existe.
  it("recusa direção indefinida", () => {
    expect(podeLancar(doc({ direcao: "INDEFINIDA" }))).toMatchObject({
      motivo: "direcao_indefinida",
    });
  });

  // Linha PARCIAL do índice do SPED. Zero somaria no fluxo de caixa um número
  // que ninguém apurou.
  it("recusa documento sem valor apurado", () => {
    expect(podeLancar(doc({ valor: null }))).toMatchObject({ motivo: "sem_valor" });
    expect(podeLancar(doc({ valor: "  " }))).toMatchObject({ motivo: "sem_valor" });
  });

  // Quem ignorou pode mudar de ideia, e lançar É a mudança de destino.
  it("documento ignorado ainda pode ser lançado", () => {
    expect(podeLancar(doc({ destino: "IGNORADO" }))).toMatchObject({ pode: true });
  });

  // A ordem das recusas importa para a mensagem que a pessoa lê: dizer "escolha
  // a categoria" numa nota cancelada mandaria alguém procurar a categoria certa
  // de um documento que nunca vai virar lançamento.
  it("a recusa mais grave vem primeiro", () => {
    const r = podeLancar(doc({ situacao: "CANCELADA", valor: null, direcao: "INDEFINIDA" }));
    expect(r).toMatchObject({ motivo: "cancelada" });
  });

  it("cada recusa explica o custo, não só o nome", () => {
    const r = podeLancar(doc({ jaTemLancamento: true }));
    expect(r.pode).toBe(false);
    if (!r.pode) expect(r.explicacao).toContain("duplicaria");
  });
});

describe("categoriaObrigatoria", () => {
  // Despesa sem classificação não fecha o DRE. No recebimento é opcional — a
  // mesma assimetria do protótipo, onde Payable.categoryId é obrigatório e
  // Receivable.categoryId não.
  it("só a pagar exige", () => {
    expect(categoriaObrigatoria("PAGAR")).toBe(true);
    expect(categoriaObrigatoria("RECEBER")).toBe(false);
  });
});

describe("categoriaDoLancamento", () => {
  it("a escolhida na tela vence a padrão do fornecedor", () => {
    expect(categoriaDoLancamento("escolhida", "padrao")).toBe("escolhida");
  });

  // "Categoria herdada do fornecedor da 2ª nota em diante": a primeira exige
  // alguém classificar, e da segunda em diante já nasce classificada.
  it("sem escolha, herda a padrão do fornecedor", () => {
    expect(categoriaDoLancamento(null, "padrao")).toBe("padrao");
    expect(categoriaDoLancamento("", "padrao")).toBe("padrao");
  });

  it("fornecedor novo, sem padrão, não inventa categoria", () => {
    expect(categoriaDoLancamento(null, null)).toBeNull();
  });
});
