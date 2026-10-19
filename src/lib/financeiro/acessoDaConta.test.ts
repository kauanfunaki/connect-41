import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AuthContext } from "@/lib/auth/context";

// Quem mexe na conta (janela Editar e anexos) e quem baixa o anexo, com perfis
// de um e dois setores — a conta do Kauan é admin e vê tudo, então o que só
// foi visto nela não prova nada sobre quem opera o BPO.

const quem = vi.hoisted(() => ({ ctx: null as AuthContext | null, setores: {} as Record<string, string | null> }));

vi.mock("@/lib/auth/context", async () => {
  const papeis = await import("@/lib/auth/papeis");
  return { ...papeis, getAuthContext: vi.fn(async () => quem.ctx) };
});
vi.mock("@/lib/modules", () => ({ setorDoModulo: vi.fn(async (_t: string, m: string) => quem.setores[m] ?? null) }));

import { podeEditarOTipo, podeVerOTipo } from "./acessoDaConta";

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
  quem.ctx = null;
  quem.setores = {};
});

describe("podeEditarOTipo (Editar e anexos)", () => {
  it("quem é só do BPO edita conta a pagar e a receber", async () => {
    quem.ctx = ctx("SECTOR_USER", ["bpo"]);
    expect((await podeEditarOTipo("PAGAR")).ctx).not.toBeNull();
    expect((await podeEditarOTipo("RECEBER")).ctx).not.toBeNull();
  });

  it("quem é de outro setor não edita, e a mensagem diz o tipo", async () => {
    quem.ctx = ctx("SECTOR_USER", ["dp"]);
    expect(await podeEditarOTipo("PAGAR")).toEqual({ ctx: null, erro: "Sem permissão em contas a pagar." });
    expect(await podeEditarOTipo("RECEBER")).toEqual({ ctx: null, erro: "Sem permissão em contas a receber." });
  });

  it("quem tem dois setores, um deles o BPO, edita", async () => {
    quem.ctx = ctx("SECTOR_USER", ["dp", "bpo"]);
    expect((await podeEditarOTipo("PAGAR")).ctx).not.toBeNull();
  });

  it("só leitura não edita", async () => {
    quem.ctx = ctx("READONLY", []);
    expect((await podeEditarOTipo("PAGAR")).ctx).toBeNull();
  });

  it("assinatura em atraso não edita, nem o admin", async () => {
    quem.ctx = ctx("ADMIN", [], { subscriptionReadOnly: true });
    expect((await podeEditarOTipo("PAGAR")).ctx).toBeNull();
  });

  it("módulo movido de setor: vale o setor que opera o módulo no escritório", async () => {
    quem.setores = { bpo_contas_pagar: "financeiro" };
    quem.ctx = ctx("SECTOR_USER", ["financeiro"]);
    expect((await podeEditarOTipo("PAGAR")).ctx).not.toBeNull();
    // Contas a receber e Lançamentos continuam no BPO: quem é só do financeiro não mexe nelas.
    expect((await podeEditarOTipo("RECEBER")).ctx).toBeNull();
  });

  it("sem login, não autenticado", async () => {
    quem.ctx = ctx("SECTOR_USER", ["bpo"], { tenantId: "" });
    expect(await podeEditarOTipo("PAGAR")).toEqual({ ctx: null, erro: "Não autenticado." });
  });
});

describe("podeVerOTipo (baixar o anexo)", () => {
  it("quem é do BPO baixa", async () => {
    expect(await podeVerOTipo(ctx("SECTOR_USER", ["bpo"]), "PAGAR")).toBe(true);
  });

  it("só leitura baixa, mas não edita", async () => {
    expect(await podeVerOTipo(ctx("READONLY", []), "RECEBER")).toBe(true);
  });

  it("quem é de outro setor não baixa", async () => {
    expect(await podeVerOTipo(ctx("SECTOR_USER", ["societario"]), "PAGAR")).toBe(false);
  });

  it("módulo movido de setor: quem opera o módulo baixa", async () => {
    quem.setores = { bpo_contas_receber: "financeiro" };
    expect(await podeVerOTipo(ctx("SECTOR_USER", ["financeiro"]), "RECEBER")).toBe(true);
    expect(await podeVerOTipo(ctx("SECTOR_USER", ["financeiro"]), "PAGAR")).toBe(false);
  });
});
