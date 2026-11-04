import { describe, expect, it } from "vitest";
import { entregasPorPessoa, intervaloDasEntregas, linhaDoItem, type ItemParaEntregas, type MudancaParaEntregas } from "./entregas";

// Entregas da Tech (04/11/2026, lote D dos ajustes de 03/11).

const d = (s: string) => new Date(`${s}T12:00:00Z`);
const mud = (itemId: string, quando: string, de: string | null, para: string): MudancaParaEntregas => ({
  itemId,
  createdAt: d(quando),
  changes: [{ field: "Situação", before: de, after: para }],
});
const item = (p: Partial<ItemParaEntregas>): ItemParaEntregas => ({
  id: "i1",
  title: "Item",
  status: "DONE",
  size: "M",
  assigneeId: "ana",
  assigneeName: "Ana",
  originItemId: null,
  createdAt: d("2026-10-01"),
  ...p,
});

describe("a linha do tempo do item", () => {
  it("início, validação, voltas e conclusão saem do histórico de Situação", () => {
    const t = linhaDoItem("i1", [
      mud("i1", "2026-10-02", "Pendente", "Em andamento"),
      mud("i1", "2026-10-05", "Em andamento", "Em validação"),
      mud("i1", "2026-10-06", "Em validação", "Em andamento"),
      mud("i1", "2026-10-08", "Em andamento", "Em validação"),
      mud("i1", "2026-10-09", "Em validação", "Concluído"),
    ]);
    expect(t).toEqual({ id: "i1", inicioEm: d("2026-10-02"), concluidoEm: d("2026-10-09"), validado: true, voltasDaValidacao: 1 });
  });

  it("concluído direto, sem validação, não conta como validado", () => {
    expect(linhaDoItem("i1", [mud("i1", "2026-10-02", "Pendente", "Concluído")]).validado).toBe(false);
  });
});

describe("por pessoa", () => {
  const inicio = d("2026-10-01");
  const fim = d("2026-12-31");
  const validado = (id: string) => [mud(id, "2026-10-02", "Pendente", "Em andamento"), mud(id, "2026-10-04", "Em andamento", "Em validação"), mud(id, "2026-10-06", "Em validação", "Concluído")];

  it("pontos pelo tamanho só nas validadas; sem tamanho, contado à parte; ciclo mediano; retrabalho", () => {
    const [ana] = entregasPorPessoa(
      [
        item({ id: "a", size: "G" }),
        item({ id: "b", size: "P" }),
        item({ id: "c", size: null }),
        item({ id: "d", size: "G" }),
        item({ id: "bug", status: "PENDING", originItemId: "a", assigneeId: "bia", assigneeName: "Bia" }),
      ],
      [...validado("a"), ...validado("b"), ...validado("c"), mud("d", "2026-10-03", "Pendente", "Concluído")],
      [],
      new Map(),
      inicio,
      fim
    );
    expect(ana).toMatchObject({ nome: "Ana", entregas: 4, validadas: 3, pontos: 9, semTamanho: 1, cicloMedianoDias: 4, retrabalho: 1 });
  });

  it("concluído fora do período não entra; chamados no prazo e reabertos", () => {
    const pessoas = entregasPorPessoa(
      [item({ id: "x" })],
      [mud("x", "2026-09-10", "Pendente", "Concluído")],
      [
        { userIds: ["ana"], resolvedAt: d("2026-10-10"), resolutionDueAt: d("2026-10-11"), cycleNumber: 1 },
        { userIds: ["ana"], resolvedAt: d("2026-10-12"), resolutionDueAt: d("2026-10-11"), cycleNumber: 2 },
      ],
      new Map([["ana", "Ana"]]),
      inicio,
      fim
    );
    expect(pessoas).toEqual([expect.objectContaining({ nome: "Ana", entregas: 0, chamados: 2, chamadosNoPrazo: 1, chamadosReabertos: 1 })]);
  });
});

describe("o período", () => {
  it("este trimestre, o passado e os últimos 90 dias", () => {
    const agora = new Date("2026-11-04T15:00:00Z");
    expect(intervaloDasEntregas("trimestre", agora).inicio.toISOString()).toBe("2026-10-01T00:00:00.000Z");
    const anterior = intervaloDasEntregas("anterior", agora);
    expect(anterior.inicio.toISOString()).toBe("2026-07-01T00:00:00.000Z");
    expect(anterior.fim.toISOString()).toBe("2026-09-30T23:59:59.999Z");
    expect(intervaloDasEntregas("anterior", new Date("2026-02-10T00:00:00Z")).inicio.toISOString()).toBe("2025-10-01T00:00:00.000Z");
  });
});
