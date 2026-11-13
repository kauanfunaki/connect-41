import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/prisma", () => ({ getPrisma: () => ({}) }));

const { duracaoLegivel, mediana, periodoValido, resumir } = await import("./metricas");

const base = new Date("2026-11-10T12:00:00Z");
const min = (n: number) => new Date(base.getTime() + n * 60_000);
const ciclo = (x: Partial<Parameters<typeof resumir>[0][number]>) => ({
  id: "c",
  situacao: "ENCERRADO" as const,
  sectorCode: "fiscal",
  assignedToId: "ana",
  encerradoPorId: "ana",
  abertoEm: base,
  encerradoEm: min(60),
  desfechoTexto: "Dúvida respondida",
  nota: null,
  notaPedidaEm: null,
  primeiraResposta: min(10),
  ...x,
});

describe("métricas do Atendimento", () => {
  it("mediana de pares e ímpares, e nada sem valores", () => {
    expect(mediana([5, 1, 3])).toBe(3);
    expect(mediana([1, 2, 3, 10])).toBe(2.5);
    expect(mediana([])).toBeNull();
  });

  it("resume volume, tempos, nota, setores, pessoas e desfechos", () => {
    const r = resumir([
      ciclo({ id: "1", nota: 5, notaPedidaEm: min(60) }),
      ciclo({ id: "2", primeiraResposta: min(30), encerradoEm: min(120), nota: 3, notaPedidaEm: min(120), desfechoTexto: "Guia enviada" }),
      ciclo({ id: "3", situacao: "EM_ATENDIMENTO", encerradoEm: null, encerradoPorId: null, assignedToId: "bia", sectorCode: null, primeiraResposta: null, desfechoTexto: null }),
      ciclo({ id: "4", notaPedidaEm: min(60) }),
    ]);
    expect(r).toMatchObject({ total: 4, encerrados: 3, emAberto: 1, respondidos: 3, primeiraResposta: 10, ateEncerrar: 60 });
    expect(r.nota).toEqual({ media: 4, quantas: 2, pedidas: 3, distribuicao: [0, 0, 1, 0, 1] });
    expect(r.porSetor.map((s) => [s.chave, s.total])).toEqual([
      ["fiscal", 3],
      [null, 1],
    ]);
    expect(r.porPessoa.map((p) => [p.chave, p.total, p.notaMedia])).toEqual([
      ["ana", 3, 4],
      ["bia", 1, null],
    ]);
    expect(r.desfechos).toEqual([
      { texto: "Dúvida respondida", n: 2 },
      { texto: "Guia enviada", n: 1 },
    ]);
  });

  it("tempo legível", () => {
    expect(duracaoLegivel(null)).toBe("—");
    expect(duracaoLegivel(0.4)).toBe("menos de 1 min");
    expect(duracaoLegivel(42)).toBe("42 min");
    expect(duracaoLegivel(125)).toBe("2 h 05");
    expect(duracaoLegivel(60 * 24 * 3 + 240)).toBe("3 d 4 h");
  });

  it("período da URL que não existe vira 30 dias", () => {
    expect(periodoValido("7")).toBe(7);
    expect(periodoValido("15")).toBe(30);
    expect(periodoValido(undefined)).toBe(30);
  });
});
