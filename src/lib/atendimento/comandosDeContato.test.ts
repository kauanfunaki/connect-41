import { beforeEach, describe, expect, it, vi } from "vitest";

// Iniciar conversa, pedir para assumir e tirar da conversa (13/11/2026): uma
// conversa aberta tem no máximo uma pessoa falando com o cliente.

const prisma = {
  atendimentoContato: { findFirst: vi.fn() },
  atendimentoCiclo: { findFirst: vi.fn(), create: vi.fn(), update: vi.fn(), updateMany: vi.fn() },
  atendimentoMovimento: { create: vi.fn() },
  user: { findFirst: vi.fn() },
};
const avisarPedidoDeAssumir = vi.fn();
const avisarDecisaoDeAssumir = vi.fn();
const avisarRetirada = vi.fn();
let ciclo: Record<string, unknown> = {};

vi.mock("@/lib/prisma", () => ({ getPrisma: () => prisma }));
vi.mock("@/lib/audit", () => ({ logAudit: vi.fn() }));
vi.mock("@/lib/sectors", () => ({ getSectorMaps: async () => ({ options: [{ value: "fiscal" }, { value: "dp" }, { value: "controladoria" }], labels: {}, colors: {} }), sectorLabel: (_: unknown, c: string) => c }));
vi.mock("./avisos", () => ({
  avisarPedidoDeAssumir: (...a: unknown[]) => avisarPedidoDeAssumir(...a),
  avisarDecisaoDeAssumir: (...a: unknown[]) => avisarDecisaoDeAssumir(...a),
  avisarRetirada: (...a: unknown[]) => avisarRetirada(...a),
}));
vi.mock("./dados", () => ({
  lerConfiguracao: async () => ({ setores: null }),
  setoresQueAtendem: (_: unknown, ativos: string[], triagem: string) => ativos.filter((s) => s !== triagem),
  nomesDosContatos: async () => () => ({ titulo: "Rafael", subtitulo: null }),
  telefoneLegivel: (x: string) => x,
}));
vi.mock("./comandos", () => ({
  exigir: (cond: boolean, frase: string) => {
    if (!cond) throw new Error(frase);
  },
  carregar: async () => ciclo,
  alvo: (x: { sectorCode: string | null; assignedToId: string | null; situacao: string }) => ({ sectorCode: x.sectorCode, assignedToId: x.assignedToId, situacao: x.situacao }),
  nomeDoUsuario: async (_: string, id: string) => (id === "ana" ? "Ana" : "Bia"),
  nomeDoCliente: async () => "Rafael",
}));

const { iniciarConversa, pedirParaAssumir, decidirPedidoDeAssumir, tirarDaConversa } = await import("./comandosDeContato");

const ctx = (x: Record<string, unknown> = {}) => ({ userId: "bia", tenantId: "t1", role: "SECTOR_USER", sectors: ["dp"], subscriptionReadOnly: false, activeSector: null, ...x });
const c = (x: Record<string, unknown> = {}) => ({ ctx: ctx(x), cfg: { enabled: true, triagem: "controladoria" } }) as never;
const contatoCom = (ciclos: unknown[]) => ({ id: "ct1", conversas: [{ id: "cv1", optedOutAt: null, ciclos }] });

beforeEach(() => {
  vi.clearAllMocks();
  prisma.atendimentoCiclo.create.mockResolvedValue({ id: "novo" });
  prisma.atendimentoCiclo.updateMany.mockResolvedValue({ count: 1 });
});

describe("iniciar conversa", () => {
  it("contato livre: abre um atendimento com a pessoa, no setor dela", async () => {
    prisma.atendimentoContato.findFirst.mockResolvedValue(contatoCom([]));
    expect(await iniciarConversa(c(), "ct1")).toBe("novo");
    expect(prisma.atendimentoCiclo.create.mock.calls[0]![0].data).toMatchObject({ situacao: "EM_ATENDIMENTO", sectorCode: "dp", assignedToId: "bia" });
  });

  it("com outra pessoa atendendo: recusa e diz quem é", async () => {
    prisma.atendimentoContato.findFirst.mockResolvedValue(contatoCom([{ id: "c1", situacao: "EM_ATENDIMENTO", sectorCode: "fiscal", assignedToId: "ana" }]));
    await expect(iniciarConversa(c(), "ct1")).rejects.toThrow("Ana está atendendo este contato");
    expect(prisma.atendimentoCiclo.create).not.toHaveBeenCalled();
  });

  it("já está com a pessoa: só abre", async () => {
    prisma.atendimentoContato.findFirst.mockResolvedValue(contatoCom([{ id: "c1", situacao: "EM_ATENDIMENTO", sectorCode: "dp", assignedToId: "bia" }]));
    expect(await iniciarConversa(c(), "ct1")).toBe("c1");
  });

  it("quem pediu PARAR não recebe conversa nova", async () => {
    prisma.atendimentoContato.findFirst.mockResolvedValue({ id: "ct1", conversas: [{ id: "cv1", optedOutAt: new Date(), ciclos: [] }] });
    await expect(iniciarConversa(c(), "ct1")).rejects.toThrow("PARAR");
  });
});

describe("pedir para assumir", () => {
  it("grava o pedido e avisa quem está atendendo", async () => {
    prisma.atendimentoCiclo.findFirst.mockResolvedValue({ id: "c1", situacao: "EM_ATENDIMENTO", assignedToId: "ana", pedidoAssumirPorId: null, conversa: { contato: {} } });
    await pedirParaAssumir(c(), "c1");
    expect(prisma.atendimentoCiclo.updateMany.mock.calls[0]![0].data).toMatchObject({ pedidoAssumirPorId: "bia" });
    expect(avisarPedidoDeAssumir).toHaveBeenCalledWith(expect.objectContaining({ paraUserId: "ana", quemPede: "Bia" }));
  });

  it("com o pedido de outra pessoa esperando, recusa", async () => {
    prisma.atendimentoCiclo.findFirst.mockResolvedValue({ id: "c1", situacao: "EM_ATENDIMENTO", assignedToId: "ana", pedidoAssumirPorId: "carla", conversa: { contato: {} } });
    await expect(pedirParaAssumir(c(), "c1")).rejects.toThrow("Outra pessoa já pediu");
  });
});

describe("decidir o pedido para assumir", () => {
  beforeEach(() => {
    ciclo = { id: "c1", situacao: "EM_ATENDIMENTO", sectorCode: "fiscal", assignedToId: "ana", pedidoAssumirPorId: "bia", conversa: { contato: {} } };
  });

  it("quem atende autoriza: a conversa vai para quem pediu, no setor dela", async () => {
    prisma.user.findFirst.mockResolvedValue({ sectors: [{ sectorCode: "dp" }] });
    await decidirPedidoDeAssumir(c({ userId: "ana", sectors: ["fiscal"] }), "c1", true);
    expect(prisma.atendimentoCiclo.update.mock.calls[0]![0].data).toMatchObject({ assignedToId: "bia", sectorCode: "dp", pedidoAssumirPorId: null });
    expect(avisarDecisaoDeAssumir).toHaveBeenCalledWith(expect.objectContaining({ paraUserId: "bia", aceito: true }));
  });

  it("outra pessoa do setor não decide", async () => {
    await expect(decidirPedidoDeAssumir(c({ userId: "carla", sectors: ["fiscal"] }), "c1", true)).rejects.toThrow("Só quem está com a conversa");
  });
});

describe("tirar da conversa", () => {
  beforeEach(() => {
    ciclo = { id: "c1", situacao: "EM_ATENDIMENTO", sectorCode: "fiscal", assignedToId: "ana", conversa: { contato: {} } };
  });

  it("a triagem tira, com motivo: volta para a triagem e a pessoa é avisada", async () => {
    await tirarDaConversa(c({ userId: "cris", sectors: ["controladoria"] }), "c1", "Tom inadequado com o cliente");
    expect(prisma.atendimentoCiclo.updateMany.mock.calls[0]![0].data).toMatchObject({ assignedToId: null, situacao: "TRIAGEM", sectorCode: null });
    expect(avisarRetirada).toHaveBeenCalledWith(expect.objectContaining({ paraUserId: "ana", motivo: "Tom inadequado com o cliente" }));
  });

  it("sem motivo, ou fora da triagem, não tira", async () => {
    await expect(tirarDaConversa(c({ userId: "cris", sectors: ["controladoria"] }), "c1", "  ")).rejects.toThrow("motivo");
    await expect(tirarDaConversa(c({ userId: "carla", sectors: ["fiscal"] }), "c1", "x")).rejects.toThrow("Só a triagem");
  });
});
