import { describe, expect, it } from "vitest";
import type { AuthContext } from "@/lib/auth/context";
import { scopedVagaWhere } from "@/lib/auth/scope";
import { recorteDasVagas } from "@/lib/ia/ferramentas-recrutamento-setor";
import { acessoDoRecrutador, ehCoordenadorDoRecrutamento, regraDoRecrutador, regraPeloAcesso } from "./acessoVagas";

function ctx(role: AuthContext["role"], sectors: string[], activeSector: string | null = null): AuthContext {
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

const DO_RECRUTADOR = [{ restrictedToRecruiters: false }, { recrutadoresPermitidos: { some: { userId: "u1" } } }];

describe("quem vê as vagas (decisão de 28/09)", () => {
  it("recrutador vê as vagas de todos os setores que não foram restritas, e as restritas em que foi escolhido", () => {
    expect(scopedVagaWhere(ctx("SECTOR_USER", ["recrutamento"]))).toEqual({ tenantId: "t1", OR: DO_RECRUTADOR });
  });

  it("recrutador que também é de outro setor soma as vagas daquele setor, restritas ou não", () => {
    expect(scopedVagaWhere(ctx("SECTOR_USER", ["recrutamento", "tech"]))).toEqual({
      tenantId: "t1",
      OR: [{ sectorCode: { in: ["tech"] } }, ...DO_RECRUTADOR],
    });
  });

  it("vaga do próprio Recrutamento também obedece à restrição", () => {
    const onde = scopedVagaWhere(ctx("SECTOR_USER", ["recrutamento"]));
    expect(JSON.stringify(onde)).not.toContain('"recrutamento"');
  });

  it("coordenador do Recrutamento vê todas, inclusive as restritas", () => {
    expect(scopedVagaWhere(ctx("SECTOR_ADMIN", ["recrutamento"]))).toEqual({ tenantId: "t1" });
  });

  it("coordenador de outro setor segue vendo só o setor dele", () => {
    expect(scopedVagaWhere(ctx("SECTOR_ADMIN", ["societario"]))).toEqual({
      tenantId: "t1",
      sectorCode: { in: ["societario"] },
    });
  });

  it("com outro setor ativo, o recrutador vê só aquele setor — o setor ativo é filtro de visão", () => {
    expect(scopedVagaWhere(ctx("SECTOR_USER", ["recrutamento", "tech"], "tech"))).toEqual({
      tenantId: "t1",
      sectorCode: { in: ["tech"] },
    });
  });

  it("com o Recrutamento ativo, o recrutador vê pelo caminho do Recrutamento", () => {
    expect(scopedVagaWhere(ctx("SECTOR_USER", ["recrutamento", "tech"], "recrutamento"))).toEqual({
      tenantId: "t1",
      OR: DO_RECRUTADOR,
    });
  });

  it("admin continua vendo o tenant inteiro", () => {
    expect(scopedVagaWhere(ctx("ADMIN", []))).toEqual({ tenantId: "t1" });
    expect(regraDoRecrutador(ctx("ADMIN", ["recrutamento"]))).toBeNull();
  });

  it("quem não é do Recrutamento não ganha nada", () => {
    expect(regraDoRecrutador(ctx("SECTOR_USER", ["bpo"]))).toBeNull();
    expect(scopedVagaWhere(ctx("SECTOR_USER", ["bpo"]))).toEqual({ tenantId: "t1", sectorCode: { in: ["bpo"] } });
  });

  it("coordenador é visão: não depende da assinatura estar em dia", () => {
    const somenteLeitura: AuthContext = { ...ctx("SECTOR_ADMIN", ["recrutamento"]), subscriptionReadOnly: true };
    expect(ehCoordenadorDoRecrutamento(somenteLeitura)).toBe(true);
  });
});

describe("a mesma regra na IA do Recrutamento", () => {
  const ia = (setores: string, recrutador?: string) => ({
    tenantId: "t1",
    userId: "u1",
    escopo: { setores, ...(recrutador === undefined ? {} : { recrutador }) } as Record<string, string>,
  });

  it("o acesso vira texto no recorte e volta como regra", () => {
    expect(acessoDoRecrutador(ctx("SECTOR_USER", ["recrutamento"]))).toBe("restrito");
    expect(acessoDoRecrutador(ctx("SECTOR_ADMIN", ["recrutamento"]))).toBe("todas");
    expect(acessoDoRecrutador(ctx("SECTOR_USER", ["bpo"]))).toBe("");
    expect(regraPeloAcesso("restrito", "u1")).toEqual({ OR: DO_RECRUTADOR });
    expect(regraPeloAcesso("restrito", null)).toBeNull();
  });

  it("recrutador no chat vê o mesmo que na tela", () => {
    expect(recorteDasVagas(ia("recrutamento", "restrito"))).toEqual({ tenantId: "t1", OR: DO_RECRUTADOR });
    expect(recorteDasVagas(ia("recrutamento", "todas"))).toEqual({ tenantId: "t1" });
  });

  it("conversa aberta antes da mudança (sem a chave) mantém o recorte antigo", () => {
    expect(recorteDasVagas(ia("recrutamento"))).toEqual({ tenantId: "t1", sectorCode: { in: ["recrutamento"] } });
  });
});
