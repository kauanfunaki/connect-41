import { beforeEach, describe, expect, it, vi } from "vitest";

// O que se testa: a troca da origem das raízes do SPED (14/10/2026). Decisão do
// Kauan: manter EXATAMENTE as raízes que o SPED já sincroniza, sem ampliar,
// até o plano do SPED substituir. A regra antiga (clientes ativos com raiz de
// 8 caracteres) vira uma fotografia gravada pela migration; aqui se confere que,
// para os mesmos dados, o conjunto de cada escritório não cresce nem encolhe.

const m = vi.hoisted(() => ({ spedSyncRoot: { findMany: vi.fn() }, clientGroup: { findMany: vi.fn() } }));
vi.mock("@/lib/prisma", () => ({ getPrisma: () => m }));

const { fotografiaDasRaizes, raizesDaFotografia, raizesPelosClientes, raizesSincronizadas } = await import("./raizesSincronizadas");

/**
 * Um retrato representativo de produção: a 41 com clientes ativos e inativos,
 * pessoa física e holding sem raiz, raiz digitada errada (curta), e um segundo
 * escritório que tem uma raiz igual à de um cliente da 41.
 */
const CLIENTES = [
  { tenantId: "41", cnpjRoot: "11222333", active: true }, // BLD
  { tenantId: "41", cnpjRoot: "44555666", active: true }, // IRRIGA FOUR
  { tenantId: "41", cnpjRoot: "77888999", active: false }, // cliente que saiu
  { tenantId: "41", cnpjRoot: null, active: true }, // pessoa física
  { tenantId: "41", cnpjRoot: "1234567", active: true }, // raiz incompleta
  { tenantId: "41", cnpjRoot: "", active: true },
  { tenantId: "41", cnpjRoot: "31052957", active: true }, // a própria 41 Contábil
  { tenantId: "outro", cnpjRoot: "11222333", active: true }, // a mesma raiz noutro escritório
  { tenantId: "outro", cnpjRoot: "99000111", active: false },
];

const doEscritorio = (t: string) => CLIENTES.filter((c) => c.tenantId === t);
const ordenadas = (l: string[]) => [...l].sort();

describe("as raízes do SPED: regra antiga × fotografia da migration", () => {
  it("a regra antiga: clientes ativos, raiz de 8 caracteres, sem repetir", () => {
    expect(ordenadas(raizesPelosClientes(doEscritorio("41")))).toEqual(["11222333", "31052957", "44555666"]);
    expect(raizesPelosClientes(doEscritorio("outro"))).toEqual(["11222333"]);
  });

  it("para os dados de hoje, cada escritório sincroniza exatamente as mesmas raízes — nem uma a mais, nem uma a menos", () => {
    const fotografia = fotografiaDasRaizes(CLIENTES);
    for (const tenant of ["41", "outro", "sem-clientes"]) {
      const antes = ordenadas(raizesPelosClientes(doEscritorio(tenant)));
      const depois = ordenadas(raizesDaFotografia(fotografia.filter((l) => l.tenantId === tenant)));
      expect(depois, tenant).toEqual(antes);
    }
  });

  it("a fotografia não repete raiz no mesmo escritório (a chave da tabela é escritório + raiz)", () => {
    const fotografia = fotografiaDasRaizes([...CLIENTES, ...CLIENTES]);
    const chaves = fotografia.map((l) => `${l.tenantId}:${l.cnpjRaiz}`);
    expect(chaves.length).toBe(new Set(chaves).size);
    expect(fotografia).toHaveLength(4);
  });
});

describe("raizesSincronizadas — o que a sincronização e o CT-e leem", () => {
  beforeEach(() => vi.clearAllMocks());

  it("lê da fotografia, só do escritório pedido — sem olhar os clientes", async () => {
    m.spedSyncRoot.findMany.mockResolvedValueOnce([{ cnpjRaiz: "11222333" }, { cnpjRaiz: "44555666" }]);
    expect(await raizesSincronizadas("41")).toEqual(["11222333", "44555666"]);
    expect(m.spedSyncRoot.findMany.mock.calls[0]![0].where).toEqual({ tenantId: "41" });
    expect(m.clientGroup.findMany).not.toHaveBeenCalled();
  });

  it("cliente cadastrado depois da migration não entra sozinho na busca", async () => {
    // A fotografia é o que existe; o cliente novo só existe na tabela de clientes.
    m.spedSyncRoot.findMany.mockResolvedValueOnce([{ cnpjRaiz: "11222333" }]);
    m.clientGroup.findMany.mockResolvedValue([{ cnpjRoot: "11222333", active: true }, { cnpjRoot: "55555555", active: true }]);
    expect(await raizesSincronizadas("41")).toEqual(["11222333"]);
  });

  it("sem a tabela (código antes da migration): cai na regra dos clientes, que dá o mesmo conjunto", async () => {
    m.spedSyncRoot.findMany.mockRejectedValueOnce(Object.assign(new Error("tabela não existe"), { code: "P2021" }));
    m.clientGroup.findMany.mockResolvedValueOnce(doEscritorio("41").filter((c) => c.active && c.cnpjRoot !== null));
    const espera = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(ordenadas(await raizesSincronizadas("41"))).toEqual(["11222333", "31052957", "44555666"]);
    expect(m.clientGroup.findMany.mock.calls[0]![0].where).toEqual({ tenantId: "41", active: true, cnpjRoot: { not: null } });
    espera.mockRestore();
  });

  it("outro erro do banco não vira lista vazia nem a regra antiga", async () => {
    m.spedSyncRoot.findMany.mockRejectedValueOnce(new Error("conexão caiu"));
    await expect(raizesSincronizadas("41")).rejects.toThrow("conexão caiu");
  });
});
