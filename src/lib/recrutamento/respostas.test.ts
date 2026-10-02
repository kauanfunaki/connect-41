import { describe, expect, it } from "vitest";

import { aplicarRespostas, divergenciasDoPortal, faltaPerguntar, lerFonte, respostaComoTexto, resumoDasRespostas, validarRespostas } from "./respostas";

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
  it("o WhatsApp não sobrescreve o que o candidato respondeu no portal, só preenche o vazio (C2)", () => {
    const fonte = { pretensaoSalarial: { origem: "PORTAL" as const, em: "2026-09-22T10:00:00Z" } };
    const r = aplicarRespostas(fonte, { pretensaoSalarial: 5000, disponibilidade: "imediata" }, "WHATSAPP", AGORA);
    expect(r.dados).toEqual({ disponibilidade: "imediata" });
    expect(r.preservados).toEqual(["pretensaoSalarial"]);
    expect(r.fonte.pretensaoSalarial?.origem).toBe("PORTAL");
  });
  it("o recrutador sobrescreve também o que veio do portal", () => {
    const fonte = { pretensaoSalarial: { origem: "PORTAL" as const, em: "2026-09-22T10:00:00Z" } };
    expect(aplicarRespostas(fonte, { pretensaoSalarial: 4100 }, "RECRUTADOR", AGORA).dados).toEqual({ pretensaoSalarial: 4100 });
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

describe("respostas vindas do portal", () => {
  // Até 02/10/2026 o WhatsApp atualizava a resposta do portal; a decisão do C2
  // do roteiro inverteu: o portal prevalece e a diferença vai ao recrutador.
  it("são lidas como PORTAL e o WhatsApp não as troca", () => {
    expect(lerFonte({ disponibilidade: { origem: "PORTAL", em: "2026-09-23" } })).toEqual({
      disponibilidade: { origem: "PORTAL", em: "2026-09-23" },
    });
    const r = aplicarRespostas({ disponibilidade: { origem: "PORTAL", em: "x" } }, { disponibilidade: "em 15 dias" }, "WHATSAPP", new Date("2026-09-24T12:00:00Z"));
    expect(r.gravados).toEqual([]);
    expect(r.preservados).toEqual(["disponibilidade"]);
  });
});

describe("divergenciasDoPortal", () => {
  const fonte = {
    pretensaoSalarial: { origem: "PORTAL" as const, em: "x" },
    disponibilidade: { origem: "PORTAL" as const, em: "x" },
    deslocamentoMinutos: { origem: "WHATSAPP" as const, em: "x" },
  };
  const atuais = { pretensaoSalarial: 4000, disponibilidade: "imediata", deslocamentoMinutos: 20 };

  it("aponta só o que veio do portal e o WhatsApp disse diferente", () => {
    expect(divergenciasDoPortal(fonte, atuais, { pretensaoSalarial: 5000, disponibilidade: "imediata", deslocamentoMinutos: 40 })).toEqual([
      "pretensaoSalarial",
    ]);
  });
  it("valor igual não é divergência", () => {
    expect(divergenciasDoPortal(fonte, atuais, { pretensaoSalarial: 4000 })).toEqual([]);
  });
  it("texto curto de cada resposta", () => {
    // Intl separa "R$" do número com espaço não separável.
    expect(respostaComoTexto("pretensaoSalarial", 5000)).toMatch(/^R\$\s5\.000$/);
    expect(respostaComoTexto("deslocamentoMinutos", 30)).toBe("30 min");
    expect(respostaComoTexto("disponibilidade", null)).toBe("—");
  });
});
