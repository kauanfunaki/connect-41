// O comportamento do NEO que dependia do banco no original (`neo/engine.py`), descrito com os casos
// dos comentários e dos testes de integração de lá (`tests/integration/test_neo.py`).

import { describe, expect, test } from "vitest";
import { dec } from "./decimal";
import { codigoContaSintetica, decidir, historicoManual, pernas, type ContextoDoNeo, type ContraparteDoNeo, type RegraDoNeo } from "./neo";
import { ordenarRegras } from "./regras";

const AG = "11111111-1111-4111-8111-111111111111";

function regra(id: string, historico: string, extra: Partial<RegraDoNeo> = {}): RegraDoNeo {
  return { id, historico, agenciaId: null, dc: "D", contaId: `conta-${id}`, descricao: `Regra ${id}`, manterHistorico: false, tipo: "automatica", ...extra };
}

function contraparte(id: string, documento: string, razaoSocial: string, extra: Partial<ContraparteDoNeo> = {}): ContraparteDoNeo {
  return { id, documento, razaoSocial, nomeFantasia: null, tipo: "fornecedor", origem: "manual", contaContabilId: `conta-${id}`, ...extra };
}

function ctx(regras: RegraDoNeo[] = [], contrapartes: ContraparteDoNeo[] = [], cnpjDaEmpresa: string | null = "12.345.678/0001-95"): ContextoDoNeo {
  return { regras: ordenarRegras(regras), contrapartes, cnpjDaEmpresa };
}

function transacao(historico: string, valor = "10.00", dc: "D" | "C" = "D") {
  return { id: "t1", agenciaId: AG, historico, dc, valor: dec(valor) };
}

describe("NEO: decisão por transação", () => {
  test("valor suspeito vai para a quarentena antes de qualquer regra", () => {
    const d = decidir(transacao("18/02/2026 TARIFA COM R LIQUIDACAO COB000001 -1,19 -54.881,83", "54881.83"), ctx([regra("a", "TARIFA")]));
    expect(d.tipo).toBe("valor_suspeito");
    if (d.tipo === "valor_suspeito") expect(d.motivo).toMatch(/^Valor não confiável: o valor lido \(R\$ 54\.881,83\) é o último número/);
  });

  test("regra: histórico da regra (descrição) ou o do extrato, com manter_historico", () => {
    const d1 = decidir(transacao("TARIFA PACOTE"), ctx([regra("a", "TARIFA")]));
    expect(d1).toMatchObject({ tipo: "regra", estrategia: "substring", motivo: "Regra 'TARIFA' (substring)", partidas: { historico: "Regra a", tipoRegra: "automatica" } });
    const d2 = decidir(transacao("TARIFA PACOTE"), ctx([regra("a", "TARIFA", { manterHistorico: true })]));
    expect(d2).toMatchObject({ tipo: "regra", partidas: { historico: "TARIFA PACOTE" } });
  });

  test("regra com contraparte no histórico: a contraparte é só medida (sombra), nunca aplicada", () => {
    const d = decidir(
      transacao("PAGAMENTO PIX 09033833000123 PERFORMANCE ENGENHA PIX_DEB"),
      ctx([regra("a", "PAGAMENTO PIX")], [contraparte("c", "09033833000123", "Performance Engenharia Ltda")]),
    );
    expect(d).toMatchObject({ tipo: "regra", partidas: { contaId: "conta-a" }, sombra: { contraparteId: "c", origemEvidencia: "historico", contaDivergente: true } });
  });

  test("sem regra, o CNPJ impresso no histórico classifica pela contraparte", () => {
    const d = decidir(transacao("PAGAMENTO PIX 09033833000123 PERFORMANCE ENGENHA PIX_DEB"), ctx([], [contraparte("c", "09033833000123", "Performance Engenharia Ltda")]));
    expect(d).toMatchObject({
      tipo: "contraparte",
      origemEvidencia: "historico",
      partidas: { contaId: "conta-c", historico: "PGTO REF PERFORMANCE ENGENHARIA LTDA", tipoRegra: "contraparte" },
      motivo: "Contraparte 'Performance Engenharia Ltda' identificada via historico (documento 09033833000123)",
    });
  });

  test("o CNPJ da própria empresa não vira contraparte", () => {
    const d = decidir(transacao("TRANSF 12.345.678/0001-95 MESMA TITULARIDADE"), ctx([], [contraparte("c", "12345678000195", "Nós Mesmos Ltda")]));
    expect(d.tipo).toBe("sem_regra");
  });

  test("documentos de duas contrapartes na linha: recusa e explica no motivo", () => {
    const d = decidir(
      transacao("LIQUIDACAO BOLETO 31052957000105 PARA 09033833000123"),
      ctx([], [contraparte("a", "31052957000105", "Banco Cooperativo"), contraparte("b", "09033833000123", "Performance Engenharia")]),
    );
    expect(d.tipo).toBe("sem_regra");
    if (d.tipo === "sem_regra") expect(d.motivo).toContain("documentos de mais de uma contraparte cadastrada (Banco Cooperativo, Performance Engenharia)");
  });

  test("pelo nome, sem documento: recebimento usa o prefixo REC", () => {
    const d = decidir(transacao("PIX RECEBIDO FORCECAR AUTOMOTIVE", "50.00", "C"), ctx([], [contraparte("c", "11222333000181", "Forcecar Automotive Ltda.", { tipo: "ambos" })]));
    expect(d).toMatchObject({ tipo: "contraparte", origemEvidencia: "nome", partidas: { historico: "REC REF FORCECAR AUTOMOTIVE LTDA.", dc: "C" } });
  });

  test("relatório fiscal com fornecedor e cliente: a direção escolhe a conta", () => {
    const cps = [
      contraparte("f", "11222333000181", "Acme", { tipo: "fornecedor", origem: "relatorio_fiscal" }),
      contraparte("k", "11222333000181", "Acme", { tipo: "cliente", origem: "relatorio_fiscal" }),
    ];
    expect(decidir(transacao("TED 11.222.333/0001-81"), ctx([], cps))).toMatchObject({ contraparte: { id: "f" } });
    expect(decidir(transacao("TED 11.222.333/0001-81", "1.00", "C"), ctx([], cps))).toMatchObject({ contraparte: { id: "k" } });
  });

  test("nada casa: sem_regra com o motivo do original", () => {
    expect(decidir(transacao("ALGO NOVO"), ctx())).toEqual({ tipo: "sem_regra", motivo: "Nenhuma regra encontrada para 'ALGO NOVO' (dc=D)", recusa: null });
  });
});

describe("NEO: partidas e classificação manual", () => {
  test("duas pernas, a do banco com o lado oposto e 'Contrapartida bancária:'", () => {
    const [a, b] = pernas({ contaId: "x", descricao: "Tarifa  bancária", historico: "tarifa  pacote", dc: "D", tipoRegra: "automatica" }, "banco", "TARIFA PACOTE 123");
    expect(a).toEqual({ contaId: "x", descricao: "TARIFA BANCÁRIA", historico: "TARIFA PACOTE", historicoExtrato: "TARIFA PACOTE 123", tipoRegra: "automatica", dc: "D" });
    expect(b).toMatchObject({ contaId: "banco", descricao: "CONTRAPARTIDA BANCÁRIA: TARIFA BANCÁRIA", dc: "C" });
  });

  test("conta sintética da agência sem conta contábil", () => {
    expect(codigoContaSintetica("9a8b7c6d-5e4f-4a3b-8c2d-1e0f9a8b7c6d")).toBe("1.1.B.9a8b7c6d5e4f4a3b");
  });

  test("histórico manual: o digitado, ou a linha do banco; vazio bloqueia", () => {
    expect(historicoManual({ historico: "PIX X" }, "ALUGUEL", false)).toBe("ALUGUEL");
    expect(historicoManual({ historico: "PIX X" }, "ALUGUEL", true)).toBe("PIX X");
    expect(historicoManual({ historico: "PIX X" }, "   ", false)).toBeNull();
  });
});
