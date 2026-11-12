// Testes-gabarito do serviço da conciliação Razão × extrato (porte de `conciliar_razao_extrato`,
// 12/11/2026).
//
// `gabarito/servico-conciliacao-*.json` foi gerado por `scripts/contabil-core/gabarito_servico_conciliacao.py`:
// as chamadas feitas pela suíte de integração do original e os casos inventados para cada ramo (CNPJ,
// conta contábil vinculada, período, cobertura do extrato, SISPAG, aplicação automática,
// parcelamento, duplicidades, composição dos lotes). Cada caso traz o que a função leu do banco e a
// saída exata: o relatório como a rota o devolve (JSON do pydantic) ou a frase da recusa. Se um
// gabarito falhar, o porte está errado, e não o gabarito.

import { describe, expect, test } from "vitest";
import { dec } from "../motor/decimal";
import { casosServico, entradaDoCaso, relatorioDoGabarito } from "./gabarito/servicoConciliacao";
import { relatorioDoJson, relatorioParaJson } from "./relatorio";
import { CONTA_BANCARIA_NAO_ENCONTRADA, dataBr, reais, relatorioDaConciliacao } from "./servico";

const casos = casosServico();

describe("gabarito do serviço da conciliação (saída do Python)", () => {
  test("o gabarito cobre a suíte, os ramos dirigidos e os sorteados", () => {
    expect(casos.filter((c) => c.origem === "suite").length).toBeGreaterThanOrEqual(10);
    expect(casos.filter((c) => c.origem === "dirigido").length).toBeGreaterThan(50);
    expect(casos.filter((c) => c.origem === "sorteado").length).toBeGreaterThan(100);
    expect(casos.filter((c) => c.erro).length).toBeGreaterThan(20);
    const avisos = casos.flatMap((c) => (c.relatorio?.avisos as string[] | undefined) ?? []);
    for (const comeco of ["A conta bancária", "A consulta do SISPAG enviada", "O extrato importado vai", "O extrato importado não traz", "Possível parcelamento"]) {
      expect(avisos.some((a) => a.startsWith(comeco)), comeco).toBe(true);
    }
  });

  test("cada chamada dá o mesmo relatório, ou a mesma recusa", () => {
    for (const caso of casos) {
      const r = relatorioDaConciliacao(entradaDoCaso(caso.entrada));
      const contexto = `caso ${caso.id} (${caso.origem})`;
      if (caso.erro) {
        expect(r, contexto).toEqual({ ok: false, erro: caso.erro.mensagem });
      } else {
        expect(r.ok, contexto).toBe(true);
        if (r.ok) expect(relatorioParaJson(r.valor), contexto).toEqual(relatorioDoGabarito(caso.relatorio!));
      }
    }
  }, 120_000);

  test("o JSON volta ao relatório sem perder nada", () => {
    for (const caso of casos) {
      if (!caso.relatorio) continue;
      const json = relatorioDoGabarito(caso.relatorio);
      expect(relatorioParaJson(relatorioDoJson(json)), `caso ${caso.id}`).toEqual(json);
    }
  });
});

describe("detalhes do porte", () => {
  test("conta bancária de outra empresa", () => {
    const [caso] = casos.filter((c) => c.entrada.agencia === null);
    expect(caso.erro?.mensagem).toBe(CONTA_BANCARIA_NAO_ENCONTRADA);
  });

  test("formatos do Python", () => {
    expect(reais(dec("1234567.891"))).toBe("R$ 1.234.567,89");
    expect(reais(dec("0"))).toBe("R$ 0,00");
    expect(dataBr("2025-02-03")).toBe("03/02/2025");
  });
});
