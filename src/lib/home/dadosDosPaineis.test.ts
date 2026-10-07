import { beforeEach, describe, expect, it, vi } from "vitest";

// O que se testa (07/10): a consulta de um painel que falha devolve `null` em
// vez de lançar — o painel mostra o aviso no lugar dele, e a faixa de
// destaques segue com os números dos outros. Antes, o erro subia para o
// `error.tsx` e a Home inteira virava "Não foi possível carregar o resumo".
const titulosEmAberto = vi.fn();
const listarFila = vi.fn();
vi.mock("@/lib/prisma", () => ({ getPrisma: () => ({}) }));
vi.mock("@/lib/auth/scope", () => ({ scopedVagaWhere: () => ({}) }));
vi.mock("@/lib/financeiro/consultas", () => ({ titulosEmAberto }));
vi.mock("@/lib/financeiro/pendencias/consultas", () => ({ resumoDasPendencias: vi.fn() }));
vi.mock("@/lib/financeiro/pendencias/setor", () => ({ setorPadraoDasPendencias: vi.fn(), soDoSetorPadrao: vi.fn() }));
vi.mock("@/lib/societario/fila", () => ({ listarFila, feriadosDoTenant: async () => [] }));
vi.mock("@/lib/certificados/servidor", () => ({ listarCertificados: vi.fn() }));

const { dadosDaCarteira, dadosDosProcessos, numerosDaHome } = await import("./dadosDosPaineis");

const ctx = { tenantId: "t1", userId: "u1" } as Parameters<typeof numerosDaHome>[0];
const contas = { setor: "bpo", modulos: new Set(["bpo_contas_pagar"]) };
const processos = { setor: "societario", modulos: new Set(["societario_processos"]) };

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("consultas dos painéis da Home", () => {
  it("a consulta que falha vira null, e o erro vai para o log", async () => {
    listarFila.mockRejectedValue(new Error("fila fora do ar"));
    await expect(dadosDosProcessos("t1")).resolves.toBeNull();
    expect(console.error).toHaveBeenCalledWith(expect.stringContaining("processos"), expect.any(Error));
  });

  it("a que funciona segue normal", async () => {
    titulosEmAberto.mockResolvedValue([]);
    const carteira = await dadosDaCarteira("t1");
    expect(carteira?.pagar.vencida).toEqual({ n: 0, centavos: 0 });
  });

  it("a faixa fica sem o número do painel que falhou e mantém os outros", async () => {
    listarFila.mockRejectedValue(new Error("fila fora do ar"));
    titulosEmAberto.mockResolvedValue([]);
    const paineis = new Map([
      ["painel-contas", contas],
      ["painel-processos", processos],
    ] as const);
    const numeros = await numerosDaHome(ctx, paineis, undefined);
    expect(numeros.processos).toBeUndefined();
    expect(numeros.contas?.verPagar).toBe(true);
  });
});
