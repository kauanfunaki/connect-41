import { beforeEach, describe, expect, it, vi } from "vitest";

// O balão das abas "Pedidos" e "Pendências" das Solicitações (10/11/2026,
// pedido do Kauan: balão como nos Chamados): o que a fila mostra ao abrir — o
// recorte "Em andamento", sem empresa —, contado no banco com o mesmo where da
// lista, sem carregar linha.

const m = vi.hoisted(() => ({ count: vi.fn(), findMany: vi.fn(), groupBy: vi.fn() }));
vi.mock("@/lib/prisma", () => ({ getPrisma: () => ({ clientRequest: { count: m.count, findMany: m.findMany, groupBy: m.groupBy } }) }));

import { contarPendencias, listarPendencias } from "./consultas";
import { dosSetores, soDoSetorPadrao } from "./setor";

const EM_ANDAMENTO = { status: { in: ["ABERTA", "RESPONDIDA"] } };

beforeEach(() => {
  vi.clearAllMocks();
  m.count.mockResolvedValue(4);
  m.findMany.mockResolvedValue([]);
  m.groupBy.mockResolvedValue([]);
});

describe("contarPendencias", () => {
  it("Pedidos ao cliente: os setores da pessoa, com as sem setor quando ela vê o padrão", async () => {
    const escopo = { tenantId: "t1", companyIds: null, setores: dosSetores(["bpo", "dp"], "bpo") };
    expect(await contarPendencias(escopo, "andamento")).toBe(4);
    expect(m.count).toHaveBeenCalledWith({
      where: {
        AND: [{ AND: [{ tenantId: "t1" }, { OR: [{ sectorCode: { in: ["bpo", "dp"] } }, { sectorCode: null }] }] }, EM_ANDAMENTO],
      },
    });
  });

  it("Pedidos ao cliente de quem não vê o setor padrão: as sem setor ficam de fora", async () => {
    await contarPendencias({ tenantId: "t1", companyIds: null, setores: dosSetores(["dp"], "bpo") }, "andamento");
    expect(m.count).toHaveBeenCalledWith({
      where: { AND: [{ AND: [{ tenantId: "t1" }, { OR: [{ sectorCode: { in: ["dp"] } }] }] }, EM_ANDAMENTO] },
    });
  });

  it("Pendências do BPO: só o setor do módulo e as sem setor", async () => {
    await contarPendencias({ tenantId: "t1", companyIds: null, setores: soDoSetorPadrao("bpo") }, "andamento");
    expect(m.count).toHaveBeenCalledWith({
      where: { AND: [{ AND: [{ tenantId: "t1" }, { OR: [{ sectorCode: { in: ["bpo"] } }, { sectorCode: null }] }] }, EM_ANDAMENTO] },
    });
  });

  it("'Todas' não filtra status", async () => {
    await contarPendencias({ tenantId: "t1", companyIds: null }, "todas");
    expect(m.count).toHaveBeenCalledWith({ where: { AND: [{ tenantId: "t1" }, {}] } });
  });

  it("conta o mesmo escopo e o mesmo recorte que a lista abre", async () => {
    const escopo = { tenantId: "t1", companyIds: null, setores: dosSetores(["bpo"], "bpo") };
    await listarPendencias(escopo, { recorte: "andamento" }, new Date("2026-11-10T15:00:00Z"));
    await contarPendencias(escopo, "andamento");
    const daLista = m.findMany.mock.calls[0][0].where.AND;
    const doBalao = m.count.mock.calls.at(-1)![0].where.AND;
    // A lista soma "empresa" e "só vencidas", vazios ao abrir.
    expect(daLista).toEqual([doBalao[0], {}, doBalao[1], {}]);
  });
});
