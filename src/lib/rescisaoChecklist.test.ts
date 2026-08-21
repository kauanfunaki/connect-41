import { describe, expect, it } from "vitest";
import {
  RESCISAO_CHECKLIST,
  RESCISAO_CHECK_KEYS,
  getRescisaoItem,
  itemsByGroup,
  prazoPagamento,
  statusPrazoPagamento,
  resumirConferencia,
} from "./rescisaoChecklist";

describe("RESCISAO_CHECKLIST", () => {
  it("tem chaves únicas e todos os grupos representados", () => {
    expect(new Set(RESCISAO_CHECK_KEYS).size).toBe(RESCISAO_CHECKLIST.length);
    expect(itemsByGroup("VERBAS").length).toBeGreaterThan(0);
    expect(itemsByGroup("DESCONTOS").length).toBeGreaterThan(0);
    expect(itemsByGroup("MEDIAS").length).toBeGreaterThan(0);
    expect(itemsByGroup("PRAZOS_DOCS").length).toBeGreaterThan(0);
  });

  it("itens de prazo/documento não pedem valor monetário", () => {
    expect(itemsByGroup("PRAZOS_DOCS").every((i) => !i.hasValue)).toBe(true);
  });

  it("verbas e médias sempre pedem valor", () => {
    expect(itemsByGroup("VERBAS").every((i) => i.hasValue)).toBe(true);
    expect(itemsByGroup("MEDIAS").every((i) => i.hasValue)).toBe(true);
  });

  it("getRescisaoItem resolve por chave", () => {
    expect(getRescisaoItem("saldo_salario")?.label).toBe("Saldo de salário");
    expect(getRescisaoItem("inexistente")).toBeUndefined();
  });
});

describe("prazo de pagamento (CLT art. 477 §6)", () => {
  it("soma 10 dias corridos, atravessando o fim do mês", () => {
    // 25/01 + 10 = 04/02
    expect(prazoPagamento(new Date("2026-01-25T00:00:00Z")).toISOString().slice(0, 10)).toBe("2026-02-04");
  });

  it("atravessa a virada de ano", () => {
    expect(prazoPagamento(new Date("2025-12-28T00:00:00Z")).toISOString().slice(0, 10)).toBe("2026-01-07");
  });

  it("classifica no prazo, vence hoje e vencido", () => {
    const term = new Date("2026-08-01T00:00:00Z"); // vence 11/08
    expect(statusPrazoPagamento(term, new Date("2026-08-05T00:00:00Z"))).toMatchObject({
      diasRestantes: 6,
      status: "NO_PRAZO",
    });
    expect(statusPrazoPagamento(term, new Date("2026-08-11T00:00:00Z"))).toMatchObject({
      diasRestantes: 0,
      status: "VENCE_HOJE",
    });
    expect(statusPrazoPagamento(term, new Date("2026-08-14T00:00:00Z"))).toMatchObject({
      diasRestantes: -3,
      status: "VENCIDO",
    });
  });

  it("ignora hora do dia na contagem", () => {
    const term = new Date("2026-08-01T00:00:00Z");
    const manha = statusPrazoPagamento(term, new Date("2026-08-11T08:00:00Z"));
    const noite = statusPrazoPagamento(term, new Date("2026-08-11T23:30:00Z"));
    expect(manha.diasRestantes).toBe(noite.diasRestantes);
  });
});

describe("resumirConferencia", () => {
  it("conferência vazia = tudo pendente", () => {
    const r = resumirConferencia([]);
    expect(r.pendentes).toBe(RESCISAO_CHECK_KEYS.length);
    expect(r.conferidos).toBe(0);
    expect(r.completa).toBe(false);
    expect(r.progressoPct).toBe(0);
  });

  it("conta cada status e considera NAO_APLICAVEL como tratado", () => {
    const r = resumirConferencia([
      { itemKey: "saldo_salario", status: "CONFERIDO" },
      { itemKey: "ferias_vencidas", status: "DIVERGENTE" },
      { itemKey: "fgts_multa", status: "NAO_APLICAVEL" },
    ]);
    expect(r.conferidos).toBe(1);
    expect(r.divergentes).toBe(1);
    expect(r.naoAplicaveis).toBe(1);
    expect(r.pendentes).toBe(RESCISAO_CHECK_KEYS.length - 3);
    expect(r.progressoPct).toBe(Math.round((3 / RESCISAO_CHECK_KEYS.length) * 100));
  });

  it("completa quando nenhum item está pendente — divergência não bloqueia", () => {
    const todos = RESCISAO_CHECK_KEYS.map((k, i) => ({
      itemKey: k,
      status: i === 0 ? "DIVERGENTE" : "CONFERIDO",
    }));
    const r = resumirConferencia(todos);
    expect(r.pendentes).toBe(0);
    expect(r.completa).toBe(true);
    expect(r.divergentes).toBe(1);
    expect(r.progressoPct).toBe(100);
  });

  it("ignora chave desconhecida (item removido do catálogo depois de conferido)", () => {
    const r = resumirConferencia([{ itemKey: "item_que_nao_existe_mais", status: "CONFERIDO" }]);
    expect(r.conferidos).toBe(0);
    expect(r.pendentes).toBe(RESCISAO_CHECK_KEYS.length);
  });
});
