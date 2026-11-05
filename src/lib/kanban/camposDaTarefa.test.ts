import { describe, expect, it } from "vitest";
import { datasNoCampo, extrasVisiveis, OPCOES_DE_PRIORIDADE, prioridadeNoCampo, ROTULO_DA_PRIORIDADE, VAZIO } from "./camposDaTarefa";

describe("a tarefa recém-criada abre com tudo Vazio", () => {
  it("sem datas: Vazio", () => {
    expect(datasNoCampo(null, null)).toBe(VAZIO);
  });

  it("com uma data só, a outra ponta fica nomeada", () => {
    expect(datasNoCampo(null, "2026-11-20T00:00:00.000Z")).toMatch(/^Início → 20/);
    expect(datasNoCampo("2026-11-03", null)).toMatch(/^03 .* → Vencimento$/);
  });

  it("com as duas: início → vencimento, pelo dia do calendário", () => {
    // Meia-noite UTC não pode virar o dia anterior no fuso de São Paulo.
    expect(datasNoCampo("2026-11-03T00:00:00.000Z", "2026-11-20T00:00:00.000Z")).toMatch(/^03 .* → 20 /);
  });

  it("prioridade 0 é Vazio; as outras pelo nome", () => {
    expect(prioridadeNoCampo(0)).toBe(VAZIO);
    expect(prioridadeNoCampo(1)).toBe("Alta");
    expect(prioridadeNoCampo(2)).toBe("Urgente");
  });

  it("o menu vai da mais forte até Sem prioridade — Normal não existe mais", () => {
    expect(OPCOES_DE_PRIORIDADE.map((p) => ROTULO_DA_PRIORIDADE[p])).toEqual(["Urgente", "Alta", "Sem prioridade"]);
  });
});

describe("Adicionar campo", () => {
  it("os extras ficam escondidos vazios", () => {
    expect([...extrasVisiveis({ participantes: false, estimativa: false }, [])]).toEqual([]);
  });

  it("aparecem preenchidos ou pedidos", () => {
    expect([...extrasVisiveis({ participantes: true, estimativa: false }, [])]).toEqual(["participantes"]);
    expect([...extrasVisiveis({ participantes: false, estimativa: false }, ["estimativa"])]).toEqual(["estimativa"]);
  });
});
