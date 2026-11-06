import { describe, expect, it } from "vitest";
import { deslocarPeriodo, intervaloDoResumo, montarResumo, resumoEmTexto, type ItemParaResumo } from "./resumo";

describe("intervaloDoResumo", () => {
  it("dia, semana (segunda a domingo), mês e ano, da meia-noite de São Paulo", () => {
    expect(intervaloDoResumo("dia", "2026-11-06")).toMatchObject({ primeiroDia: "2026-11-06", ultimoDia: "2026-11-06", rotulo: "06/11/2026" });
    expect(intervaloDoResumo("dia", "2026-11-06").inicio.toISOString()).toBe("2026-11-06T03:00:00.000Z");
    expect(intervaloDoResumo("dia", "2026-11-06").fim.toISOString()).toBe("2026-11-07T03:00:00.000Z");
    // 06/11/2026 é sexta-feira: a semana vai de 02/11 (segunda) a 08/11 (domingo).
    expect(intervaloDoResumo("semana", "2026-11-06")).toMatchObject({ primeiroDia: "2026-11-02", ultimoDia: "2026-11-08", rotulo: "02/11 a 08/11/2026" });
    expect(intervaloDoResumo("semana", "2026-11-08").primeiroDia).toBe("2026-11-02");
    expect(intervaloDoResumo("semana", "2026-11-09").primeiroDia).toBe("2026-11-09");
    expect(intervaloDoResumo("mes", "2026-11-06")).toMatchObject({ primeiroDia: "2026-11-01", ultimoDia: "2026-11-30", rotulo: "novembro de 2026" });
    expect(intervaloDoResumo("ano", "2026-11-06")).toMatchObject({ primeiroDia: "2026-01-01", ultimoDia: "2026-12-31", rotulo: "2026" });
  });

  it("semana na virada do ano mostra os dois anos", () => {
    expect(intervaloDoResumo("semana", "2026-12-31")).toMatchObject({ primeiroDia: "2026-12-28", ultimoDia: "2027-01-03", rotulo: "28/12/2026 a 03/01/2027" });
  });

  it("anda para o período anterior e para o seguinte", () => {
    expect(deslocarPeriodo("dia", "2026-11-01", -1)).toBe("2026-10-31");
    expect(deslocarPeriodo("semana", "2026-11-06", 1)).toBe("2026-11-09");
    expect(deslocarPeriodo("mes", "2026-01-31", -1)).toBe("2025-12-01");
    expect(deslocarPeriodo("ano", "2026-11-06", 1)).toBe("2027-01-01");
  });
});

describe("montarResumo", () => {
  const intervalo = intervaloDoResumo("semana", "2026-11-06"); // 02/11 a 08/11
  const item = (id: string, status: ItemParaResumo["status"], extra: Partial<ItemParaResumo> = {}): ItemParaResumo => ({
    id, title: `Item ${id}`, type: "BUG", status, priority: 1, systemName: null, assigneeName: null, dueDate: null, prUrl: null, createdAt: new Date("2026-10-01T12:00:00Z"), ...extra,
  });
  const sit = (itemId: string, quando: string, de: string | null, para: string) => ({ itemId, createdAt: new Date(quando), changes: [{ field: "Situação", before: de, after: para }] });

  it("separa concluídos, em andamento, planejados e cancelados pelo histórico", () => {
    const itens = [
      item("feito", "DONE", { prUrl: "https://github.com/x/y/pull/1" }),
      item("feito-antes", "DONE"),
      item("andando", "IN_PROGRESS", { priority: 2 }),
      item("parado", "VALIDATION"),
      item("novo", "PENDING", { createdAt: new Date("2026-11-03T15:00:00Z") }),
      item("com-prazo", "PENDING", { dueDate: "2026-11-07" }),
      item("pendente-velho", "PENDING", { dueDate: "2026-12-01" }),
      item("cancelado", "CANCELED"),
    ];
    const mudancas = [
      sit("feito", "2026-11-04T13:00:00Z", "Em validação", "Concluído"),
      sit("feito-antes", "2026-10-20T13:00:00Z", "Em andamento", "Concluído"),
      sit("andando", "2026-11-05T13:00:00Z", "Pendente", "Em andamento"),
      sit("parado", "2026-10-15T13:00:00Z", "Em andamento", "Em validação"),
      sit("cancelado", "2026-11-02T03:30:00Z", "Pendente", "Cancelado"),
    ];
    const r = montarResumo(itens, mudancas, intervalo);
    expect(r.concluidos.map((i) => i.id)).toEqual(["feito"]);
    expect(r.emAndamento.map((i) => [i.id, i.mexidoNoPeriodo])).toEqual([["andando", true], ["parado", false]]);
    expect(r.planejados.map((i) => [i.id, i.entrouNoPeriodo, i.prazoNoPeriodo])).toEqual([["com-prazo", false, true], ["novo", true, false]]);
    expect(r.cancelados.map((i) => i.id)).toEqual(["cancelado"]);
  });

  it("concluído duas vezes vale a última; reaberto e concluído fora do período não entra", () => {
    const itens = [item("a", "DONE")];
    expect(montarResumo(itens, [sit("a", "2026-11-03T12:00:00Z", "Em andamento", "Concluído"), sit("a", "2026-11-10T12:00:00Z", "Em andamento", "Concluído")], intervalo).concluidos).toEqual([]);
  });

  it("o texto para colar agrupa e leva o link e o PR", () => {
    const r = montarResumo([item("feito", "DONE", { prUrl: "https://github.com/x/y/pull/1" })], [sit("feito", "2026-11-04T13:00:00Z", "Em validação", "Concluído")], intervalo);
    expect(resumoEmTexto(intervalo.rotulo, r, (id) => `https://app/ci/${id}`)).toBe(
      "Controle interno — 02/11 a 08/11/2026\n\nConcluídos (1)\n- Item feito (PR: https://github.com/x/y/pull/1) — https://app/ci/feito",
    );
  });
});
