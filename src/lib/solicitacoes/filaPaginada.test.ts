import { beforeEach, describe, expect, it, vi } from "vitest";

// A fila das Solicitações recebidas, paginada no servidor (27/11/2026,
// melhoria-571): ia até as 500 mais recentes, com o aviso "filtre para ver o
// resto". Agora traz uma página por `skip`/`take`, o total conta o recorte
// inteiro e os cartões continuam sobre a fila toda.

const m = vi.hoisted(() => ({ count: vi.fn(), findMany: vi.fn() }));
vi.mock("@/lib/prisma", () => ({ getPrisma: () => ({ serviceRequest: { count: m.count, findMany: m.findMany } }) }));

import { listarParaEquipe, SOLICITACOES_POR_PAGINA } from "./consultas";

const ESCOPO = { tenantId: "t1", setores: ["bpo"], userId: "u1" };
const FILTROS = { recorte: "abertas" as const, setor: null, empresaId: null, atrasadas: false };
const AGORA = new Date("2026-11-27T15:00:00Z");

function linha(id: string) {
  return {
    id,
    number: 1,
    sectorCode: "bpo",
    status: "ABERTA",
    responseDue: AGORA,
    firstResponseAt: null,
    lastMessageAt: AGORA,
    subject: { label: "Assunto" },
    company: { id: "c1", name: "Empresa", displayName: null },
    assignee: null,
    _count: { messages: 2, attachments: 0 },
  };
}

/** O total da lista é o primeiro `count`; os outros quatro são os cartões. */
function totais(daLista: number, cartoes = 7) {
  m.count.mockImplementation(async () => cartoes);
  m.count.mockImplementationOnce(async () => daLista);
}

beforeEach(() => {
  m.count.mockReset();
  m.findMany.mockReset();
  m.findMany.mockResolvedValue([linha("s1")]);
});

describe("listarParaEquipe — uma página da fila", () => {
  it("a página pedida vira skip/take, com o id desempatando a ordem", async () => {
    totais(120);
    const r = await listarParaEquipe(ESCOPO, FILTROS, AGORA, 2);
    const pedido = m.findMany.mock.calls[0][0];
    expect(pedido.skip).toBe(SOLICITACOES_POR_PAGINA);
    expect(pedido.take).toBe(SOLICITACOES_POR_PAGINA);
    expect(pedido.orderBy).toEqual([{ lastMessageAt: "desc" }, { id: "desc" }]);
    expect(r).toMatchObject({ total: 120, pagina: 2, totalDePaginas: 3 });
    expect(m.findMany).toHaveBeenCalledTimes(1);
  });

  it("o total conta o mesmo where da lista, e os cartões ignoram o recorte", async () => {
    totais(120, 7);
    const r = await listarParaEquipe(ESCOPO, FILTROS, AGORA, 1);
    expect(m.count.mock.calls[0][0]).toEqual({ where: m.findMany.mock.calls[0][0].where });
    expect(r.contadores).toEqual({ novas: 7, minhas: 7, atrasadas: 7, aguardando: 7 });
  });

  it("página além do fim cai na última que existe", async () => {
    totais(60);
    const r = await listarParaEquipe(ESCOPO, FILTROS, AGORA, 9);
    expect(r).toMatchObject({ pagina: 2, totalDePaginas: 2 });
    expect(m.findMany).toHaveBeenCalledTimes(2);
    expect(m.findMany.mock.calls[1][0].skip).toBe(SOLICITACOES_POR_PAGINA);
  });

  it("fila vazia: uma página só, a primeira", async () => {
    totais(0);
    m.findMany.mockResolvedValue([]);
    const r = await listarParaEquipe(ESCOPO, FILTROS, AGORA, 1);
    expect(r).toMatchObject({ linhas: [], total: 0, pagina: 1, totalDePaginas: 1 });
  });
});
