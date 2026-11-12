import { beforeEach, describe, expect, it, vi } from "vitest";

// A página da tela de Licenças (12/11/2026, bug-645): os totais, o recorte e a
// ordem saem da leitura leve; os dados completos, só das licenças da página.

const m = vi.hoisted(() => ({ db: { license: { findMany: vi.fn() } } }));
vi.mock("@/lib/prisma", () => ({ getPrisma: () => m.db }));

const { paginaDeLicencas } = await import("./licencas-data");

const HOJE = new Date("2026-11-12T15:00:00Z");
const dia = (d: string) => new Date(`${d}T15:00:00Z`);

const LEVES = [
  { id: "vigente", expiresAt: dia("2027-06-01"), revokedAt: null, company: { name: "Gama", tradeName: null, cnpj: "33333333000133", city: "Londrina" } },
  { id: "vencida", expiresAt: dia("2026-10-01"), revokedAt: null, company: { name: "Alfa", tradeName: null, cnpj: "11111111000111", city: "Curitiba" } },
  { id: "renovar", expiresAt: dia("2026-12-01"), revokedAt: null, company: { name: "Beta", tradeName: "Beta Fantasia", cnpj: "22222222000122", city: "Curitiba" } },
  { id: "sem", expiresAt: null, revokedAt: null, company: { name: "Delta", tradeName: null, cnpj: null, city: null } },
  { id: "revogada", expiresAt: dia("2026-10-05"), revokedAt: dia("2026-10-06"), company: { name: "Épsilon", tradeName: null, cnpj: null, city: "Maringá" } },
];

function completa(id: string) {
  const l = LEVES.find((x) => x.id === id)!;
  return {
    id,
    companyId: `c-${id}`,
    kind: "Alvará",
    number: null,
    organId: null,
    issuedAt: null,
    expiresAt: l.expiresAt,
    revokedAt: l.revokedAt,
    notes: null,
    company: { ...l.company, stateCode: "PR" },
    organ: null,
  };
}

beforeEach(() => {
  m.db.license.findMany.mockReset();
  m.db.license.findMany.mockImplementation(async (args: { where: { id?: { in: string[] } }; select: Record<string, unknown> }) => {
    if (args.where.id) return [...args.where.id.in].reverse().map(completa);
    return LEVES.map((l) => (args.select.company ? l : { id: l.id, expiresAt: l.expiresAt, revokedAt: l.revokedAt }));
  });
});

describe("paginaDeLicencas", () => {
  it("conta a carteira inteira, recorta e lê completas só as da página, na ordem da fila", async () => {
    const p = await paginaDeLicencas("t", HOJE, {
      noRecorte: (s) => s === "vencida" || s === "a_renovar",
      pagina: 1,
      porPagina: 50,
    });
    expect(p.linhas.map((l) => l.id)).toEqual(["vencida", "renovar"]);
    expect(p).toMatchObject({ total: 2, pagina: 1, totalDePaginas: 1, temAlguma: true, vencidas: 1, aRenovar: 1, vigentes: 1 });
    // Sem busca, a primeira leitura não junta a empresa.
    expect(m.db.license.findMany.mock.calls[0][0].select.company).toBeUndefined();
    expect(m.db.license.findMany.mock.calls[1][0].where.id.in).toEqual(["vencida", "renovar"]);
  });

  it("pagina sem recorte e prende a página pedida à última", async () => {
    const p = await paginaDeLicencas("t", HOJE, { pagina: 9, porPagina: 2 });
    expect(p).toMatchObject({ total: 5, pagina: 3, totalDePaginas: 3 });
    expect(p.linhas.map((l) => l.id)).toEqual(["revogada"]);
  });

  it("busca por nome de fantasia, cidade e CNPJ; os totais seguem os da carteira", async () => {
    const porNome = await paginaDeLicencas("t", HOJE, { busca: "fantasia", pagina: 1, porPagina: 50 });
    expect(porNome.linhas.map((l) => l.id)).toEqual(["renovar"]);
    expect(porNome).toMatchObject({ vencidas: 1, aRenovar: 1, vigentes: 1 });

    const porCidade = await paginaDeLicencas("t", HOJE, { busca: "maringa", pagina: 1, porPagina: 50 });
    expect(porCidade.linhas.map((l) => l.id)).toEqual(["revogada"]);

    const porCnpj = await paginaDeLicencas("t", HOJE, { busca: "33.333.333", pagina: 1, porPagina: 50 });
    expect(porCnpj.linhas.map((l) => l.id)).toEqual(["vigente"]);
  });

  it("sem resultado não faz a segunda leitura", async () => {
    const p = await paginaDeLicencas("t", HOJE, { busca: "ninguém", pagina: 1, porPagina: 50 });
    expect(p).toMatchObject({ linhas: [], total: 0, temAlguma: true });
    expect(m.db.license.findMany).toHaveBeenCalledTimes(1);
  });
});
