import { describe, expect, it } from "vitest";
import { acessosLivres, consultaBloqueadaHoje, janelaDaConsulta, lerListaDeCpfs, pacotesParaBaixar, type ItemDaBusca } from "./buscaPorCpf";

describe("lista de CPF e admissão", () => {
  it("lê ; tab, vírgula e espaço, ignora cabeçalho e repetidos, e aponta o que está errado", () => {
    const { itens, erros } = lerListaDeCpfs(
      ["CPF;Admissão", "529.982.247-25;03/11/2026", "15350946056\t2018-02-01", "529.982.247-25;03/11/2026", "111.111.111-11;01/01/2020", "11144477735", ""].join("\n")
    );
    expect(itens.map((i) => [i.cpf, i.admissao])).toEqual([
      ["52998224725", "2026-11-03"],
      ["15350946056", "2018-02-01"],
    ]);
    expect(erros).toEqual(["Linha 5: CPF inválido.", "Linha 6: falta a data de admissão (dd/mm/aaaa)."]);
  });
});

describe("janela da consulta", () => {
  it("vai de 20 dias antes a 10 dias depois da admissão, em até 31 dias", () => {
    const j = janelaDaConsulta("2025-02-03", new Date("2026-11-13T15:00:00Z"));
    expect(j).toEqual({ dtIni: "2025-01-14T00:00:00", dtFim: "2025-02-13T23:59:59" });
  });

  it("termina até uma hora antes de agora", () => {
    const j = janelaDaConsulta("2026-11-10", new Date("2026-11-13T15:00:00Z"));
    expect(j.dtFim).toBe("2026-11-13T11:00:00");
  });
});

describe("limites do eSocial", () => {
  it("bloqueia do dia 1 ao 7 (horário de Brasília)", () => {
    expect(consultaBloqueadaHoje(new Date("2026-12-07T23:00:00-03:00"))).toBe(true);
    expect(consultaBloqueadaHoje(new Date("2026-12-08T00:30:00-03:00"))).toBe(false);
    expect(consultaBloqueadaHoje(new Date("2026-12-01T02:00:00Z"))).toBe(false); // ainda é 30/11 em Brasília
  });

  it("10 acessos por dia", () => {
    expect(acessosLivres(0)).toBe(10);
    expect(acessosLivres(12)).toBe(0);
  });

  it("junta os eventos achados em pacotes de até 50", () => {
    const item = (cpf: string, n: number): ItemDaBusca => ({ cpf, admissao: "2025-01-01", situacao: "ENCONTRADO", ids: Array.from({ length: n }, (_, i) => `${cpf}-${i}`), mensagem: null });
    const p = pacotesParaBaixar([item("a", 30), item("b", 15), item("c", 10), { ...item("d", 2), situacao: "BAIXADO" }]);
    expect(p.map((x) => [x.cpfs, x.ids.length])).toEqual([
      [["a", "b"], 45],
      [["c"], 10],
    ]);
  });
});
