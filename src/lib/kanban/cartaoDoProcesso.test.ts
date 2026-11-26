import { describe, expect, it } from "vitest";
import {
  COLUNAS_DO_PROCESSO,
  TIPO_DA_COLUNA,
  ajusteDoCartao,
  ajusteVazio,
  chaveDaColuna,
  colunaDaSituacao,
  colunaDeEntrada,
  descricaoDoCartao,
  destinoDoCartao,
  movimentoDoCartao,
  prioridadeDoCartao,
  tituloDoCartao,
  type ChaveDaColuna,
  type ColunaDoCartao,
} from "./cartaoDoProcesso";

// A lista criada pelo sistema: uma coluna por situação, com a chave.
const DO_SISTEMA: ColunaDoCartao[] = COLUNAS_DO_PROCESSO.map((c, order) => ({ id: c.chave.toLowerCase(), order, type: c.tipo, systemKey: c.chave }));

// Uma lista da equipe (o modelo padrão de "Nova lista"), fora de ordem de propósito.
const DA_EQUIPE: ColunaDoCartao[] = [
  { id: "concluido", order: 3, type: "DONE", systemKey: null },
  { id: "a-fazer", order: 0, type: "NOT_STARTED", systemKey: null },
  { id: "aguardando", order: 2, type: "PENDING", systemKey: null },
  { id: "andamento", order: 1, type: "IN_PROGRESS", systemKey: null },
];

const TODAS = COLUNAS_DO_PROCESSO.map((c) => c.chave);

describe("a coluna do processo", () => {
  it("segue a situação da fila e põe cancelado e indeferido na coluna deles", () => {
    expect(chaveDaColuna({ status: "EM_ANDAMENTO", concluido: false, protocolos: [] })).toBe("EM_ANDAMENTO");
    expect(chaveDaColuna({ status: "EM_ANDAMENTO", concluido: false, protocolos: [{ organId: "j", attempt: 1, outcome: "PENDENTE" }] })).toBe("AGUARDANDO_ORGAO");
    expect(chaveDaColuna({ status: "EM_ANDAMENTO", concluido: false, protocolos: [{ organId: "j", attempt: 1, outcome: "EXIGENCIA" }] })).toBe("EM_EXIGENCIA");
    expect(chaveDaColuna({ status: "AGUARDANDO_CLIENTE", concluido: false, protocolos: [] })).toBe("AGUARDANDO_CLIENTE");
    expect(chaveDaColuna({ status: "SUSPENSO", concluido: false, protocolos: [] })).toBe("SUSPENSO");
    expect(chaveDaColuna({ status: "CONCLUIDO", concluido: true, protocolos: [] })).toBe("CONCLUIDO");
    expect(chaveDaColuna({ status: "CANCELADO", concluido: false, protocolos: [] })).toBe("CANCELADO");
    expect(chaveDaColuna({ status: "INDEFERIDO", concluido: false, protocolos: [] })).toBe("CANCELADO");
  });

  it("as duas colunas de encerramento são concluídas; as outras, abertas", () => {
    expect(TIPO_DA_COLUNA.CONCLUIDO).toBe("DONE");
    expect(TIPO_DA_COLUNA.CANCELADO).toBe("DONE");
    for (const c of TODAS.filter((c) => c !== "CONCLUIDO" && c !== "CANCELADO")) expect(TIPO_DA_COLUNA[c]).not.toBe("DONE");
  });
});

describe("onde o cartão fica", () => {
  it("na lista do sistema, a coluna da mesma chave — mesmo com duas do mesmo tipo", () => {
    for (const chave of TODAS) expect(colunaDaSituacao(DO_SISTEMA, chave)?.systemKey).toBe(chave);
  });

  it("na lista da equipe, a primeira do tipo da situação", () => {
    expect(colunaDaSituacao(DA_EQUIPE, "EM_EXIGENCIA")?.id).toBe("andamento");
    expect(colunaDaSituacao(DA_EQUIPE, "SUSPENSO")?.id).toBe("aguardando");
    expect(colunaDaSituacao(DA_EQUIPE, "CANCELADO")?.id).toBe("concluido");
  });

  it("o cartão novo do processo encerrado nasce direto na coluna final", () => {
    expect(colunaDeEntrada(DO_SISTEMA, "CONCLUIDO")?.id).toBe("concluido");
    expect(colunaDeEntrada(DO_SISTEMA, "CANCELADO")?.id).toBe("cancelado");
  });

  it("sem coluna do tipo, nasce na primeira não iniciada; sem coluna, em lugar nenhum", () => {
    const soAbertas = DA_EQUIPE.filter((c) => c.type !== "PENDING");
    expect(colunaDeEntrada(soAbertas, "AGUARDANDO_ORGAO")?.id).toBe("a-fazer");
    expect(colunaDeEntrada([], "EM_ANDAMENTO")).toBeNull();
  });

  it("anda quando a situação muda e fica quando já está certo", () => {
    expect(destinoDoCartao(DO_SISTEMA, "em_andamento", "EM_EXIGENCIA")?.id).toBe("em_exigencia");
    expect(destinoDoCartao(DO_SISTEMA, "em_exigencia", "EM_EXIGENCIA")).toBeNull();
    // Na lista da equipe, exigência e andamento são do mesmo tipo: fica.
    expect(destinoDoCartao(DA_EQUIPE, "andamento", "EM_EXIGENCIA")).toBeNull();
    expect(destinoDoCartao(DA_EQUIPE, "andamento", "CONCLUIDO")?.id).toBe("concluido");
  });

  it("coluna do sistema que a equipe tirou: cai na do tipo", () => {
    const semSuspenso = DO_SISTEMA.filter((c) => c.systemKey !== "SUSPENSO");
    expect(destinoDoCartao(semSuspenso, "em_andamento", "SUSPENSO")?.id).toBe("aguardando_orgao");
  });
});

describe("mover à mão", () => {
  it("é recusado para outra coluna do sistema, com o caminho", () => {
    const m = movimentoDoCartao(DO_SISTEMA, "concluido", "EM_ANDAMENTO", 12);
    expect(m).toEqual({ ok: false, motivo: "A coluna deste cartão segue a situação do Processo nº 12. Para mudar, registre no processo." });
  });

  it("vale só para coluna que também serve à situação", () => {
    const duasEmAndamento: ColunaDoCartao[] = [...DA_EQUIPE, { id: "revisao", order: 4, type: "IN_PROGRESS", systemKey: null }];
    expect(movimentoDoCartao(duasEmAndamento, "revisao", "EM_ANDAMENTO", 1)).toEqual({ ok: true });
    expect(movimentoDoCartao(duasEmAndamento, "aguardando", "EM_ANDAMENTO", 1).ok).toBe(false);
  });
});

describe("os campos que o processo manda", () => {
  it("prioridade: baixa e normal são sem prioridade no cartão", () => {
    expect([prioridadeDoCartao("BAIXA"), prioridadeDoCartao("NORMAL"), prioridadeDoCartao("ALTA"), prioridadeDoCartao("URGENTE")]).toEqual([0, 0, 1, 2]);
  });

  it("título com número, tipo e empresa, no limite da coluna", () => {
    expect(tituloDoCartao(12, " Alteração contratual ", "Padaria Exemplo")).toBe("Nº 12 · Alteração contratual — Padaria Exemplo");
    expect(tituloDoCartao(1, "x".repeat(300), "y").length).toBe(200);
  });

  it("a descrição escapa o título do processo", () => {
    expect(descricaoDoCartao(3, "<b>Filial</b>")).toContain("<p>&lt;b&gt;Filial&lt;/b&gt;</p>");
    expect(descricaoDoCartao(3, null)).not.toContain("<p></p>");
  });

  const atual = { title: "Nº 1 · Baixa — A", priority: 0, entityId: "e1", stageId: "s1", responsaveis: ["u1"] };

  it("cartão que já espelha o processo não muda", () => {
    expect(ajusteVazio(ajusteDoCartao(atual, { title: atual.title, priority: 0, entityId: "e1", stageId: null, responsavel: "u1" }))).toBe(true);
  });

  it("troca o que difere, e o responsável do processo é o único do cartão", () => {
    const a = ajusteDoCartao({ ...atual, responsaveis: ["u1", "u9"] }, { title: "Nº 1 · Baixa — B", priority: 2, entityId: "e2", stageId: "s2", responsavel: "u2" });
    expect(a.dados).toEqual({ title: "Nº 1 · Baixa — B", priority: 2, entityType: "COMPANY", entityId: "e2", stageId: "s2" });
    expect(a.tirar).toEqual(["u1", "u9"]);
    expect(a.por).toEqual(["u2"]);
  });

  it("processo sem responsável deixa o cartão sem responsável", () => {
    expect(ajusteDoCartao(atual, { title: atual.title, priority: 0, entityId: "e1", stageId: null, responsavel: null }).tirar).toEqual(["u1"]);
  });
});

it("cada situação tem nome e cor", () => {
  const chaves: ChaveDaColuna[] = TODAS;
  expect(new Set(chaves).size).toBe(7);
  for (const c of COLUNAS_DO_PROCESSO) {
    expect(c.nome.length).toBeGreaterThan(0);
    expect(c.cor).toMatch(/^#[0-9A-F]{6}$/);
  }
});
