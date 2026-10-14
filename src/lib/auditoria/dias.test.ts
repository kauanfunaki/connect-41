import { describe, expect, it } from "vitest";
import {
  agruparPorDia,
  cabecalhoDoDia,
  contarPorDia,
  diaEmSaoPaulo,
  fimDoDia,
  inicioDoDia,
  nomeCurtoDoDia,
  periodoCurto,
  resolverPeriodo,
} from "./dias";

const HOJE = "2026-10-14"; // quarta-feira

describe("dia no fuso do escritório", () => {
  it("o que aconteceu às 23h de São Paulo é do mesmo dia, mesmo já sendo o dia seguinte em UTC", () => {
    expect(diaEmSaoPaulo(new Date("2026-10-15T02:30:00.000Z"))).toBe("2026-10-14");
    expect(diaEmSaoPaulo(new Date("2026-10-15T03:00:00.000Z"))).toBe("2026-10-15");
  });

  it("início e fim do dia como instante", () => {
    expect(inicioDoDia("2026-10-14").toISOString()).toBe("2026-10-14T03:00:00.000Z");
    expect(fimDoDia("2026-10-14").toISOString()).toBe("2026-10-15T03:00:00.000Z");
  });
});

describe("agrupamento por dia", () => {
  const linhas = [
    { id: "a", createdAt: new Date("2026-10-14T17:32:00.000Z") },
    { id: "b", createdAt: new Date("2026-10-14T13:05:00.000Z") },
    { id: "c", createdAt: new Date("2026-10-14T02:59:00.000Z") }, // 23:59 do dia 13 em São Paulo
    { id: "d", createdAt: new Date("2026-10-10T12:00:00.000Z") },
  ];

  it("agrupa linhas já ordenadas, mantendo a ordem", () => {
    expect(agruparPorDia(linhas).map((g) => [g.dia, g.linhas.map((l) => l.id)])).toEqual([
      ["2026-10-14", ["a", "b"]],
      ["2026-10-13", ["c"]],
      ["2026-10-10", ["d"]],
    ]);
  });

  it("conta por dia, do mais recente para o mais antigo, em qualquer ordem de entrada", () => {
    expect(contarPorDia([...linhas].reverse().map((l) => l.createdAt))).toEqual([
      { dia: "2026-10-14", total: 2 },
      { dia: "2026-10-13", total: 1 },
      { dia: "2026-10-10", total: 1 },
    ]);
  });

  it("cabeçalho: Hoje, Ontem e a data por extenso", () => {
    expect(cabecalhoDoDia("2026-10-14", 37, HOJE)).toEqual({ titulo: "Hoje", apoio: "quarta, 14 de outubro · 37 ações" });
    expect(cabecalhoDoDia("2026-10-13", 1, HOJE)).toEqual({ titulo: "Ontem", apoio: "terça, 13 de outubro · 1 ação" });
    expect(cabecalhoDoDia("2026-10-11", 1200, HOJE)).toEqual({ titulo: "Domingo, 11 de outubro", apoio: "1.200 ações" });
    expect(cabecalhoDoDia("2025-12-31", 2, HOJE).titulo).toBe("Quarta, 31 de dezembro de 2025");
  });

  it("nome curto para o “Mostrar mais”", () => {
    expect(nomeCurtoDoDia("2026-10-14", HOJE)).toBe("hoje");
    expect(nomeCurtoDoDia("2026-10-13", HOJE)).toBe("ontem");
    expect(nomeCurtoDoDia("2026-10-06", HOJE)).toBe("de 06/10");
  });
});

describe("período do filtro", () => {
  it("padrão: últimos 7 dias, contando hoje", () => {
    expect(resolverPeriodo(undefined, undefined, undefined, HOJE)).toEqual({ chave: "7d", de: "2026-10-08", ate: HOJE, rotulo: "Últimos 7 dias" });
    expect(resolverPeriodo("qualquer", null, null, HOJE).chave).toBe("7d");
  });

  it("atalhos", () => {
    expect(resolverPeriodo("hoje", null, null, HOJE)).toMatchObject({ de: HOJE, ate: HOJE });
    expect(resolverPeriodo("30d", null, null, HOJE)).toMatchObject({ de: "2026-09-15", ate: HOJE });
    expect(resolverPeriodo("mes", null, null, HOJE)).toMatchObject({ de: "2026-10-01", ate: HOJE });
    expect(resolverPeriodo("mes-passado", null, null, HOJE)).toMatchObject({ de: "2026-09-01", ate: "2026-09-30" });
  });

  it("datas escolhidas: válidas e na ordem certa", () => {
    expect(resolverPeriodo("datas", "2026-10-10", "2026-10-01", HOJE)).toEqual({ chave: "datas", de: "2026-10-01", ate: "2026-10-10", rotulo: "01/10/2026 a 10/10/2026" });
    expect(resolverPeriodo("datas", "2026-13-01", "2026-10-01", HOJE).chave).toBe("7d");
  });

  it("período curto para o cartão", () => {
    expect(periodoCurto({ de: "2026-10-01", ate: "2026-10-14" })).toBe("01/10 a 14/10");
    expect(periodoCurto({ de: HOJE, ate: HOJE })).toBe("14/10/2026");
  });
});
