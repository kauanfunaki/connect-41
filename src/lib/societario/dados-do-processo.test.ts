import { describe, it, expect } from "vitest";
import { lerDadosDoProcesso, prazoCombinado, MAX_TITULO } from "./dados-do-processo";

const EQUIPE = new Set(["u-ana", "u-bruno"]);

describe("lerDadosDoProcesso", () => {
  it("formulário vazio vira processo sem título, sem responsável, prioridade normal e sem prazo", () => {
    expect(lerDadosDoProcesso({}, EQUIPE)).toEqual({
      ok: true,
      dados: { titulo: null, responsavelId: null, prioridade: "NORMAL", prazoCombinado: null },
    });
  });

  it("lê todos os campos preenchidos", () => {
    expect(
      lerDadosDoProcesso(
        { titulo: "  Filial Pinhais  ", responsavelId: "u-ana", prioridade: "URGENTE", prazoCombinado: "2026-09-30" },
        EQUIPE
      )
    ).toEqual({
      ok: true,
      dados: {
        titulo: "Filial Pinhais",
        responsavelId: "u-ana",
        prioridade: "URGENTE",
        prazoCombinado: new Date("2026-09-30T12:00:00Z"),
      },
    });
  });

  // O select mostra só quem pode, mas o formulário é texto: um id de fora da
  // equipe (ou de outro tenant) tem de ser recusado aqui.
  it("recusa responsável que não é do setor", () => {
    const r = lerDadosDoProcesso({ responsavelId: "u-de-outro-tenant" }, EQUIPE);
    expect(r.ok).toBe(false);
  });

  it("recusa prioridade desconhecida, título longo e prazo inválido", () => {
    expect(lerDadosDoProcesso({ prioridade: "ALTISSIMA" }, EQUIPE).ok).toBe(false);
    expect(lerDadosDoProcesso({ titulo: "x".repeat(MAX_TITULO + 1) }, EQUIPE).ok).toBe(false);
    expect(lerDadosDoProcesso({ prazoCombinado: "30/09/2026" }, EQUIPE).ok).toBe(false);
  });

  it("título no limite passa", () => {
    expect(lerDadosDoProcesso({ titulo: "x".repeat(MAX_TITULO) }, EQUIPE).ok).toBe(true);
  });
});

describe("prazoCombinado", () => {
  const HOJE = new Date("2026-09-15T15:00:00-03:00");
  const dia = (d: string) => new Date(`${d}T12:00:00Z`);

  it("conta por dia de calendário em São Paulo", () => {
    expect(prazoCombinado(dia("2026-09-15"), HOJE)).toMatchObject({ dias: 0, situacao: "hoje" });
    expect(prazoCombinado(dia("2026-09-16"), HOJE)).toMatchObject({ dias: 1, situacao: "proximo", texto: "prazo vence amanhã" });
    expect(prazoCombinado(dia("2026-09-18"), HOJE)).toMatchObject({ dias: 3, situacao: "proximo" });
    expect(prazoCombinado(dia("2026-09-19"), HOJE)).toMatchObject({ dias: 4, situacao: "folga" });
  });

  it("vencido diz há quantos dias", () => {
    expect(prazoCombinado(dia("2026-09-14"), HOJE)).toMatchObject({ situacao: "vencido", texto: "prazo venceu ontem" });
    expect(prazoCombinado(dia("2026-09-10"), HOJE)).toMatchObject({ situacao: "vencido", texto: "prazo venceu há 5 dias" });
  });
});
