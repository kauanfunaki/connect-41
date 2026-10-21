import { beforeEach, describe, expect, it, vi } from "vitest";

// Quem tem a Ceci no portal (21/10/2026, fase 3): o acesso, cortado nas
// empresas que o escritório ligou — a filial pela matriz —, e nada antes da
// migration.

import type { bancoDeTeste } from "./bancoDeTeste";
import { EMPRESAS, T, bancoDeDoisClientes } from "./doisClientes";

const m = vi.hoisted(() => ({ banco: null as ReturnType<typeof bancoDeTeste> | null, estado: { ligado: true, temChave: true } }));
vi.mock("@/lib/prisma", () => ({ getPrisma: () => m.banco!.prisma }));
vi.mock("@/lib/ia/data", () => ({ estadoDosAgentes: async () => new Map([["ceci_portal", m.estado]]) }));

const { ceciNoPortalDaConta, empresasComCeci, escopoDaCeci, lerEscopoDaCeci, perguntasDeHojeDoAcesso } = await import("./ceci");
const { montarEscopoDoAcesso } = await import("./escopoDoAcesso");

beforeEach(() => {
  m.banco = bancoDeDoisClientes();
  m.estado = { ligado: true, temChave: true };
});

describe("escopoDaCeci", () => {
  it("corta o acesso nas empresas com a Ceci, nunca acrescenta", () => {
    const acesso = montarEscopoDoAcesso(T, "pu-a", ["a", "b"]);
    expect(escopoDaCeci(acesso, new Set(["b", "de-fora"])).companyIds).toEqual(["b"]);
    expect(escopoDaCeci(acesso, new Set()).companyIds).toEqual([]);
  });
});

describe("empresasComCeci", () => {
  it("ligada direto, ou filial de matriz ligada — só no escritório", async () => {
    expect([...(await empresasComCeci(T, ["a-matriz", "a-filial", "b-1", "u-1"]))].sort()).toEqual(["a-filial", "a-matriz", "b-1"]);
  });

  it("matriz desligada: a filial só com a chave dela", async () => {
    m.banco = bancoDeDoisClientes({
      company: EMPRESAS.map((e) => (e.id === "a-matriz" ? { ...e, ceciNoPortal: false } : e.parent ? { ...e, parent: { ...e.parent, ceciNoPortal: false } } : e)),
    });
    expect([...(await empresasComCeci(T, ["a-matriz", "a-filial"]))]).toEqual([]);
  });

  it("antes da migration (coluna que não existe): nenhuma, sem derrubar", async () => {
    m.banco = { ...m.banco!, prisma: { company: { findMany: async () => Promise.reject(Object.assign(new Error("coluna"), { code: "P2022" })) } } } as never;
    expect((await empresasComCeci(T, ["a-matriz"])).size).toBe(0);
  });
});

describe("a Ceci da conta", () => {
  it("o escopo é o do acesso (com a filial) cortado nas ligadas", async () => {
    expect([...(await lerEscopoDaCeci(T, "pu-a")).companyIds].sort()).toEqual(["a-filial", "a-matriz"]);
  });

  it("aparece só com o agente ligado, chave e empresa ligada", async () => {
    expect(await ceciNoPortalDaConta(T, "pu-a")).toBe(true);
    expect(await ceciNoPortalDaConta(T, "pu-inativo")).toBe(false);
    m.estado = { ligado: true, temChave: false };
    expect(await ceciNoPortalDaConta(T, "pu-a")).toBe(false);
    m.estado = { ligado: false, temChave: true };
    expect(await ceciNoPortalDaConta(T, "pu-a")).toBe(false);
  });
});

describe("perguntasDeHojeDoAcesso", () => {
  it("conta as execuções do agente do portal deste acesso, de hoje em São Paulo", async () => {
    const hoje = new Date("2026-10-21T15:00:00Z");
    m.banco = bancoDeDoisClientes({
      agentRun: [
        { tenantId: T, agentCode: "ceci_portal", entityType: "acesso_do_portal", entityId: "pu-a", startedAt: new Date("2026-10-21T04:00:00Z") },
        { tenantId: T, agentCode: "ceci_portal", entityType: "acesso_do_portal", entityId: "pu-a", startedAt: new Date("2026-10-21T02:00:00Z") },
        { tenantId: T, agentCode: "ceci_portal", entityType: "acesso_do_portal", entityId: "pu-outro", startedAt: hoje },
        { tenantId: T, agentCode: "assistente_do_bpo", entityType: "acesso_do_portal", entityId: "pu-a", startedAt: hoje },
      ],
    });
    // 02:00 UTC de 21/10 ainda é 20/10 em São Paulo.
    expect(await perguntasDeHojeDoAcesso(T, "pu-a", hoje)).toBe(1);
  });
});
