import { describe, expect, it } from "vitest";
import { intervaloDoResumo, type ItemParaResumo, type ResumoDoPeriodo } from "./resumo";
import { agrupamentoDoRitmo, diaEmSaoPaulo, ritmoDoPeriodo } from "./ritmo";

const item = (id: string, createdAt: string, extra: Partial<ItemParaResumo> = {}): ItemParaResumo => ({
  id, number: 1, title: `Item ${id}`, type: "BUG", status: "PENDING", priority: 1, systemName: null, assigneeName: null, dueDate: null, prUrl: null, createdAt: new Date(createdAt), ...extra,
});
const vazio = (): ResumoDoPeriodo => ({ concluidos: [], emAndamento: [], planejados: [], cancelados: [] });

describe("diaEmSaoPaulo", () => {
  it("usa o dia de São Paulo (UTC−3), não o de UTC", () => {
    expect(diaEmSaoPaulo(new Date("2026-11-24T02:59:00Z"))).toBe("2026-11-23");
    expect(diaEmSaoPaulo(new Date("2026-11-24T03:00:00Z"))).toBe("2026-11-24");
  });
});

describe("agrupamentoDoRitmo", () => {
  it("semana por dia, mês por semana, ano por mês; dia não desenha", () => {
    expect(agrupamentoDoRitmo("dia")).toBeNull();
    expect(agrupamentoDoRitmo("semana")).toBe("dia");
    expect(agrupamentoDoRitmo("mes")).toBe("semana");
    expect(agrupamentoDoRitmo("ano")).toBe("mes");
  });
});

describe("ritmoDoPeriodo", () => {
  it("no período dia devolve null", () => {
    expect(ritmoDoPeriodo("dia", intervaloDoResumo("dia", "2026-11-25"), vazio(), "2026-11-25")).toBeNull();
  });

  it("semana: sete dias, de segunda a domingo, com hoje marcado", () => {
    const g = ritmoDoPeriodo("semana", intervaloDoResumo("semana", "2026-11-25"), vazio(), "2026-11-25")!;
    expect(g.map((x) => x.primeiroDia)).toEqual(["2026-11-23", "2026-11-24", "2026-11-25", "2026-11-26", "2026-11-27", "2026-11-28", "2026-11-29"]);
    expect(g.map((x) => x.rotulo)).toEqual(["seg 23", "ter 24", "qua 25", "qui 26", "sex 27", "sáb 28", "dom 29"]);
    expect(g.filter((x) => x.contemHoje).map((x) => x.primeiroDia)).toEqual(["2026-11-25"]);
  });

  it("mês: semanas de segunda a domingo, cortadas nas bordas do mês", () => {
    // Novembro de 2026: 01/11 é domingo, 30/11 é segunda.
    const g = ritmoDoPeriodo("mes", intervaloDoResumo("mes", "2026-11-25"), vazio(), "2026-11-25")!;
    expect(g.map((x) => [x.primeiroDia, x.ultimoDia])).toEqual([
      ["2026-11-01", "2026-11-01"],
      ["2026-11-02", "2026-11-08"],
      ["2026-11-09", "2026-11-15"],
      ["2026-11-16", "2026-11-22"],
      ["2026-11-23", "2026-11-29"],
      ["2026-11-30", "2026-11-30"],
    ]);
    expect(g[1]).toMatchObject({ rotulo: "02/11", descricao: "02/11 a 08/11" });
    expect(g[0].descricao).toBe("01/11");
    expect(g.filter((x) => x.contemHoje).map((x) => x.primeiroDia)).toEqual(["2026-11-23"]);
  });

  it("ano: doze meses", () => {
    const g = ritmoDoPeriodo("ano", intervaloDoResumo("ano", "2026-11-25"), vazio(), "2027-01-10")!;
    expect(g).toHaveLength(12);
    expect(g[0]).toMatchObject({ primeiroDia: "2026-01-01", ultimoDia: "2026-01-31", rotulo: "jan", descricao: "jan/2026" });
    expect(g[1].ultimoDia).toBe("2026-02-28");
    expect(g[11]).toMatchObject({ primeiroDia: "2026-12-01", ultimoDia: "2026-12-31", rotulo: "dez" });
    expect(g.some((x) => x.contemHoje)).toBe(false);
  });

  it("conta concluídos pela data de conclusão e entradas pela de criação, no dia de São Paulo", () => {
    const r = vazio();
    // Concluído na terça às 23h de São Paulo (quarta 02h UTC): conta na terça.
    r.concluidos.push({ ...item("a", "2026-10-01T12:00:00Z", { status: "DONE" }), em: new Date("2026-11-25T02:00:00Z") });
    // Entrou e foi concluído na quarta: uma conclusão e uma entrada na quarta.
    r.concluidos.push({ ...item("b", "2026-11-25T13:00:00Z", { status: "DONE" }), em: new Date("2026-11-25T18:00:00Z") });
    r.emAndamento.push({ ...item("c", "2026-11-23T12:00:00Z", { status: "IN_PROGRESS" }), mexidoNoPeriodo: true });
    // Em andamento desde antes da semana: não é entrada.
    r.emAndamento.push({ ...item("d", "2026-11-01T12:00:00Z", { status: "IN_PROGRESS" }), mexidoNoPeriodo: false });
    r.planejados.push({ ...item("e", "2026-11-29T20:00:00Z"), entrouNoPeriodo: true, prazoNoPeriodo: false });
    // Domingo às 22h de São Paulo já é segunda em UTC: ainda é desta semana.
    r.cancelados.push({ ...item("f", "2026-11-30T01:00:00Z", { status: "CANCELED" }), em: new Date("2026-11-30T01:30:00Z") });

    const g = ritmoDoPeriodo("semana", intervaloDoResumo("semana", "2026-11-25"), r, "2026-11-25")!;
    expect(g.map((x) => x.concluidos)).toEqual([0, 1, 1, 0, 0, 0, 0]);
    expect(g.map((x) => x.entradas)).toEqual([1, 0, 1, 0, 0, 0, 2]);
  });

  it("no mês, soma por semana; no ano, por mês", () => {
    const r = vazio();
    r.concluidos.push({ ...item("a", "2026-03-10T12:00:00Z", { status: "DONE" }), em: new Date("2026-11-03T12:00:00Z") });
    r.concluidos.push({ ...item("b", "2026-11-05T12:00:00Z", { status: "DONE" }), em: new Date("2026-11-08T12:00:00Z") });
    r.planejados.push({ ...item("c", "2026-11-30T12:00:00Z"), entrouNoPeriodo: true, prazoNoPeriodo: false });

    const mes = ritmoDoPeriodo("mes", intervaloDoResumo("mes", "2026-11-25"), r, "2026-11-25")!;
    expect(mes.map((x) => x.concluidos)).toEqual([0, 2, 0, 0, 0, 0]);
    expect(mes.map((x) => x.entradas)).toEqual([0, 1, 0, 0, 0, 1]);

    const ano = ritmoDoPeriodo("ano", intervaloDoResumo("ano", "2026-11-25"), r, "2026-11-25")!;
    expect(ano[10]).toMatchObject({ concluidos: 2, entradas: 2, contemHoje: true });
    expect(ano[2]).toMatchObject({ concluidos: 0, entradas: 1 });
  });
});
