import { beforeEach, describe, expect, it, vi } from "vitest";

// A fila de /aprovacoes com o banco (10/11/2026): a empresa em que ela abre —
// a da faixa "Trabalhando em" — e quantas contas ela mostra ao abrir, que é o
// balão da aba "Aprovações" das Solicitações.

const m = vi.hoisted(() => ({
  count: vi.fn(),
  escolher: vi.fn(),
  empresas: vi.fn(),
  ctx: { userId: "u1", tenantId: "t1", role: "SECTOR_USER", sectors: ["bpo"] },
}));
vi.mock("@/lib/prisma", () => ({ getPrisma: () => ({ financeEntry: { count: m.count } }) }));
vi.mock("@/lib/auth/context", () => ({ getAuthContext: async () => m.ctx }));
vi.mock("@/lib/empresas/ultimaEmpresa", () => ({ escolherEmpresaDaTela: m.escolher }));
vi.mock("@/lib/financeiro/consultas", () => ({ empresasAtivasDoSeletor: m.empresas }));

import { contarFilaDeAprovacoes, empresaDaFilaDeAprovacoes } from "./filaServidor";

const EMPRESAS = [{ id: "c1" }, { id: "c2" }, { id: "c3" }];
const FOCO = { companyId: "c2", nome: "Matriz", logoUrl: null, matrizId: "c2", grupo: ["c2", "c3"], pedida: null };

beforeEach(() => {
  vi.clearAllMocks();
  m.empresas.mockResolvedValue(EMPRESAS);
  m.count.mockResolvedValue(7);
});

describe("empresaDaFilaDeAprovacoes", () => {
  it("pergunta como a tela: com 'todas' e seguindo o foco", async () => {
    m.escolher.mockResolvedValue({ empresa: null, foco: null });
    await empresaDaFilaDeAprovacoes(undefined);
    expect(m.empresas).toHaveBeenCalledWith("t1");
    expect(m.escolher).toHaveBeenCalledWith(m.ctx, undefined, EMPRESAS, { permitirTodas: true, comFoco: true });
  });

  it("sem foco: todas as empresas", async () => {
    m.escolher.mockResolvedValue({ empresa: null, foco: null });
    expect(await empresaDaFilaDeAprovacoes(undefined)).toEqual({ foco: null, empresaId: null });
  });

  it("com foco na base inteira: a fila fica na empresa em foco — a alçada é de cada empresa", async () => {
    m.escolher.mockResolvedValue({ empresa: null, foco: FOCO });
    expect((await empresaDaFilaDeAprovacoes(undefined)).empresaId).toBe("c2");
  });

  it("com empresa escolhida: a dela", async () => {
    m.escolher.mockResolvedValue({ empresa: { id: "c3" }, foco: FOCO });
    expect((await empresaDaFilaDeAprovacoes("c3")).empresaId).toBe("c3");
  });
});

describe("contarFilaDeAprovacoes", () => {
  it("conta aguardando e reprovadas, como a fila abre", async () => {
    expect(await contarFilaDeAprovacoes("t1", null)).toBe(7);
    expect(m.count).toHaveBeenCalledWith({
      where: { tenantId: "t1", kind: "PAGAR", status: { not: "CANCELADO" }, approvalStatus: { in: ["AGUARDANDO", "REPROVADO"] } },
    });
  });

  it("na empresa da fila, quando há uma", async () => {
    await contarFilaDeAprovacoes("t1", "c2");
    expect(m.count).toHaveBeenCalledWith({
      where: { tenantId: "t1", kind: "PAGAR", status: { not: "CANCELADO" }, companyId: "c2", approvalStatus: { in: ["AGUARDANDO", "REPROVADO"] } },
    });
  });
});
