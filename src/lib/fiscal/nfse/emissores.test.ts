import { describe, expect, it, vi } from "vitest";
import type { EmissorDeNfse, ResumoDoAcompanhamento } from "./emissor";

// O que se testa: a escolha do emissor de cada empresa e de cada emissão, e a
// rodada do cron somando os emissores. O Omie de verdade não é chamado — os
// emissores são simulados e passados à mão, como a Focus vai entrar.
vi.mock("./omie", () => ({ emissorOmie: {} }));

const { acompanharTodas, emissorDaEmissao, emissorDaEmpresa } = await import("./emissores");

const resumo = (r: Partial<ResumoDoAcompanhamento> = {}): ResumoDoAcompanhamento => ({
  consultadas: 0,
  autorizadas: 0,
  rejeitadas: 0,
  canceladas: 0,
  seguem: 0,
  falhas: [],
  ...r,
});

function simulado(nome: string, p: { empresas?: string[]; emissoes?: Record<string, string>; acompanhar?: () => Promise<ResumoDoAcompanhamento> } = {}): EmissorDeNfse {
  return {
    provedor: "omie",
    nome,
    entidade: `${nome}Emissao`,
    atendeAEmpresa: async (_t, companyId) => (p.empresas ?? []).includes(companyId),
    empresaDaEmissao: async (_t, id) => p.emissoes?.[id] ?? null,
    listas: vi.fn(),
    buscarTomadores: vi.fn(),
    emitir: vi.fn(),
    cancelar: vi.fn(),
    listarEmissoes: vi.fn(),
    acompanhar: p.acompanhar ?? (async () => resumo()),
  };
}

describe("emissor da empresa", () => {
  it("o primeiro da lista que atende a empresa é o escolhido", async () => {
    const a = simulado("A", { empresas: ["c1"] });
    const b = simulado("B", { empresas: ["c1", "c2"] });
    expect(await emissorDaEmpresa("t1", "c1", [a, b])).toBe(a);
    expect(await emissorDaEmpresa("t1", "c2", [a, b])).toBe(b);
  });

  it("empresa que nenhum atende fica sem emissor", async () => {
    expect(await emissorDaEmpresa("t1", "c9", [simulado("A", { empresas: ["c1"] })])).toBeNull();
  });
});

describe("emissor da emissão", () => {
  it("cancela pelo emissor que emitiu, com a empresa dele", async () => {
    const a = simulado("A", { empresas: ["c1"] });
    const b = simulado("B", { emissoes: { e7: "c1" } });
    expect(await emissorDaEmissao("t1", "e7", [a, b])).toEqual({ emissor: b, companyId: "c1" });
    expect(await emissorDaEmissao("t1", "e8", [a, b])).toBeNull();
  });
});

describe("a rodada do cron", () => {
  it("soma os emissores, e um que cai inteiro vira falha sem parar os outros", async () => {
    const a = simulado("A", { acompanhar: async () => resumo({ consultadas: 3, autorizadas: 1, seguem: 2 }) });
    const b = simulado("B", {
      acompanhar: async () => {
        throw new Error("banco fora");
      },
    });
    const c = simulado("C", { acompanhar: async () => resumo({ consultadas: 1, rejeitadas: 1, falhas: [{ emissaoId: "e3", erro: "chave vencida" }] }) });

    expect(await acompanharTodas(new Date(), [a, b, c])).toEqual({
      consultadas: 4,
      autorizadas: 1,
      rejeitadas: 1,
      canceladas: 0,
      seguem: 2,
      falhas: [
        { emissaoId: "-", erro: "B: banco fora" },
        { emissaoId: "e3", erro: "chave vencida" },
      ],
    });
  });
});
