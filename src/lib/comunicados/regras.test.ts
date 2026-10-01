import { describe, expect, it } from "vitest";
import type { AuthContext } from "@/lib/auth/context";
import { resumoDaLeitura, validarComunicado } from "./regras";
import { podeComunicarPeloSetor } from "./acesso";

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

const valido = { titulo: "Recesso de fim de ano", texto: "O escritório fecha de 24/12 a 02/01.", publico: "SETOR", setor: "dp", grupos: [] as string[] };

describe("validarComunicado", () => {
  it("aceita o comunicado completo", () => {
    expect(validarComunicado(valido)).toEqual({
      ok: true,
      dados: { titulo: "Recesso de fim de ano", texto: "O escritório fecha de 24/12 a 02/01.", publico: "SETOR", setor: "dp", grupos: [] },
    });
  });

  it("pede título, texto, público e setor", () => {
    expect(validarComunicado({ ...valido, titulo: " " }).ok).toBe(false);
    expect(validarComunicado({ ...valido, texto: "curto" }).ok).toBe(false);
    expect(validarComunicado({ ...valido, publico: "QUALQUER" }).ok).toBe(false);
    expect(validarComunicado({ ...valido, setor: "" }).ok).toBe(false);
  });

  it("clientes escolhidos exigem ao menos um, sem repetir", () => {
    expect(validarComunicado({ ...valido, publico: "ESCOLHIDOS" }).ok).toBe(false);
    const r = validarComunicado({ ...valido, publico: "ESCOLHIDOS", grupos: ["g1", "g1", " g2 "] });
    expect(r.ok && r.dados.grupos).toEqual(["g1", "g2"]);
  });

  it("os grupos marcados só valem no público \"escolhidos\"", () => {
    const r = validarComunicado({ ...valido, publico: "TODOS", grupos: ["g1"] });
    expect(r.ok && r.dados.grupos).toEqual([]);
  });
});

describe("podeComunicarPeloSetor — é e-mail para dezenas de clientes", () => {
  it("a coordenação do setor envia pelo próprio setor, não pelo dos outros", () => {
    const c = ctx("SECTOR_ADMIN", ["dp"]);
    expect(podeComunicarPeloSetor(c, "dp")).toBe(true);
    expect(podeComunicarPeloSetor(c, "fiscal")).toBe(false);
  });

  it("colaborador comum do setor não envia", () => {
    expect(podeComunicarPeloSetor(ctx("SECTOR_USER", ["dp"]), "dp")).toBe(false);
  });

  it("administrador envia por qualquer setor; leitura total e assinatura travada, não", () => {
    expect(podeComunicarPeloSetor(ctx("ADMIN", []), "fiscal")).toBe(true);
    expect(podeComunicarPeloSetor(ctx("READONLY", []), "fiscal")).toBe(false);
    expect(podeComunicarPeloSetor(ctx("ADMIN", [], { subscriptionReadOnly: true }), "fiscal")).toBe(false);
  });
});

describe("resumoDaLeitura", () => {
  it("conta o cliente que tem alguém que leu", () => {
    const em = new Date("2026-10-01T15:00:00Z");
    expect(
      resumoDaLeitura([
        { grupoId: "a", nome: "A", leitores: [{ nome: "Ana", em }, { nome: "Bia", em }] },
        { grupoId: "b", nome: "B", leitores: [] },
        { grupoId: "c", nome: "C", leitores: [{ nome: "Caio", em }] },
      ])
    ).toEqual({ clientes: 3, leram: 2 });
  });
});
