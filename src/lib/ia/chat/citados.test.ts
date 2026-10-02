import { beforeEach, describe, expect, it, vi } from "vitest";

const prisma = { user: { findMany: vi.fn() }, person: { findMany: vi.fn() }, company: { findMany: vi.fn() } };
vi.mock("@/lib/prisma", () => ({ getPrisma: () => prisma }));

const { citadosDosTextos } = await import("./conversas");

const ANA = "0b6c2f7e-1d3a-4c5b-9e8f-112233445566";
const ACME = "7a1e9c3d-2b4f-4e6a-8c9d-aabbccddeeff";

beforeEach(() => {
  vi.clearAllMocks();
  prisma.user.findMany.mockResolvedValue([{ id: ANA, name: "Ana Lima", photoUrl: "/f/ana.jpg" }]);
  prisma.company.findMany.mockResolvedValue([]); // Acme é de outro escritório: não acha
  prisma.person.findMany.mockResolvedValue([]);
});

describe("quem a resposta cita", () => {
  it("busca no escritório e devolve nome, foto e ficha; o que não acha fica de fora", async () => {
    const r = await citadosDosTextos("t1", [`@[Ana](usuario:${ANA}) fechou a @[Acme](empresa:${ACME}).`]);
    expect(prisma.user.findMany.mock.calls[0][0].where).toEqual({ tenantId: "t1", id: { in: [ANA] } });
    expect(prisma.company.findMany.mock.calls[0][0].where).toEqual({ tenantId: "t1", id: { in: [ACME] } });
    expect(r).toEqual({ [`usuario:${ANA}`]: { tipo: "usuario", nome: "Ana Lima", foto: "/f/ana.jpg", href: null } });
  });

  it("sem citação, nenhuma consulta", async () => {
    expect(await citadosDosTextos("t1", ["Nada a citar."])).toEqual({});
    expect(prisma.user.findMany).not.toHaveBeenCalled();
  });
});
