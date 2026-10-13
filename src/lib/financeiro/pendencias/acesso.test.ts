import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AuthContext } from "@/lib/auth/context";

// Os módulos do escritório, simulados: quais estão ligados e em que setor o
// `bpo_pendencias` opera (nulo = o do catálogo, "bpo").
const estado = vi.hoisted(() => ({
  ligados: new Set<string>(),
  setorDoModuloDoBpo: null as string | null,
}));
vi.mock("@/lib/modules", () => ({
  isModuleEnabled: async (_t: string, codigo: string) => estado.ligados.has(codigo),
  setorDoModulo: async (_t: string, codigo: string) => (codigo === "bpo_pendencias" ? (estado.setorDoModuloDoBpo ?? "bpo") : null),
}));

import { podeAbrirPendencia, reguaDasPendencias, type ReguaDasPendencias } from "./acesso";

function ctx(role: AuthContext["role"], sectors: string[], extra: Partial<AuthContext> = {}): AuthContext {
  return {
    userId: "u1",
    tenantId: "t1",
    homeTenantId: "t1",
    role,
    sectors,
    subscriptionReadOnly: false,
    canSelfRegularizeSubscription: true,
    activeSector: null,
    ...extra,
  };
}

const LIGADOS: ReguaDasPendencias = { ligados: true, padrao: "bpo" };
const DESLIGADOS: ReguaDasPendencias = { ligados: false, padrao: "bpo" };

const doDp = { tenantId: "t1", sectorCode: "dp" };
const doFiscal = { tenantId: "t1", sectorCode: "fiscal" };
const doBpo = { tenantId: "t1", sectorCode: "bpo" };
/** Pendência de antes de 01/10: sem setor, é do setor do módulo. */
const antiga = { tenantId: "t1", sectorCode: null };
const deOutroEscritorio = { tenantId: "t2", sectorCode: "dp" };

beforeEach(() => {
  estado.ligados = new Set(["bpo_pendencias", "portal_solicitacoes"]);
  estado.setorDoModuloDoBpo = null;
});

describe("quem da equipe abre a pendência (e baixa os anexos dela)", () => {
  it("pessoa só do DP abre o pedido do DP — era o 403 do download", () => {
    expect(podeAbrirPendencia(ctx("SECTOR_USER", ["dp"]), LIGADOS, doDp)).toBe(true);
  });

  it("pessoa só do DP não abre a do BPO nem a antiga, sem setor", () => {
    expect(podeAbrirPendencia(ctx("SECTOR_USER", ["dp"]), LIGADOS, doBpo)).toBe(false);
    expect(podeAbrirPendencia(ctx("SECTOR_USER", ["dp"]), LIGADOS, antiga)).toBe(false);
  });

  it("pessoa só do BPO abre a do BPO e a antiga, mas não o pedido do DP", () => {
    const bpo = ctx("SECTOR_USER", ["bpo"]);
    expect(podeAbrirPendencia(bpo, LIGADOS, doBpo)).toBe(true);
    expect(podeAbrirPendencia(bpo, LIGADOS, antiga)).toBe(true);
    expect(podeAbrirPendencia(bpo, LIGADOS, doDp)).toBe(false);
  });

  it("pessoa de dois setores abre as dos dois, e só elas", () => {
    const dpEFiscal = ctx("SECTOR_USER", ["dp", "fiscal"]);
    expect(podeAbrirPendencia(dpEFiscal, LIGADOS, doDp)).toBe(true);
    expect(podeAbrirPendencia(dpEFiscal, LIGADOS, doFiscal)).toBe(true);
    expect(podeAbrirPendencia(dpEFiscal, LIGADOS, doBpo)).toBe(false);
    expect(podeAbrirPendencia(dpEFiscal, LIGADOS, antiga)).toBe(false);
  });

  it("coordenador de outro setor não abre: o papel não passa por cima do setor", () => {
    expect(podeAbrirPendencia(ctx("SECTOR_ADMIN", ["societario"]), LIGADOS, doDp)).toBe(false);
    expect(podeAbrirPendencia(ctx("SECTOR_USER", []), LIGADOS, doDp)).toBe(false);
  });

  it("o setor ativo é filtro de visão, não permissão: com o Fiscal ativo, segue abrindo a do DP", () => {
    expect(podeAbrirPendencia(ctx("SECTOR_USER", ["dp", "fiscal"], { activeSector: "fiscal" }), LIGADOS, doDp)).toBe(true);
  });

  it("READONLY e admin abrem de qualquer setor; assinatura vencida não tira a leitura", () => {
    expect(podeAbrirPendencia(ctx("READONLY", []), LIGADOS, doDp)).toBe(true);
    expect(podeAbrirPendencia(ctx("READONLY", []), LIGADOS, antiga)).toBe(true);
    expect(podeAbrirPendencia(ctx("ADMIN", []), LIGADOS, doFiscal)).toBe(true);
    expect(podeAbrirPendencia(ctx("SECTOR_USER", ["dp"], { subscriptionReadOnly: true }), LIGADOS, doDp)).toBe(true);
  });

  it("com os pedidos ao cliente desligados, ninguém abre — nem o admin", () => {
    expect(podeAbrirPendencia(ctx("ADMIN", []), DESLIGADOS, doDp)).toBe(false);
    expect(podeAbrirPendencia(ctx("SECTOR_USER", ["dp"]), DESLIGADOS, doDp)).toBe(false);
  });

  it("outro escritório, nunca — nem o SUPER_ADMIN; sem escritório na sessão, também não", () => {
    expect(podeAbrirPendencia(ctx("SUPER_ADMIN", []), LIGADOS, deOutroEscritorio)).toBe(false);
    expect(podeAbrirPendencia(ctx("SECTOR_USER", ["dp"]), LIGADOS, deOutroEscritorio)).toBe(false);
    expect(podeAbrirPendencia(ctx("ADMIN", [], { tenantId: "" }), LIGADOS, { tenantId: "", sectorCode: "dp" })).toBe(false);
  });
});

describe("a régua do escritório", () => {
  it("vale com o módulo do BPO ou só com o canal do portal; sem os dois, desligada", async () => {
    expect(await reguaDasPendencias("t1")).toEqual({ ligados: true, padrao: "bpo" });
    estado.ligados = new Set(["portal_solicitacoes"]);
    expect((await reguaDasPendencias("t1")).ligados).toBe(true);
    estado.ligados = new Set(["bpo_pendencias"]);
    expect((await reguaDasPendencias("t1")).ligados).toBe(true);
    estado.ligados = new Set(["bpo_dre"]);
    expect((await reguaDasPendencias("t1")).ligados).toBe(false);
  });

  it("as antigas, sem setor, seguem o setor em que o módulo do BPO opera no escritório", async () => {
    estado.setorDoModuloDoBpo = "financeiro";
    const regua = await reguaDasPendencias("t1");
    expect(regua.padrao).toBe("financeiro");
    expect(podeAbrirPendencia(ctx("SECTOR_USER", ["financeiro"]), regua, antiga)).toBe(true);
    expect(podeAbrirPendencia(ctx("SECTOR_USER", ["bpo"]), regua, antiga)).toBe(false);
  });

  it("escritório só com o canal do portal: a pessoa do DP abre o pedido do DP", async () => {
    estado.ligados = new Set(["portal_solicitacoes"]);
    const regua = await reguaDasPendencias("t1");
    expect(podeAbrirPendencia(ctx("SECTOR_USER", ["dp"]), regua, doDp)).toBe(true);
    expect(podeAbrirPendencia(ctx("SECTOR_USER", ["societario"]), regua, doDp)).toBe(false);
  });
});
