import { beforeEach, describe, expect, it, vi } from "vitest";

const count = vi.fn();
const isModuleEnabled = vi.fn();
vi.mock("@/lib/prisma", () => ({ getPrisma: () => ({ serviceRequest: { count } }) }));
vi.mock("@/lib/modules", () => ({ isModuleEnabled }));

const { linkDasRespostasAtrasadas, solicitacoesComRespostaAtrasada, whereDasRespostasAtrasadas } = await import("./indicadores");

// 08/10 às 01:30 em São Paulo (04:30 UTC): "hoje" ainda é 08/10 lá.
const AGORA = new Date("2026-10-08T04:30:00Z");
const MEIA_NOITE_SP = new Date("2026-10-08T03:00:00Z");
const ATRASADA = {
  status: { in: ["ABERTA", "EM_ANDAMENTO", "AGUARDANDO_CLIENTE"] },
  firstResponseAt: null,
  responseDue: { lt: MEIA_NOITE_SP },
};

type Ctx = Parameters<typeof solicitacoesComRespostaAtrasada>[0];
const doDP = { tenantId: "t1", userId: "u1", role: "SECTOR_USER", sectors: ["dp"], activeSector: null } as unknown as Ctx;

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("solicitações com resposta atrasada (Indicadores da Home, 08/10)", () => {
  it("administrador conta a fila inteira do escritório", () => {
    const where = whereDasRespostasAtrasadas({ tenantId: "t1", setores: null, userId: "u1", setor: null }, AGORA);
    expect(where).toEqual({ AND: [{ tenantId: "t1" }, {}, ATRASADA] });
  });

  it("quem tem um ou dois setores conta os dele e o que está com ele, como na fila", () => {
    const where = whereDasRespostasAtrasadas({ tenantId: "t1", setores: ["dp", "fiscal"], userId: "u1", setor: null }, AGORA);
    expect(where).toEqual({
      AND: [{ tenantId: "t1", OR: [{ sectorCode: { in: ["dp", "fiscal"] } }, { assigneeId: "u1" }] }, {}, ATRASADA],
    });
  });

  it("com setor ativo, só as do setor — e o cartão leva para a fila já filtrada", () => {
    const where = whereDasRespostasAtrasadas({ tenantId: "t1", setores: ["dp", "fiscal"], userId: "u1", setor: "dp" }, AGORA);
    expect(where.AND).toContainEqual({ sectorCode: "dp" });
    expect(linkDasRespostasAtrasadas("dp")).toBe("/solicitacoes?setor=dp&atrasadas=1");
    expect(linkDasRespostasAtrasadas(null)).toBe("/solicitacoes?atrasadas=1");
  });

  it("devolve a contagem e o link quando o canal do portal está ligado", async () => {
    isModuleEnabled.mockResolvedValue(true);
    count.mockResolvedValue(3);
    expect(await solicitacoesComRespostaAtrasada(doDP, AGORA)).toEqual({ quantas: 3, href: "/solicitacoes?atrasadas=1" });
    expect(count.mock.calls[0][0].where.AND[0]).toEqual({ tenantId: "t1", OR: [{ sectorCode: { in: ["dp"] } }, { assigneeId: "u1" }] });
  });

  it("sem o canal do portal, o cartão não aparece (a fila daria 404) — e nem consulta", async () => {
    isModuleEnabled.mockResolvedValue(false);
    expect(await solicitacoesComRespostaAtrasada(doDP, AGORA)).toBeNull();
    expect(count).not.toHaveBeenCalled();
  });

  it("consulta que falha some do cartão em vez de derrubar a Home, e vai para o log", async () => {
    isModuleEnabled.mockResolvedValue(true);
    count.mockRejectedValue(new Error("banco fora do ar"));
    expect(await solicitacoesComRespostaAtrasada(doDP, AGORA)).toBeNull();
    expect(console.error).toHaveBeenCalled();
  });
});
