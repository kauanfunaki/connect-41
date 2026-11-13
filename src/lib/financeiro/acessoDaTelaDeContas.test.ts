import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AuthContext } from "@/lib/auth/context";

// Quem usa Contas a pagar e a receber (13/11/2026) — a página, a exportação e
// o funil das colunas, que passou a ir ao servidor. Com perfis de um e dois
// setores: a conta do Kauan é admin e vê tudo, e o que só foi visto nela não
// prova nada sobre quem opera o BPO.

const quem = vi.hoisted(() => ({ setores: {} as Record<string, string[] | null>, ligados: new Set<string>() }));

vi.mock("@/lib/modules", () => ({
  setoresDoModulo: vi.fn(async (_t: string, m: string) => quem.setores[m] ?? null),
  isModuleEnabled: vi.fn(async (_t: string, m: string) => quem.ligados.has(m)),
}));

const { podeUsarATelaDeContas } = await import("./acessoDaTelaDeContas");

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

beforeEach(() => {
  quem.setores = { bpo_contas_pagar: ["bpo"], bpo_contas_receber: ["bpo"] };
  quem.ligados = new Set(["bpo_contas_pagar", "bpo_contas_receber"]);
});

describe("podeUsarATelaDeContas", () => {
  it("usuário de um setor só, o do BPO: entra nas duas telas", async () => {
    expect(await podeUsarATelaDeContas(ctx("SECTOR_USER", ["bpo"]), "bpo_contas_pagar")).toBe(true);
    expect(await podeUsarATelaDeContas(ctx("SECTOR_USER", ["bpo"]), "bpo_contas_receber")).toBe(true);
  });

  it("usuário de outro setor não entra", async () => {
    expect(await podeUsarATelaDeContas(ctx("SECTOR_USER", ["dp"]), "bpo_contas_pagar")).toBe(false);
    expect(await podeUsarATelaDeContas(ctx("SECTOR_ADMIN", ["fiscal"]), "bpo_contas_receber")).toBe(false);
  });

  it("dois setores, um deles o BPO: entra", async () => {
    expect(await podeUsarATelaDeContas(ctx("SECTOR_USER", ["dp", "bpo"]), "bpo_contas_pagar")).toBe(true);
  });

  it("com outro setor ativo, continua entrando: o setor ativo é filtro de visão, não permissão", async () => {
    expect(await podeUsarATelaDeContas(ctx("SECTOR_USER", ["dp", "bpo"], { activeSector: "dp" }), "bpo_contas_pagar")).toBe(true);
  });

  it("módulo desligado: ninguém entra, nem o admin", async () => {
    quem.ligados.delete("bpo_contas_pagar");
    expect(await podeUsarATelaDeContas(ctx("SECTOR_USER", ["bpo"]), "bpo_contas_pagar")).toBe(false);
    expect(await podeUsarATelaDeContas(ctx("ADMIN", []), "bpo_contas_pagar")).toBe(false);
    // O outro lado segue ligado.
    expect(await podeUsarATelaDeContas(ctx("SECTOR_USER", ["bpo"]), "bpo_contas_receber")).toBe(true);
  });

  it("módulo movido de setor: a tela acompanha — entra quem é do setor novo, sai quem era do antigo", async () => {
    quem.setores.bpo_contas_receber = ["financeiro"];
    expect(await podeUsarATelaDeContas(ctx("SECTOR_USER", ["bpo"]), "bpo_contas_receber")).toBe(false);
    expect(await podeUsarATelaDeContas(ctx("SECTOR_USER", ["financeiro"]), "bpo_contas_receber")).toBe(true);
  });

  it("tela de dois setores: entra quem é de qualquer um", async () => {
    quem.setores.bpo_contas_pagar = ["bpo", "financeiro"];
    expect(await podeUsarATelaDeContas(ctx("SECTOR_USER", ["financeiro"]), "bpo_contas_pagar")).toBe(true);
  });

  it("somente leitura — a Diretoria e a assinatura vencida — não opera a tela", async () => {
    expect(await podeUsarATelaDeContas(ctx("READONLY", []), "bpo_contas_pagar")).toBe(false);
    expect(await podeUsarATelaDeContas(ctx("SECTOR_USER", ["bpo"], { subscriptionReadOnly: true }), "bpo_contas_pagar")).toBe(false);
  });

  it("admin entra; sem tenant ou com módulo fora do catálogo, ninguém", async () => {
    expect(await podeUsarATelaDeContas(ctx("ADMIN", []), "bpo_contas_pagar")).toBe(true);
    expect(await podeUsarATelaDeContas(ctx("ADMIN", [], { tenantId: "" }), "bpo_contas_pagar")).toBe(false);
    expect(await podeUsarATelaDeContas(ctx("ADMIN", []), "modulo_que_nao_existe")).toBe(false);
  });
});
