import { describe, expect, it } from "vitest";
import { linhasDaAtividade, PESSOAS_NO_PAINEL, timesDaAtividade, timesDoRepositorio, type Lider } from "./atividadeDoTime";
import { COR_SEM_TIME, type Paleta } from "./cores";

const paleta: Paleta = {
  pessoas: {
    ana: { login: "ana", name: "Ana", cor: "#2E6FB8", time: "dev" },
    bia: { login: "bia", name: null, cor: "#E15A2B", time: "dev" },
    caio: { login: "caio", name: null, cor: "#1E8E5A", time: "suporte" },
    duda: { login: "duda", name: null, cor: "#7C5CBF", time: null },
  },
  times: [{ id: "dev", nome: "Desenvolvimento", cor: "#7C5CBF" }, { id: "suporte", nome: "Suporte", cor: "#C8860D" }],
};
const lider = (id: string, total: number): Lider => ({ id, login: id, name: paleta.pessoas[id]?.name ?? null, total });
// Como o servidor devolve: em ranking, do que mais contribuiu para o que menos.
const todos = [lider("ana", 30), lider("caio", 20), lider("duda", 15), lider("bia", 14)];
const soDoDev = [lider("ana", 30), lider("bia", 14)];

describe("Atividade do time no GitHub", () => {
  it("agrupado por time, sem time escolhido: uma linha por time, somada, e Sem time por último", () => {
    const linhas = linhasDaAtividade(todos, paleta, "time", null);
    expect(linhas.tipo).toBe("times");
    if (linhas.tipo !== "times") return;
    expect(linhas.times.map(t => [t.nome, t.total])).toEqual([["Desenvolvimento", 44], ["Suporte", 20], ["Sem time", 15]]);
    expect(linhas.times.at(-1)?.cor).toBe(COR_SEM_TIME);
  });
  it("com um time escolhido: as pessoas do time uma a uma, no ranking, sem somar", () => {
    const linhas = linhasDaAtividade(soDoDev, paleta, "time", "dev");
    expect(linhas).toEqual({ tipo: "pessoas", pessoas: soDoDev });
  });
  it("com um time escolhido e mais gente que cabe no painel: só as primeiras, o resto no Ver todos", () => {
    const muitos = Array.from({ length: PESSOAS_NO_PAINEL + 2 }, (_, i) => lider(`p${i}`, 50 - i));
    const linhas = linhasDaAtividade(muitos, paleta, "time", "dev");
    expect(linhas.tipo === "pessoas" && linhas.pessoas.map(p => p.id)).toEqual(muitos.slice(0, PESSOAS_NO_PAINEL).map(p => p.id));
  });
  it("agrupado por pessoa: as primeiras do ranking, com ou sem time no endereço", () => {
    expect(linhasDaAtividade(todos, paleta, "pessoa", null)).toEqual({ tipo: "pessoas", pessoas: todos.slice(0, PESSOAS_NO_PAINEL) });
    expect(linhasDaAtividade(soDoDev, paleta, "pessoa", "dev")).toEqual({ tipo: "pessoas", pessoas: soDoDev });
  });
  it("time vazio no endereço (time=) conta como nenhum time escolhido", () => {
    expect(linhasDaAtividade(todos, paleta, "time", "").tipo).toBe("times");
  });
  it("sem ninguém no período, nenhuma linha", () => {
    expect(timesDaAtividade([], paleta)).toEqual([]);
    expect(linhasDaAtividade([], paleta, "time", "dev")).toEqual({ tipo: "pessoas", pessoas: [] });
  });
});

describe("Aba Repositórios agrupada por time", () => {
  const c = (id: string, total: number, commits: number) => ({ id, total, counts: { COMMIT: commits, PULL_REQUEST: total - commits } });
  it("soma as pessoas de cada time, inclusive por tipo, e deixa Sem time por último", () => {
    const times = timesDoRepositorio([c("duda", 40, 40), c("ana", 10, 6), c("caio", 12, 12), c("bia", 5, 1)], paleta);
    expect(times.map(t => [t.nome, t.total])).toEqual([["Desenvolvimento", 15], ["Suporte", 12], ["Sem time", 40]]);
    expect(times[0]!.counts).toEqual({ COMMIT: 7, PULL_REQUEST: 8 });
    expect(times[0]!.cor).toBe("#7C5CBF");
    expect(times[2]!.cor).toBe(COR_SEM_TIME);
  });
});
