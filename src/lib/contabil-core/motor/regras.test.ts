// A ordem das regras e a escolha da regra vinham do SQL (`_carregar_regras`) e do laço de
// `_encontrar_regra` em `neo/engine.py`, que dependem do banco e por isso não estão no gabarito. Estes
// testes descrevem o mesmo comportamento, com os casos dos comentários do original.

import { describe, expect, test } from "vitest";
import { encontrarRegra, ordenarRegras, type RegraDoMotor } from "./regras";

const AG1 = "11111111-1111-4111-8111-111111111111";
const AG2 = "22222222-2222-4222-8222-222222222222";

function regra(id: string, historico: string, agenciaId: string | null = null, dc: "D" | "C" = "D"): RegraDoMotor {
  return { id, historico, agenciaId, dc };
}

describe("ordem das regras (ORDER BY agencia_id IS NULL, length(historico) DESC, id)", () => {
  test("regra da agência vem antes da global, mesmo sendo mais curta", () => {
    const ordem = ordenarRegras([regra("a", "TARIFA PACOTE DE SERVICOS"), regra("b", "TARIFA", AG1)]);
    expect(ordem.map((r) => r.id)).toEqual(["b", "a"]);
  });

  test("dentro do escopo, o histórico mais longo primeiro; empate pelo menor id", () => {
    const ordem = ordenarRegras([regra("c", "PIX"), regra("b", "PIX ENVIADO"), regra("a", "PIX")]);
    expect(ordem.map((r) => r.id)).toEqual(["b", "a", "c"]);
  });

  test("comprimento em caracteres, como o length() do PostgreSQL (não em bytes)", () => {
    // "AÇÃO" tem 4 caracteres e 6 bytes; "ACAOX" tem 5 dos dois.
    const ordem = ordenarRegras([regra("a", "AÇÃO"), regra("b", "ACAOX")]);
    expect(ordem.map((r) => r.id)).toEqual(["b", "a"]);
  });
});

describe("escolha da regra", () => {
  const t = { agenciaId: AG1, historico: "TARIFA COM R LIQUIDAÇÃO", dc: "D" as const };

  test("estratégia vence a ordem: uma exata ganha de uma substring anterior", () => {
    const regras = ordenarRegras([regra("a", "TARIFA", AG1), regra("b", "tarifa com r liquidacao")]);
    expect(encontrarRegra(t, regras)).toMatchObject({ regra: { id: "b" }, estrategia: "exato" });
  });

  test("na mesma estratégia, a primeira da ordem vence (agência antes da global)", () => {
    const regras = ordenarRegras([regra("g", "TARIFA COM"), regra("a", "TARIFA", AG1)]);
    expect(encontrarRegra(t, regras)).toMatchObject({ regra: { id: "a" }, estrategia: "substring" });
  });

  test("todas as palavras, em qualquer ordem", () => {
    expect(encontrarRegra(t, [regra("a", "liquidacao tarifa")])).toMatchObject({ estrategia: "todas_palavras" });
  });

  test("regra de outra agência ou de outra natureza não vale", () => {
    expect(encontrarRegra(t, [regra("a", "TARIFA", AG2)])).toBeNull();
    expect(encontrarRegra(t, [regra("a", "TARIFA", null, "C")])).toBeNull();
  });

  test("a regra global vale para qualquer agência", () => {
    expect(encontrarRegra(t, [regra("a", "TARIFA")])).toMatchObject({ regra: { id: "a" } });
  });
});
