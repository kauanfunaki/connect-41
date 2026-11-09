import { beforeEach, describe, expect, it, vi } from "vitest";

// O pedido pelo link público (09/11/2026), de ponta a ponta na action: robô
// não grava nada e ouve "recebemos"; pessoa vira solicitação comum (mesma
// numeração, mesmo aviso ao setor, mesmo cartão), sem autor do portal, numa
// empresa prospecto — e a trilha diz que veio do link.

const estado = vi.hoisted(() => ({ permitido: true, maior: 41 as number | null }));

const serviceRequest = { aggregate: vi.fn(), create: vi.fn() };
const serviceRequestAttachment = { createMany: vi.fn() };
const tx = { serviceRequest, serviceRequestAttachment };
const prisma = { $transaction: vi.fn(async (fn: (t: typeof tx) => unknown) => fn(tx)) };

const destinoDoPedido = vi.fn();
const prospectoDoPedido = vi.fn();
const logAudit = vi.fn();
const avisarEquipeDaSolicitacao = vi.fn();
const criarCartaoDaSolicitacao = vi.fn();

vi.mock("next/headers", () => ({ headers: async () => new Headers({ "x-forwarded-for": "203.0.113.7" }) }));
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));
vi.mock("@/lib/prisma", () => ({ getPrisma: () => prisma }));
vi.mock("@/lib/audit", () => ({ logAudit: (...a: unknown[]) => logAudit(...a) }));
vi.mock("@/lib/rateLimit", () => ({ hit: () => ({ allowed: estado.permitido }), clientIp: () => "203.0.113.7" }));
vi.mock("@/lib/societario/fila", () => ({ feriadosDoTenant: async () => new Set<string>() }));
vi.mock("@/app/(portal)/usuario", () => ({ clienteAtivoDoPortal: async () => null }));
vi.mock("@/lib/financeiro/pendencias/armazenamento", () => ({ arquivosDoFormulario: () => [] }));
vi.mock("@/lib/solicitacoes/armazenamento", () => ({
  anexosDaSolicitacao: { gravarAnexos: async () => ({ ok: true, anexos: [] }), apagarAnexosGravados: async () => {} },
}));
vi.mock("@/lib/solicitacoes/avisos", () => ({
  avisarEquipeDaSolicitacao: (...a: unknown[]) => avisarEquipeDaSolicitacao(...a),
  responsavelDaEmpresaNoSetor: async () => null,
}));
vi.mock("@/lib/solicitacoes/cartaoServidor", () => ({
  criarCartaoDaSolicitacao: (...a: unknown[]) => criarCartaoDaSolicitacao(...a),
  moverCartaoDaSolicitacao: async () => {},
}));
vi.mock("@/lib/solicitacoes/pedidoPublicoServidor", () => ({
  destinoDoPedido: (...a: unknown[]) => destinoDoPedido(...a),
  prospectoDoPedido: (...a: unknown[]) => prospectoDoPedido(...a),
}));

process.env.JWT_ACCESS_SECRET = "segredo-de-teste";
const { emitirCarimbo } = await import("@/lib/carreiras/antiRobo");
const { enviarPedidoPeloLink } = await import("./actions");

const ID = "2f9c4e1a-5b6c-4d7e-8f90-a1b2c3d4e5f6";
const ASSUNTO = { id: ID, label: "Abertura de empresa", description: null, sectorCode: "societario", responseDays: 5 };

function formulario(extra: Record<string, string> = {}) {
  const f = new FormData();
  const campos = {
    carimbo: emitirCarimbo(new Date(Date.now() - 60_000)),
    website: "",
    slug: "escritorio",
    assunto: ID,
    nome: "Maria da Silva",
    email: "maria@exemplo.com.br",
    telefone: "(41) 99999-0000",
    empresa: "Padaria Exemplo",
    documento: "",
    mensagem: "Quero abrir uma padaria em Curitiba, com dois sócios.",
    aceite: "1",
    ...extra,
  };
  for (const [k, v] of Object.entries(campos)) f.set(k, v);
  return f;
}

beforeEach(() => {
  vi.clearAllMocks();
  estado.permitido = true;
  destinoDoPedido.mockResolvedValue({ tenantId: "t1", escritorio: { nome: "Escritório Exemplo", slug: "escritorio" }, assunto: ASSUNTO });
  prospectoDoPedido.mockResolvedValue({ id: "c1", name: "Padaria Exemplo", displayName: null, nova: true });
  serviceRequest.aggregate.mockResolvedValue({ _max: { number: estado.maior } });
  serviceRequest.create.mockResolvedValue({ id: "sr42", number: 42 });
});

describe("enviarPedidoPeloLink", () => {
  it("vira solicitação no assunto, sem autor do portal, com o número para a pessoa", async () => {
    expect(await enviarPedidoPeloLink(formulario())).toEqual({ ok: true, numero: 42 });

    const dados = serviceRequest.create.mock.calls[0][0].data;
    expect(dados).toMatchObject({
      tenantId: "t1",
      number: 42,
      companyId: "c1",
      subjectId: ID,
      sectorCode: "societario",
      assigneeId: null,
      openedByPortalUserId: null,
    });
    expect(dados.description).toMatch(/^Pedido pelo link público\./);
    expect(dados.description).toContain("Nome: Maria da Silva");
  });

  it("o setor recebe o aviso de sempre, e o cartão nasce como no portal", async () => {
    await enviarPedidoPeloLink(formulario());
    expect(avisarEquipeDaSolicitacao).toHaveBeenCalledWith(
      expect.objectContaining({ tenantId: "t1", id: "sr42", numero: 42, assunto: "Abertura de empresa", setor: "societario", assigneeId: null }),
      "nova"
    );
    expect(criarCartaoDaSolicitacao).toHaveBeenCalledWith("t1", "sr42");
  });

  it("a trilha diz que veio do link: a empresa nova e a solicitação, pela rotina", async () => {
    await enviarPedidoPeloLink(formulario());
    expect(logAudit.mock.calls.map((c) => c[0])).toEqual([
      expect.objectContaining({ tenantId: "t1", rotina: "linkPublicoDePedido", action: "company.create", entityId: "c1" }),
      expect.objectContaining({ tenantId: "t1", rotina: "linkPublicoDePedido", action: "solicitacao.link_publico", entityId: "sr42" }),
    ]);
  });

  it("prospecto reusada: só a linha da solicitação", async () => {
    prospectoDoPedido.mockResolvedValueOnce({ id: "c1", name: "Padaria Exemplo", displayName: null, nova: false });
    await enviarPedidoPeloLink(formulario());
    expect(logAudit.mock.calls.map((c) => c[0].action)).toEqual(["solicitacao.link_publico"]);
  });

  it("robô (campo-armadilha ou envio rápido demais) ouve 'recebemos', sem número, e nada é gravado", async () => {
    expect(await enviarPedidoPeloLink(formulario({ website: "https://spam.exemplo" }))).toEqual({ ok: true, numero: null });
    expect(await enviarPedidoPeloLink(formulario({ carimbo: emitirCarimbo(new Date()) }))).toEqual({ ok: true, numero: null });
    expect(prospectoDoPedido).not.toHaveBeenCalled();
    expect(serviceRequest.create).not.toHaveBeenCalled();
  });

  it("sem carimbo válido (post direto), pede para recarregar", async () => {
    expect(await enviarPedidoPeloLink(formulario({ carimbo: "123.forjado" }))).toMatchObject({ ok: false });
    expect(serviceRequest.create).not.toHaveBeenCalled();
  });

  it("campo com problema volta com o campo, antes de gastar o limite", async () => {
    estado.permitido = false;
    expect(await enviarPedidoPeloLink(formulario({ telefone: "123" }))).toMatchObject({ ok: false, campo: "telefone" });
  });

  it("limite por IP estourado: recusa sem gravar", async () => {
    estado.permitido = false;
    expect(await enviarPedidoPeloLink(formulario())).toMatchObject({ ok: false, erro: expect.stringContaining("daqui a uma hora") });
    expect(serviceRequest.create).not.toHaveBeenCalled();
  });

  it("link desligado entre abrir a página e enviar: recusa sem criar empresa", async () => {
    destinoDoPedido.mockResolvedValueOnce(null);
    expect(await enviarPedidoPeloLink(formulario())).toMatchObject({ ok: false, erro: expect.stringContaining("não está mais recebendo") });
    expect(destinoDoPedido).toHaveBeenCalledWith("escritorio", ID);
    expect(prospectoDoPedido).not.toHaveBeenCalled();
  });

  it("falha no banco vira mensagem para a pessoa, não erro na tela", async () => {
    serviceRequest.create.mockRejectedValueOnce(new Error("banco fora"));
    vi.spyOn(console, "error").mockImplementationOnce(() => {});
    expect(await enviarPedidoPeloLink(formulario())).toMatchObject({ ok: false, erro: expect.stringContaining("Tente de novo") });
  });
});
