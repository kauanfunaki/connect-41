import { describe, expect, it } from "vitest";
import type { AuthContext } from "@/lib/auth/context";
import { getModuleDef } from "@/lib/module-catalog";
import { acessoAEmissao, MODULO_EMITIR_NFSE } from "./acessoEmissao";

// Perfil simulado, no padrão de src/lib/recrutamento/acessoVagas.test.ts: a
// conta do Kauan é administradora e vê tudo, então a regra do setor só se
// prova assim.
function ctx(role: AuthContext["role"], sectors: string[], subscriptionReadOnly = false): AuthContext {
  return {
    userId: "u1",
    tenantId: "t1",
    homeTenantId: "t1",
    role,
    sectors,
    subscriptionReadOnly,
    canSelfRegularizeSubscription: true,
    activeSector: null,
  };
}

const BPO = getModuleDef(MODULO_EMITIR_NFSE)!.sectorCode;

describe("quem emite NFS-e pelo Connect (só administrador do setor)", () => {
  it("o módulo nasce no BPO e desligado", () => {
    expect(getModuleDef(MODULO_EMITIR_NFSE)).toMatchObject({ sectorCode: "bpo", defaultEnabled: false });
  });

  it("administrador do setor vê, emite e cancela", () => {
    expect(acessoAEmissao(ctx("SECTOR_ADMIN", [BPO]), BPO, true)).toEqual({ ver: true, emitir: true });
  });

  it("usuário comum do setor só vê", () => {
    expect(acessoAEmissao(ctx("SECTOR_USER", [BPO]), BPO, true)).toEqual({ ver: true, emitir: false });
  });

  it("quem é de outro setor nem vê — coordenador de lá inclusive", () => {
    expect(acessoAEmissao(ctx("SECTOR_USER", ["dp"]), BPO, true)).toEqual({ ver: false, emitir: false });
    expect(acessoAEmissao(ctx("SECTOR_ADMIN", ["dp"]), BPO, true)).toEqual({ ver: false, emitir: false });
  });

  it("leitura geral (READONLY) vê, mas nunca emite", () => {
    expect(acessoAEmissao(ctx("READONLY", []), BPO, true)).toEqual({ ver: true, emitir: false });
  });

  it("módulo desligado fecha para todos, administrador do escritório inclusive", () => {
    for (const quem of [ctx("SECTOR_ADMIN", [BPO]), ctx("SECTOR_USER", [BPO]), ctx("ADMIN", []), ctx("SUPER_ADMIN", []), ctx("READONLY", [])]) {
      expect(acessoAEmissao(quem, BPO, false)).toEqual({ ver: false, emitir: false });
    }
  });

  it("administrador do escritório emite, como em qualquer setor", () => {
    expect(acessoAEmissao(ctx("ADMIN", []), BPO, true)).toEqual({ ver: true, emitir: true });
  });

  it("assinatura vencida: o administrador do setor vê, mas não emite", () => {
    expect(acessoAEmissao(ctx("SECTOR_ADMIN", [BPO], true), BPO, true)).toEqual({ ver: true, emitir: false });
  });

  it("vale o setor que opera o módulo no escritório, não o do catálogo", () => {
    // Escritório que passou o módulo para o Fiscal: o coordenador do BPO sai.
    expect(acessoAEmissao(ctx("SECTOR_ADMIN", [BPO]), "fiscal", true)).toEqual({ ver: false, emitir: false });
    expect(acessoAEmissao(ctx("SECTOR_ADMIN", ["fiscal"]), "fiscal", true)).toEqual({ ver: true, emitir: true });
  });
});
