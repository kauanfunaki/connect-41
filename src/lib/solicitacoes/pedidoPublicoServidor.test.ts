import { beforeEach, describe, expect, it, vi } from "vitest";

// Para onde o link público de pedido aponta e a empresa do pedido (09/11/2026):
// tudo o que não deve receber pedido dá o mesmo 404, e a empresa reusada é só
// prospecto sem portal — nunca o cadastro de um cliente.

const tenant = { findUnique: vi.fn() };
const serviceRequestSubject = { findFirst: vi.fn() };
const company = { findFirst: vi.fn(), create: vi.fn() };
// A empresa nova nasce numa transação, com o número do endereço curto
// (10/11/2026): sem empresa no escritório, o número é 1.
const prisma: Record<string, unknown> = { tenant, serviceRequestSubject, company, $queryRaw: async () => [] };
prisma.$transaction = async (fn: (tx: unknown) => Promise<unknown>) => fn(prisma);
const modulo = { ligado: true };

vi.mock("@/lib/prisma", () => ({ getPrisma: () => prisma }));
vi.mock("@/lib/modules", () => ({ isModuleEnabled: async () => modulo.ligado }));
vi.mock("@/lib/aparencia/leitura", () => ({
  lerAparencia: async () => ({
    aparencia: { corPrincipal: "#0A7F5A", logoNoPortal: false },
    escritorio: { nome: "Escritório Exemplo", logoUrl: "/api/workspace-logos/t1.png" },
    situacao: "ok",
  }),
}));

const { destinoDoPedido, marcaDoPedido, prospectoDoPedido } = await import("./pedidoPublicoServidor");

const ID = "2f9c4e1a-5b6c-4d7e-8f90-a1b2c3d4e5f6";
const ASSUNTO = { id: ID, label: "Abertura de empresa", description: "Atividade, cidade e quantos sócios.", sectorCode: "societario", responseDays: 5 };
const PEDIDO = {
  nome: "Maria da Silva",
  email: "maria@exemplo.com.br",
  telefone: "41999990000",
  empresa: "Padaria Exemplo",
  documento: null,
  mensagem: "Quero abrir uma padaria.",
};

beforeEach(() => {
  vi.clearAllMocks();
  modulo.ligado = true;
  tenant.findUnique.mockResolvedValue({ id: "t1", name: "Escritório Exemplo", slug: "escritorio", active: true });
  serviceRequestSubject.findFirst.mockResolvedValue(ASSUNTO);
});

describe("destinoDoPedido", () => {
  it("escritório ativo e assunto do escritório, ativo e com o link ligado", async () => {
    expect(await destinoDoPedido("escritorio", ID)).toEqual({
      tenantId: "t1",
      escritorio: { nome: "Escritório Exemplo", slug: "escritorio" },
      assunto: ASSUNTO,
    });
    expect(serviceRequestSubject.findFirst.mock.calls[0][0].where).toEqual({ id: ID, tenantId: "t1", active: true, publicLink: true });
  });

  it("id que não é uuid nem chega ao banco", async () => {
    expect(await destinoDoPedido("escritorio", "1")).toBeNull();
    expect(await destinoDoPedido("escritorio", "../admin")).toBeNull();
    expect(tenant.findUnique).not.toHaveBeenCalled();
  });

  it("escritório que não existe ou está inativo: 404", async () => {
    tenant.findUnique.mockResolvedValueOnce(null);
    expect(await destinoDoPedido("nao-existe", ID)).toBeNull();
    tenant.findUnique.mockResolvedValueOnce({ id: "t1", name: "X", slug: "inativo", active: false });
    expect(await destinoDoPedido("inativo", ID)).toBeNull();
  });

  it("assunto desligado, inativo ou de outro escritório (a busca não acha): 404", async () => {
    serviceRequestSubject.findFirst.mockResolvedValueOnce(null);
    expect(await destinoDoPedido("escritorio", ID)).toBeNull();
  });

  it("Solicitações desligadas: 404 — a equipe não veria o pedido", async () => {
    modulo.ligado = false;
    expect(await destinoDoPedido("escritorio-sem-modulo", ID)).toBeNull();
  });
});

describe("marcaDoPedido", () => {
  it("o nome, o logo (sempre que existe, como nas páginas públicas) e a cor principal", async () => {
    expect(await marcaDoPedido("t1", "Escritório Exemplo")).toEqual({
      nome: "Escritório Exemplo",
      logoUrl: "/api/workspace-logos/t1.png",
      corPrincipal: "#0A7F5A",
    });
  });
});

describe("prospectoDoPedido", () => {
  it("reusa a prospecto do mesmo e-mail no escritório — só prospecto, sem acesso ao portal", async () => {
    company.findFirst.mockResolvedValueOnce({ id: "c1", name: "Padaria Antiga", displayName: null });
    expect(await prospectoDoPedido("t1", PEDIDO)).toEqual({ id: "c1", name: "Padaria Antiga", displayName: null, nova: false });
    expect(company.findFirst.mock.calls[0][0].where).toEqual({
      tenantId: "t1",
      status: "PROSPECT",
      email: "maria@exemplo.com.br",
      portalUserLinks: { none: {} },
    });
    expect(company.create).not.toHaveBeenCalled();
  });

  it("sem prospecto do e-mail, cria uma com o nome dado, o contato e a origem — sem o documento", async () => {
    company.findFirst.mockResolvedValueOnce(null);
    company.create.mockResolvedValueOnce({ id: "c2", name: "Padaria Exemplo", displayName: null });
    expect(await prospectoDoPedido("t1", { ...PEDIDO, documento: { tipo: "CNPJ", digitos: "11222333000181" } })).toMatchObject({
      id: "c2",
      nova: true,
    });
    expect(company.create.mock.calls[0][0].data).toEqual({
      tenantId: "t1",
      number: 1,
      name: "Padaria Exemplo",
      email: "maria@exemplo.com.br",
      phone: "(41) 99999-0000",
      status: "PROSPECT",
      source: "Link público de pedido",
    });
  });
});
