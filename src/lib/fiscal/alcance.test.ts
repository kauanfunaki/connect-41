import { describe, expect, it } from "vitest";
import { whereDoAlcance, alcancaEmpresa, alcanceVazio, type AlcanceFiscal } from "./alcance";

const TENANT = "t-41tech";

describe("whereDoAlcance", () => {
  it("equipe do escritório vê o tenant inteiro", () => {
    expect(whereDoAlcance({ tipo: "TENANT", tenantId: TENANT })).toEqual({ tenantId: TENANT });
  });

  it("cliente do portal vê só as empresas dele", () => {
    const a: AlcanceFiscal = { tipo: "EMPRESAS", tenantId: TENANT, companyIds: ["c1", "c2"] };
    expect(whereDoAlcance(a)).toEqual({ tenantId: TENANT, companyId: { in: ["c1", "c2"] } });
  });

  // O caso que o módulo não pode errar: um `where` montado por concatenação
  // produziria cláusula vazia, que no SQL significa "tudo". `IN ()` não casa
  // com nada, que é o que a palavra "nada" significa.
  it("cliente sem empresa nenhuma resolve para NADA, nunca para tudo", () => {
    const w = whereDoAlcance(alcanceVazio(TENANT));
    expect(w).toEqual({ tenantId: TENANT, companyId: { in: [] } });
    expect(w).not.toEqual({ tenantId: TENANT });
  });

  it("o tenant nunca sai do where, nem no alcance por empresa", () => {
    for (const a of [
      { tipo: "TENANT", tenantId: TENANT },
      { tipo: "EMPRESAS", tenantId: TENANT, companyIds: ["c1"] },
      alcanceVazio(TENANT),
    ] as AlcanceFiscal[]) {
      expect(whereDoAlcance(a)).toMatchObject({ tenantId: TENANT });
    }
  });
});

describe("alcancaEmpresa", () => {
  it("escritório escreve em qualquer empresa do tenant", () => {
    expect(alcancaEmpresa({ tipo: "TENANT", tenantId: TENANT }, "qualquer")).toBe(true);
  });

  it("cliente só escreve nas empresas dele", () => {
    const a: AlcanceFiscal = { tipo: "EMPRESAS", tenantId: TENANT, companyIds: ["c1"] };
    expect(alcancaEmpresa(a, "c1")).toBe(true);
    expect(alcancaEmpresa(a, "c2")).toBe(false);
  });

  it("alcance vazio não escreve em lugar nenhum", () => {
    expect(alcancaEmpresa(alcanceVazio(TENANT), "c1")).toBe(false);
  });
});
