import { beforeEach, describe, expect, it, vi } from "vitest";
import { criarCenario } from "@/lib/fiscal/previa/cenario";

const m = vi.hoisted(() => ({ ctx: { tenantId: "t1", userId: "u1", role: "ADMIN" }, ler: vi.fn(), pode: vi.fn(), gravar: vi.fn() }));
vi.mock("@/lib/auth/context", () => ({ getAuthContext: async () => m.ctx, podeExcluir: (ctx: { role: string }) => ctx.role === "ADMIN" }));
vi.mock("@/lib/auth/modulo", () => ({ podeNoModulo: m.pode }));
vi.mock("@/lib/prisma", () => ({ getPrisma: () => ({ localFiscalScenario: { updateMany: m.gravar } }) }));
vi.mock("@/lib/fiscal/local/servidor", () => ({ lerEstadoFiscalLocal: m.ler }));
import { agirNoFiscalLocal } from "./local-actions";

beforeEach(() => {
  vi.clearAllMocks();
  m.ler.mockResolvedValue({ cenario: criarCenario(), favoritas: [], revisao: 3 });
  m.pode.mockResolvedValue(true);
  m.gravar.mockResolvedValue({ count: 1 });
});
describe("ações fiscais com persistência local", () => {
  it("valida a entrada no servidor antes de buscar o cenário", async () => {
    expect((await agirNoFiscalLocal({ tipo: "gerar", imposto: "inexistente" }, 3)).erro).toBe(true);
    expect(m.ler).not.toHaveBeenCalled();
    expect(m.gravar).not.toHaveBeenCalled();
  });
  it("bloqueia ações sem permissão e não grava", async () => {
    m.pode.mockResolvedValue(false);
    expect((await agirNoFiscalLocal({ tipo: "gerar", imposto: "ICMS/IPI" }, 3)).erro).toBe(true);
    expect(m.gravar).not.toHaveBeenCalled();
  });
  it("não sobrescreve um cenário alterado por outra aba", async () => {
    expect((await agirNoFiscalLocal({ tipo: "gerar", imposto: "ICMS/IPI" }, 2)).erro).toBe(true);
    expect(m.gravar).not.toHaveBeenCalled();
  });
  it("deriva o escopo da sessão e grava com revisão condicional", async () => {
    const resultado = await agirNoFiscalLocal({ tipo: "gerar", imposto: "ICMS/IPI", tenantId: "outro", userId: "outro" }, 3);
    expect(resultado.erro).toBeUndefined();
    expect(resultado.estado?.revisao).toBe(4);
    expect(m.gravar).toHaveBeenCalledWith(expect.objectContaining({ where: { tenantId: "t1", userId: "u1", revision: 3 } }));
    expect(m.pode).toHaveBeenCalledWith(m.ctx, "fiscal_entregas", "agir");
  });
  it("detecta corrida entre a leitura e a gravação", async () => {
    m.gravar.mockResolvedValue({ count: 0 });
    const resultado = await agirNoFiscalLocal({ tipo: "gerar", imposto: "ICMS/IPI" }, 3);
    expect(resultado.erro).toBe(true);
    expect(m.ler).toHaveBeenCalledTimes(2);
  });
  it("recusa ambientes ou usuários sem cenário disponível", async () => {
    m.ler.mockResolvedValue(null);
    expect((await agirNoFiscalLocal({ tipo: "gerar", imposto: "ICMS/IPI" }, 3)).erro).toBe(true);
    expect(m.gravar).not.toHaveBeenCalled();
  });
  it("restaura o cenário da sessão no banco sem versões nem protocolos iniciais", async () => {
    const resultado = await agirNoFiscalLocal({ tipo: "restaurar", tenantId: "outro", userId: "outro" }, 3);
    expect(resultado.erro).toBeUndefined();
    expect(resultado.estado?.cenario.documentos.length).toBeGreaterThan(0);
    expect(resultado.estado?.cenario.arquivos).toEqual([]);
    expect(resultado.estado?.cenario.execucoes).toEqual([]);
    expect(resultado.estado?.cenario.atividades).toEqual([]);
    expect(resultado.estado?.favoritas).toEqual([]);
    expect(resultado.estado?.revisao).toBe(4);
    expect(m.gravar).toHaveBeenCalledWith(expect.objectContaining({ where: { tenantId: "t1", userId: "u1", revision: 3 } }));
  });
});
