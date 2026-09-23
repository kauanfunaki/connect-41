import { describe, expect, it } from "vitest";

import { aplicarRespostas, faltaPerguntar, lerFonte, resumoDasRespostas, validarRespostas } from "./respostas";

const AGORA = new Date("2026-09-23T15:00:00Z");

describe("validarRespostas", () => {
  it("aproveita o que é válido e devolve o fora da faixa como descartado", () => {
    expect(validarRespostas({ pretensaoSalarial: "2500.5", disponibilidade: "  imediata  ", deslocamentoMinutos: 40.4 })).toEqual({
      valores: { pretensaoSalarial: 2500.5, disponibilidade: "imediata", deslocamentoMinutos: 40 },
      descartados: [],
    });
    expect(validarRespostas({ pretensaoSalarial: -1, deslocamentoMinutos: 9999 })).toEqual({
      valores: {},
      descartados: ["pretensaoSalarial", "deslocamentoMinutos"],
    });
  });
  it("ignora campo nulo ou ausente — o modelo manda null no que ainda não sabe", () => {
    expect(validarRespostas({ pretensaoSalarial: null, disponibilidade: null, deslocamentoMinutos: null })).toEqual({ valores: {}, descartados: [] });
    expect(validarRespostas({ endereco: "Rua X" }).valores).toEqual({});
  });
});

describe("aplicarRespostas", () => {
  it("o bot não sobrescreve o que o recrutador corrigiu", () => {
    const fonte = { pretensaoSalarial: { origem: "RECRUTADOR" as const, em: "2026-09-22T10:00:00Z" } };
    const r = aplicarRespostas(fonte, { pretensaoSalarial: 5000, deslocamentoMinutos: 30 }, "WHATSAPP", AGORA);
    expect(r.dados).toEqual({ deslocamentoMinutos: 30 });
    expect(r.preservados).toEqual(["pretensaoSalarial"]);
    expect(r.fonte.pretensaoSalarial?.origem).toBe("RECRUTADOR");
    expect(r.fonte.deslocamentoMinutos).toEqual({ origem: "WHATSAPP", em: AGORA.toISOString() });
  });
  it("o recrutador sobrescreve o que veio do bot", () => {
    const fonte = { pretensaoSalarial: { origem: "WHATSAPP" as const, em: "2026-09-22T10:00:00Z" } };
    const r = aplicarRespostas(fonte, { pretensaoSalarial: 3200 }, "RECRUTADOR", AGORA);
    expect(r.dados).toEqual({ pretensaoSalarial: 3200 });
    expect(r.fonte.pretensaoSalarial?.origem).toBe("RECRUTADOR");
  });
});

describe("faltaPerguntar e lerFonte", () => {
  it("lista só o que ainda está vazio", () => {
    expect(faltaPerguntar({ pretensaoSalarial: 2000, disponibilidade: null, deslocamentoMinutos: 0 })).toEqual(["disponibilidade"]);
  });
  it("descarta fonte malformada", () => {
    expect(lerFonte({ pretensaoSalarial: { origem: "HACK", em: "x" }, disponibilidade: { origem: "WHATSAPP", em: "2026-09-23" } })).toEqual({
      disponibilidade: { origem: "WHATSAPP", em: "2026-09-23" },
    });
    expect(lerFonte(null)).toEqual({});
  });
});

describe("resumoDasRespostas", () => {
  it("junta o que existe, na ordem pretensão · deslocamento · disponibilidade", () => {
    expect(resumoDasRespostas({ pretensaoSalarial: 2500, disponibilidade: "imediata", deslocamentoMinutos: 30 })).toBe("R$ 2.500 · 30 min até o local · imediata");
    expect(resumoDasRespostas({ pretensaoSalarial: null, disponibilidade: null, deslocamentoMinutos: 0 })).toBe("0 min até o local");
    expect(resumoDasRespostas({ pretensaoSalarial: null, disponibilidade: null, deslocamentoMinutos: null })).toBeNull();
  });
});
