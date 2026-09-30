import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AuthContext } from "@/lib/auth/context";

// Os módulos do tenant, simulados: todos os dos painéis ativos, cada um no
// setor do catálogo — salvo quando o teste muda.
const estados = vi.hoisted(() => ({
  lista: [] as { code: string; enabled: boolean; sectorCode: string }[],
}));
vi.mock("@/lib/modules", () => ({ getTenantModuleStates: async () => estados.lista }));

import { acessoDosPaineis } from "./acessoDosPaineis";

const PADRAO = [
  { code: "bpo_contas_pagar", enabled: true, sectorCode: "bpo" },
  { code: "bpo_contas_receber", enabled: true, sectorCode: "bpo" },
  { code: "bpo_pendencias", enabled: true, sectorCode: "bpo" },
  { code: "bpo_aprovacoes", enabled: true, sectorCode: "bpo" },
  { code: "societario_processos", enabled: true, sectorCode: "societario" },
  { code: "dp_colaboradores", enabled: true, sectorCode: "dp" },
  { code: "recrutamento_vagas", enabled: true, sectorCode: "recrutamento" },
  { code: "tech_certificados", enabled: true, sectorCode: "tech" },
];

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

async function paineis(c: AuthContext): Promise<string[]> {
  return Array.from((await acessoDosPaineis(c)).keys()).sort();
}

beforeEach(() => {
  estados.lista = PADRAO.map((e) => ({ ...e }));
});

describe("quem vê qual painel da Home", () => {
  it("admin em Todos os setores vê todos", async () => {
    expect(await paineis(ctx("ADMIN", []))).toEqual([
      "painel-certificados",
      "painel-contas",
      "painel-dp",
      "painel-pendencias",
      "painel-processos",
      "painel-recrutamento",
      "painel-semanas",
    ]);
  });

  it("usuário só do BPO vê só os painéis do BPO", async () => {
    expect(await paineis(ctx("SECTOR_USER", ["bpo"]))).toEqual(["painel-contas", "painel-pendencias", "painel-semanas"]);
  });

  it("coordenador de DP e Recrutamento vê os dois, e nada do BPO", async () => {
    expect(await paineis(ctx("SECTOR_ADMIN", ["dp", "recrutamento"]))).toEqual(["painel-dp", "painel-recrutamento"]);
  });

  it("setor sem painel (ex.: Contábil) não vê nenhum painel de setor", async () => {
    expect(await paineis(ctx("SECTOR_USER", ["contabil"]))).toEqual([]);
  });

  it("com setor ativo, só os painéis dele — mesmo para o admin", async () => {
    expect(await paineis(ctx("ADMIN", [], { activeSector: "societario" }))).toEqual(["painel-processos"]);
  });

  it("Diretoria (somente leitura) não vê o que as telas pedem para agir", async () => {
    // /pagar, /receber e /processos pedem canActOnSector; /pendencias, /aprovacoes, DP, vagas e certificados, só ver.
    expect(await paineis(ctx("READONLY", []))).toEqual([
      "painel-certificados",
      "painel-dp",
      "painel-pendencias",
      "painel-recrutamento",
    ]);
  });

  it("módulo desligado no tenant some, e o painel mostra só a parte que sobrou", async () => {
    estados.lista = estados.lista.map((e) => (e.code === "bpo_contas_pagar" ? { ...e, enabled: false } : e));
    const acesso = await acessoDosPaineis(ctx("SECTOR_USER", ["bpo"]));
    expect(acesso.has("painel-semanas")).toBe(false);
    expect(Array.from(acesso.get("painel-contas")!.modulos)).toEqual(["bpo_contas_receber"]);
  });

  it("módulo movido de setor segue o setor novo", async () => {
    estados.lista = estados.lista.map((e) => (e.code === "tech_certificados" ? { ...e, sectorCode: "fiscal" } : e));
    expect(await paineis(ctx("SECTOR_USER", ["fiscal"]))).toEqual(["painel-certificados"]);
    expect(await paineis(ctx("SECTOR_USER", ["tech"]))).toEqual([]);
  });
});
