import { describe, expect, it } from "vitest";
import {
  scopedHandoffWhere,
  scopedPipelineWhere,
  scopedSpaceWhere,
  scopedVagaWhere,
  scopedAssessmentLinkWhere,
} from "./scope";
import type { AuthContext } from "./context";

function ctx(
  role: AuthContext["role"],
  sectors: string[] = [],
  activeSector: string | null = null,
): AuthContext {
  return {
    userId: "u1",
    tenantId: "t1",
    homeTenantId: "t1",
    role,
    sectors,
    subscriptionReadOnly: false,
    canSelfRegularizeSubscription: true,
    activeSector,
  };
}

// ── O escopo de LEITURA acompanha o setor ativo ──────────────────────────────
describe("escopo por setor segue o setor ativo", () => {
  const helpers = [
    ["pipeline", scopedPipelineWhere],
    ["space", scopedSpaceWhere],
    ["vaga", scopedVagaWhere],
    ["assessmentLink", scopedAssessmentLinkWhere],
  ] as const;

  for (const [nome, helper] of helpers) {
    it(`${nome}: setor ativo estreita para ele`, () => {
      expect(helper(ctx("SECTOR_USER", ["bpo", "fiscal"], "bpo"))).toEqual({
        tenantId: "t1",
        sectorCode: { in: ["bpo"] },
      });
    });

    it(`${nome}: sem setor ativo mantém a união dos setores da pessoa`, () => {
      expect(helper(ctx("SECTOR_USER", ["bpo", "fiscal"]))).toEqual({
        tenantId: "t1",
        sectorCode: { in: ["bpo", "fiscal"] },
      });
    });

    it(`${nome}: full access em "Todos" não filtra`, () => {
      expect(helper(ctx("ADMIN"))).toEqual({ tenantId: "t1" });
    });

    it(`${nome}: full access com setor ativo filtra por ele`, () => {
      expect(helper(ctx("ADMIN", [], "contabil"))).toEqual({
        tenantId: "t1",
        sectorCode: { in: ["contabil"] },
      });
    });

    it(`${nome}: sem setor nenhum continua não vendo nada`, () => {
      expect(helper(ctx("SECTOR_USER"))).toEqual({ tenantId: "t1", sectorCode: "__none__" });
    });
  }
});

// ── E o handoff NÃO acompanha ────────────────────────────────────────────────
//
// Este é o defeito mais provável desta mudança e o que falha em SILÊNCIO: se a
// transferência sumisse ao trocar o setor ativo, o handoff vindo de outro setor
// ficaria invisível e a transferência morreria parada — sem erro, sem alerta,
// sem ninguém reclamar até o prazo estourar.
describe("handoff ignora o setor ativo", () => {
  it("mesma consulta com e sem setor ativo, para quem tem vários setores", () => {
    const semSetorAtivo = scopedHandoffWhere(ctx("SECTOR_USER", ["bpo", "fiscal"]));
    for (const ativo of ["bpo", "fiscal"]) {
      expect(scopedHandoffWhere(ctx("SECTOR_USER", ["bpo", "fiscal"], ativo))).toEqual(semSetorAtivo);
    }
  });

  it("continua enxergando o setor que NÃO está ativo", () => {
    const where = scopedHandoffWhere(ctx("SECTOR_USER", ["bpo", "fiscal"], "bpo"));
    expect(where).toEqual({
      tenantId: "t1",
      OR: [
        { fromSector: { in: ["bpo", "fiscal"] } },
        { sectors: { some: { sectorCode: { in: ["bpo", "fiscal"] } } } },
        { requestedBy: "u1" },
      ],
    });
  });

  it("full access enxerga o tenant inteiro mesmo com setor ativo", () => {
    expect(scopedHandoffWhere(ctx("ADMIN", [], "bpo"))).toEqual({ tenantId: "t1" });
  });

  it("quem não tem setor continua vendo o que abriu", () => {
    expect(scopedHandoffWhere(ctx("SECTOR_USER", [], "bpo"))).toEqual({
      tenantId: "t1",
      requestedBy: "u1",
    });
  });
});
