import { beforeEach, describe, expect, it, vi } from "vitest";

// O banco das guias (28/10/2026): a lista do mês calcula a situação pelo
// envio e pela data, e o envio só liga guia que ainda não tinha. Desde
// 27/11/2026 (melhoria-571) a lista é paginada: uma leitura leve do mês decide
// a página e os cartões, e o resto vem só das guias da página.

const m = vi.hoisted(() => ({ findMany: vi.fn(), updateMany: vi.fn(), findFirst: vi.fn(), update: vi.fn(), create: vi.fn() }));
vi.mock("@/lib/prisma", () => ({ getPrisma: () => ({ guia: m }) }));

const { guiasDoMes, ligarGuiaAoEnvio, marcarGuiaComoPaga, registrarGuiaEmitida } = await import("./servidor");

const linha = (extra: Record<string, unknown> = {}) => ({
  id: "g1",
  companyId: "c1",
  descricao: "DAS do Simples Nacional · 09/2026",
  competencia: "2026-09",
  vencimento: "2026-10-20",
  validoAte: null,
  valor: { toString: () => "1234.56" },
  driveFileId: "arq-1",
  clientDocumentId: null,
  pagaEm: null,
  createdAt: new Date("2026-10-10T12:00:00Z"),
  company: { name: "Empresa Exemplo Ltda", displayName: "Empresa Exemplo" },
  clientDocument: null,
  ...extra,
});

beforeEach(() => {
  for (const f of Object.values(m)) f.mockReset();
});

describe("as guias do mês", () => {
  it("busca pelo vencimento do mês, ou pela competência quando não há vencimento", async () => {
    m.findMany.mockResolvedValue([]);
    await guiasDoMes("t1", "2026-10", "2026-10-28", { id: { in: ["c1"] } });
    expect(m.findMany.mock.calls[0]![0].where).toMatchObject({
      tenantId: "t1",
      company: { id: { in: ["c1"] } },
      OR: [{ vencimento: { gte: "2026-10-01", lte: "2026-10-31" } }, { vencimento: null, competencia: "2026-10" }],
    });
  });

  it("a situação sai do envio e da data", async () => {
    m.findMany.mockResolvedValue([
      linha(),
      linha({ id: "g2", vencimento: "2026-10-30", clientDocumentId: "d1", clientDocument: { status: "PUBLISHED", recipients: [{ id: "r1" }] } }),
      linha({ id: "g3", vencimento: "2026-10-30", clientDocumentId: "d2", clientDocument: { status: "DRAFT", recipients: [] } }),
      linha({ id: "g4", pagaEm: new Date() }),
    ]);
    const r = await guiasDoMes("t1", "2026-10", "2026-10-28");
    expect(r.guias.map((g) => [g.id, g.situacao])).toEqual([
      ["g1", "VENCIDA"],
      ["g2", "ABERTA"],
      ["g3", "EMITIDA"],
      ["g4", "PAGA"],
    ]);
    expect(r.guias[0]).toMatchObject({ empresa: "Empresa Exemplo", valorCentavos: 123456, arquivoId: "arq-1", envioId: null });
  });

  it("pagina sem teto: as vencidas primeiro, os cartões do mês inteiro e o pesado só da página", async () => {
    // 60 guias no mês: as 55 primeiras pelo vencimento ainda vão vencer, as 5 últimas já venceram.
    const leves = Array.from({ length: 60 }, (_, i) =>
      linha({ id: `g${i + 1}`, vencimento: i < 55 ? "2026-10-30" : "2026-10-20", pagaEm: i < 2 ? new Date() : null })
    );
    m.findMany.mockImplementation(async (args: { where: { id?: { in: string[] } } }) =>
      args.where.id ? leves.filter((g) => args.where.id!.in.includes(g.id)).reverse() : leves
    );

    const p1 = await guiasDoMes("t1", "2026-10", "2026-10-28");
    expect(m.findMany.mock.calls[0]![0].take).toBeUndefined();
    expect(p1).toMatchObject({ total: 60, pagina: 1, totalDePaginas: 2 });
    expect(p1.contagem).toMatchObject({ VENCIDA: 5, PAGA: 2, EMITIDA: 53 });
    expect(p1.aPagarCentavos).toBe(58 * 123456);
    // As vencidas abrem a página, na ordem do banco; a leitura completa só pede as 50.
    expect(p1.guias.slice(0, 5).map((g) => g.id)).toEqual(["g56", "g57", "g58", "g59", "g60"]);
    expect(p1.guias).toHaveLength(50);
    expect(m.findMany.mock.calls[1]![0].where.id.in).toHaveLength(50);

    // Página além do fim cai na última.
    const p9 = await guiasDoMes("t1", "2026-10", "2026-10-28", {}, 9);
    expect(p9).toMatchObject({ pagina: 2, totalDePaginas: 2 });
    expect(p9.guias.map((g) => g.id)).toEqual(Array.from({ length: 10 }, (_, i) => `g${46 + i}`));
  });

  it("mês sem guia: uma página vazia, sem a segunda leitura", async () => {
    m.findMany.mockResolvedValue([]);
    const r = await guiasDoMes("t1", "2026-10", "2026-10-28");
    expect(r).toMatchObject({ guias: [], total: 0, pagina: 1, totalDePaginas: 1, aPagarCentavos: 0 });
    expect(m.findMany).toHaveBeenCalledTimes(1);
  });
});

describe("gravar e ligar", () => {
  it("a guia emitida entra como SERPRO, com o arquivo", async () => {
    m.create.mockResolvedValue({ id: "g9" });
    const id = await registrarGuiaEmitida({
      tenantId: "t1",
      companyId: "c1",
      userId: "u1",
      driveFileId: "arq-1",
      registro: { tipo: "DAS", descricao: "DAS", competencia: "2026-09", vencimento: "2026-10-20", validoAte: null, valorCentavos: null, numeroDocumento: null },
    });
    expect(id).toBe("g9");
    expect(m.create.mock.calls[0]![0].data).toMatchObject({ origem: "SERPRO", driveFileId: "arq-1", emitidaPorId: "u1", valor: null });
  });

  it("o envio liga só a guia que ainda não tinha envio", async () => {
    m.updateMany.mockResolvedValue({ count: 1 });
    expect(await ligarGuiaAoEnvio("t1", "arq-1", "d1")).toBe(1);
    expect(m.updateMany).toHaveBeenCalledWith({ where: { tenantId: "t1", driveFileId: "arq-1", clientDocumentId: null }, data: { clientDocumentId: "d1" } });
  });

  it("marcar e desmarcar como paga; guia de outro escritório não", async () => {
    const agora = new Date("2026-10-28T15:00:00Z");
    m.findFirst.mockResolvedValue({ id: "g1", companyId: "c1", descricao: "DAS" });
    expect(await marcarGuiaComoPaga("t1", "u1", "g1", true, agora)).toEqual({ companyId: "c1", descricao: "DAS" });
    expect(m.update.mock.calls[0]![0].data).toEqual({ pagaEm: agora, pagaPorId: "u1" });
    await marcarGuiaComoPaga("t1", "u1", "g1", false, agora);
    expect(m.update.mock.calls[1]![0].data).toEqual({ pagaEm: null, pagaPorId: null });
    m.findFirst.mockResolvedValue(null);
    expect(await marcarGuiaComoPaga("t1", "u1", "g9", true, agora)).toBeNull();
  });
});
