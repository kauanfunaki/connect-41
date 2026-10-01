import { describe, expect, it, vi } from "vitest";

// O módulo lê o banco para o setor padrão; aqui só as funções puras importam.
vi.mock("@/lib/modules", () => ({ isModuleEnabled: async () => false, setorDoModulo: async () => null }));

import { dosSetores, pedidosAoClienteNoConjunto, setorDaPendencia, soDoSetorPadrao, whereDoRecorteDeSetor } from "./setor";

describe("setor da pendência (01/10: qualquer setor pede ao cliente)", () => {
  it("a pendência sem setor, de antes de 01/10, é do setor do módulo", () => {
    expect(setorDaPendencia(null, "bpo")).toBe("bpo");
    expect(setorDaPendencia("dp", "bpo")).toBe("dp");
  });

  it("a tela, o painel, a agenda e a IA do BPO veem o BPO e as sem setor — nunca as do DP", () => {
    expect(whereDoRecorteDeSetor(soDoSetorPadrao("bpo"))).toEqual({ OR: [{ sectorCode: { in: ["bpo"] } }, { sectorCode: null }] });
  });

  it("quem é do DP e do Fiscal vê os dois, e as sem setor só se enxergar o BPO", () => {
    expect(dosSetores(["dp", "fiscal"], "bpo")).toEqual({ codigos: ["dp", "fiscal"], incluiSemSetor: false });
    expect(dosSetores(["dp", "bpo"], "bpo")).toEqual({ codigos: ["dp", "bpo"], incluiSemSetor: true });
    expect(whereDoRecorteDeSetor(dosSetores(["dp"], "bpo"))).toEqual({ OR: [{ sectorCode: { in: ["dp"] } }] });
  });

  it("os pedidos ao cliente valem com o módulo do BPO ou com o canal do portal", () => {
    expect(pedidosAoClienteNoConjunto(new Set(["bpo_pendencias"]))).toBe(true);
    expect(pedidosAoClienteNoConjunto(new Set(["portal_solicitacoes"]))).toBe(true);
    expect(pedidosAoClienteNoConjunto(new Set(["bpo_dre"]))).toBe(false);
  });
});
