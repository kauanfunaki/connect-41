import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AuthContext } from "@/lib/auth/context";

// O que se testa: nenhuma consulta da tela lê a base inteira. A da empresa
// filtra pela empresa; a busca em todas não filtra empresa, mas tem teto.

const person = {
  findMany: vi.fn<(args: unknown) => Promise<unknown[]>>(async () => []),
  count: vi.fn<(args: unknown) => Promise<number>>(async () => 0),
};
vi.mock("@/lib/prisma", () => ({ getPrisma: () => ({ person }) }));

const { buscarEmTodasAsEmpresas, colaboradoresDaEmpresa, lerResumoDaEmpresa } = await import("./consultas");
const { LIMITE_DA_BUSCA } = await import("./busca");

const CTX: AuthContext = {
  userId: "u1",
  tenantId: "t1",
  homeTenantId: "t1",
  role: "SECTOR_USER",
  sectors: ["recrutamento"],
  subscriptionReadOnly: false,
  canSelfRegularizeSubscription: false,
  activeSector: null,
} as AuthContext;

type Args = { where: Record<string, unknown>; take?: number; skip?: number; select?: Record<string, unknown> };
const args = (fn: typeof person.findMany | typeof person.count, n = 0) => fn.mock.calls[n][0] as Args;

beforeEach(() => {
  person.findMany.mockClear();
  person.count.mockClear();
});

describe("colaboradoresDaEmpresa", () => {
  it("lê uma página da empresa escolhida, só colaboradores de cliente do tenant", async () => {
    await colaboradoresDaEmpresa(CTX, "emp1", { kind: "ativos" }, { numero: 3, tamanho: 50 });
    const a = args(person.findMany);
    expect(a.where).toMatchObject({ tenantId: "t1", type: "COLABORADOR", isInternal: false, currentCompanyId: "emp1", active: true });
    expect(a.take).toBe(50);
    expect(a.skip).toBe(100);
  });

  it("conta os inativos fora da lista só quando o filtro esconde inativos", async () => {
    await colaboradoresDaEmpresa(CTX, "emp1", { kind: "ativos" }, { numero: 1, tamanho: 50 });
    expect(person.count).toHaveBeenCalledTimes(2);
    expect(args(person.count, 1).where).toMatchObject({ currentCompanyId: "emp1", active: false });

    person.count.mockClear();
    await colaboradoresDaEmpresa(CTX, "emp1", { kind: "todos" }, { numero: 1, tamanho: 50 });
    expect(person.count).toHaveBeenCalledTimes(1);
  });
});

describe("lerResumoDaEmpresa", () => {
  it("lê só a empresa, e só os quatro campos que o resumo usa", async () => {
    person.findMany.mockResolvedValueOnce([
      { employmentStatus: "ATIVO", active: true, admissionDate: null, dismissalDate: null },
      { employmentStatus: "EM_FERIAS", active: true, admissionDate: null, dismissalDate: null },
    ]);
    const r = await lerResumoDaEmpresa(CTX, "emp1", new Date("2026-10-14T15:00:00.000Z"));
    const a = args(person.findMany);
    expect(a.where).toMatchObject({ tenantId: "t1", isInternal: false, currentCompanyId: "emp1" });
    expect(Object.keys(a.select ?? {}).sort()).toEqual(["active", "admissionDate", "dismissalDate", "employmentStatus"]);
    expect(r).toMatchObject({ ativos: 1, emFerias: 1 });
  });
});

describe("buscarEmTodasAsEmpresas", () => {
  it("procura em todas as empresas do tenant, com teto de LIMITE + 1", async () => {
    await buscarEmTodasAsEmpresas(CTX, "camila", { kind: "ativos" });
    const a = args(person.findMany);
    expect(a.take).toBe(LIMITE_DA_BUSCA + 1);
    expect(JSON.stringify(a.where)).not.toContain("currentCompanyId");
    expect(a.where).toEqual({
      AND: [
        { tenantId: "t1", type: "COLABORADOR", isInternal: false },
        { OR: [{ name: { contains: "camila" } }] },
        { active: true },
      ],
    });
  });

  it("devolve no máximo o limite e avisa que havia mais", async () => {
    person.findMany.mockResolvedValueOnce(Array.from({ length: LIMITE_DA_BUSCA + 1 }, (_, i) => ({ id: `p${i}` })));
    const r = await buscarEmTodasAsEmpresas(CTX, "a", { kind: "todos" });
    expect(r.itens).toHaveLength(LIMITE_DA_BUSCA);
    expect(r.temMais).toBe(true);
    expect(r.inativos).toBe(0);
  });
});
