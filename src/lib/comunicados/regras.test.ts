import { describe, expect, it } from "vitest";
import type { AuthContext } from "@/lib/auth/context";
import { empresasQueLeram, marcarComFiliais, resumoDaLeitura, validarComunicado } from "./regras";
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

const valido = { titulo: "Recesso de fim de ano", texto: "O escritório fecha de 24/12 a 02/01.", publico: "SETOR", setor: "dp", empresas: [] as string[] };

describe("validarComunicado", () => {
  it("aceita o comunicado completo", () => {
    expect(validarComunicado(valido)).toEqual({
      ok: true,
      dados: { titulo: "Recesso de fim de ano", texto: "O escritório fecha de 24/12 a 02/01.", publico: "SETOR", setor: "dp", empresas: [] },
    });
  });

  it("pede título, texto, público e setor", () => {
    expect(validarComunicado({ ...valido, titulo: " " }).ok).toBe(false);
    expect(validarComunicado({ ...valido, texto: "curto" }).ok).toBe(false);
    expect(validarComunicado({ ...valido, publico: "QUALQUER" }).ok).toBe(false);
    expect(validarComunicado({ ...valido, setor: "" }).ok).toBe(false);
  });

  it("empresas escolhidas exigem ao menos uma, sem repetir", () => {
    expect(validarComunicado({ ...valido, publico: "ESCOLHIDOS" }).ok).toBe(false);
    const r = validarComunicado({ ...valido, publico: "ESCOLHIDOS", empresas: ["e1", "e1", " e2 "] });
    expect(r.ok && r.dados.empresas).toEqual(["e1", "e2"]);
  });

  it("as empresas marcadas só valem no público \"escolhidas\"", () => {
    const r = validarComunicado({ ...valido, publico: "TODOS", empresas: ["e1"] });
    expect(r.ok && r.dados.empresas).toEqual([]);
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
  it("conta a empresa que tem alguém que leu", () => {
    const em = new Date("2026-10-01T15:00:00Z");
    expect(
      resumoDaLeitura([
        { empresaId: "a", nome: "A", leitores: [{ nome: "Ana", em }, { nome: "Bia", em }] },
        { empresaId: "b", nome: "B", leitores: [] },
        { empresaId: "c", nome: "C", leitores: [{ nome: "Caio", em }] },
      ])
    ).toEqual({ empresas: 3, leram: 2 });
  });
});

describe("empresasQueLeram — a leitura é por empresa, pelas contas que a enxergam (14/10/2026)", () => {
  // A conta "ana" vê a matriz e a filial; "bia" só a filial; "caio" outra empresa.
  const contas = new Map([
    ["matriz", new Set(["ana"])],
    ["filial", new Set(["ana", "bia"])],
    ["outra", new Set(["caio"])],
  ]);

  it("quem leu conta em todas as empresas que enxerga", () => {
    expect(empresasQueLeram(["matriz", "filial", "outra"], contas, new Set(["ana"]))).toBe(2);
  });

  it("leitura de quem não enxerga a empresa não conta para ela", () => {
    expect(empresasQueLeram(["matriz"], contas, new Set(["bia", "caio"]))).toBe(0);
  });

  it("empresa sem acesso nenhum nunca conta como lida", () => {
    expect(empresasQueLeram(["sem-acesso"], contas, new Set(["ana", "bia", "caio"]))).toBe(0);
  });
});

describe("marcarComFiliais — o \"Empresas escolhidas\" do comunicado", () => {
  const empresas = [
    { id: "m", matrizId: null },
    { id: "f1", matrizId: "m" },
    { id: "f2", matrizId: "m" },
    { id: "x", matrizId: null },
  ];

  it("marcar a matriz marca as filiais dela, e só elas", () => {
    expect([...marcarComFiliais(new Set(), "m", empresas)].sort()).toEqual(["f1", "f2", "m"]);
  });

  it("a filial se desmarca sozinha, e a matriz continua", () => {
    const marcadas = marcarComFiliais(new Set(), "m", empresas);
    expect([...marcarComFiliais(marcadas, "f2", empresas)].sort()).toEqual(["f1", "m"]);
  });

  it("desmarcar a matriz desmarca as filiais; o resto fica", () => {
    expect([...marcarComFiliais(new Set(["m", "f1", "x"]), "m", empresas)]).toEqual(["x"]);
  });
});
