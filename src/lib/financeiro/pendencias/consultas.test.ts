import { beforeEach, describe, expect, it, vi } from "vitest";

// O balão das abas "Pedidos" e "Pendências" das Solicitações (10/11/2026,
// pedido do Kauan: balão como nos Chamados): o que a fila mostra ao abrir — o
// recorte "Em andamento", sem empresa —, contado no banco com o mesmo where da
// lista, sem carregar linha.

const m = vi.hoisted(() => ({ count: vi.fn(), findMany: vi.fn(), groupBy: vi.fn() }));
vi.mock("@/lib/prisma", () => ({ getPrisma: () => ({ clientRequest: { count: m.count, findMany: m.findMany, groupBy: m.groupBy } }) }));

import { contarPendencias, listarPendencias, paginaDePendencias, PENDENCIAS_POR_PAGINA } from "./consultas";
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

// As filas da equipe (Pendências do BPO e Pedidos ao cliente) paginadas no
// servidor (27/11/2026, melhoria-571): iam até as 500 primeiras, com o aviso
// "filtre para ver o resto".
describe("paginaDePendencias", () => {
  const escopo = { tenantId: "t1", companyIds: null, setores: soDoSetorPadrao("bpo") };
  const agora = new Date("2026-11-27T15:00:00Z");

  /** O 1º `count` é o total da lista; o 2º, o das vencidas (cartão). */
  function totais(daLista: number, vencidas = 3) {
    m.count.mockReset();
    m.count.mockResolvedValueOnce(daLista).mockResolvedValueOnce(vencidas);
  }

  it("a página pedida vira skip/take, na ordem da fila com o id desempatando", async () => {
    totais(130);
    const r = await paginaDePendencias(escopo, { recorte: "andamento" }, agora, 3);
    const pedido = m.findMany.mock.calls[0][0];
    expect(pedido.skip).toBe(2 * PENDENCIAS_POR_PAGINA);
    expect(pedido.take).toBe(PENDENCIAS_POR_PAGINA);
    expect(pedido.orderBy).toEqual([{ dueDate: { sort: "asc", nulls: "last" } }, { updatedAt: "asc" }, { id: "asc" }]);
    expect(r).toMatchObject({ total: 130, pagina: 3, totalDePaginas: 3 });
  });

  it("o total conta o where da lista; os cartões, a fila sem o recorte", async () => {
    totais(130, 3);
    m.groupBy.mockResolvedValue([
      { status: "ABERTA", _count: { _all: 80 } },
      { status: "RESPONDIDA", _count: { _all: 50 } },
      { status: "RESOLVIDA", _count: { _all: 900 } },
    ]);
    const r = await paginaDePendencias(escopo, { recorte: "andamento", vencidas: true }, agora, 1);
    expect(m.count.mock.calls[0][0]).toEqual({ where: m.findMany.mock.calls[0][0].where });
    expect(r.contadores).toEqual({ aguardando: 80, respondidas: 50, vencidas: 3, encerradas: 900 });
  });

  it("o mesmo where de listarPendencias, que o portal e a IA seguem usando", async () => {
    totais(1);
    await paginaDePendencias(escopo, { recorte: "aguardando", empresaId: "e1" }, agora, 1);
    await listarPendencias(escopo, { recorte: "aguardando", empresaId: "e1" }, agora);
    expect(m.findMany.mock.calls[0][0].where).toEqual(m.findMany.mock.calls[1][0].where);
  });

  it("página além do fim cai na última que existe", async () => {
    totais(51);
    const r = await paginaDePendencias(escopo, { recorte: "todas" }, agora, 40);
    expect(r).toMatchObject({ pagina: 2, totalDePaginas: 2 });
    expect(m.findMany).toHaveBeenCalledTimes(2);
    expect(m.findMany.mock.calls[1][0].skip).toBe(PENDENCIAS_POR_PAGINA);
  });
});
