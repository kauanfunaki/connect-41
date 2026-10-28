import { beforeEach, describe, expect, it, vi } from "vitest";

// O banco das guias (28/10/2026): a lista do mês calcula a situação pelo
// envio e pela data, e o envio só liga guia que ainda não tinha.

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
    expect(r.map((g) => [g.id, g.situacao])).toEqual([
      ["g1", "VENCIDA"],
      ["g2", "ABERTA"],
      ["g3", "EMITIDA"],
      ["g4", "PAGA"],
    ]);
    expect(r[0]).toMatchObject({ empresa: "Empresa Exemplo", valorCentavos: 123456, arquivoId: "arq-1", envioId: null });
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
