import { describe, it, expect } from "vitest";
import { CompanyStatus } from "@/generated/prisma/enums";
import {
  resolveCompanyStatusFilter,
  companyStatusWhere,
  estaOcultandoInativas,
  valorSelecionado,
  STATUS_TODOS,
} from "./companyStatusFilter";

describe("resolveCompanyStatusFilter", () => {
  it("sem parâmetro, usa o padrão", () => {
    expect(resolveCompanyStatusFilter(undefined)).toEqual({ kind: "padrao" });
  });

  it("string vazia ou só espaços também é padrão", () => {
    expect(resolveCompanyStatusFilter("")).toEqual({ kind: "padrao" });
    expect(resolveCompanyStatusFilter("   ")).toEqual({ kind: "padrao" });
  });

  it("'todos' pede a lista inteira", () => {
    expect(resolveCompanyStatusFilter(STATUS_TODOS)).toEqual({ kind: "todos" });
  });

  it("status válido é respeitado", () => {
    expect(resolveCompanyStatusFilter("INACTIVE")).toEqual({ kind: "status", status: CompanyStatus.INACTIVE });
    expect(resolveCompanyStatusFilter("PROSPECT")).toEqual({ kind: "status", status: CompanyStatus.PROSPECT });
  });

  // Link velho ou URL digitada à mão não pode deixar a tela em branco sem explicação.
  it("valor desconhecido cai no padrão em vez de zerar a lista", () => {
    expect(resolveCompanyStatusFilter("BANANA")).toEqual({ kind: "padrao" });
    expect(resolveCompanyStatusFilter("active")).toEqual({ kind: "padrao" }); // minúsculo não é o enum
  });
});

describe("companyStatusWhere", () => {
  it("o padrão esconde INACTIVE e CHURNED, e só eles", () => {
    const where = companyStatusWhere({ kind: "padrao" }) as { status: { notIn: CompanyStatus[] } };
    expect(where.status.notIn).toEqual([CompanyStatus.INACTIVE, CompanyStatus.CHURNED]);
  });

  // PROSPECT é trabalho em andamento: esconder por padrão sumiria com o funil comercial.
  it("o padrão NÃO esconde PROSPECT nem ACTIVE", () => {
    const where = companyStatusWhere({ kind: "padrao" }) as { status: { notIn: CompanyStatus[] } };
    expect(where.status.notIn).not.toContain(CompanyStatus.PROSPECT);
    expect(where.status.notIn).not.toContain(CompanyStatus.ACTIVE);
  });

  it("'todos' não restringe nada", () => {
    expect(companyStatusWhere({ kind: "todos" })).toEqual({});
  });

  it("status específico filtra por ele", () => {
    expect(companyStatusWhere({ kind: "status", status: CompanyStatus.CHURNED })).toEqual({
      status: CompanyStatus.CHURNED,
    });
  });

  it("dá para ver só as inativas quando se pede", () => {
    expect(companyStatusWhere({ kind: "status", status: CompanyStatus.INACTIVE })).toEqual({
      status: CompanyStatus.INACTIVE,
    });
  });
});

describe("sinalização na UI", () => {
  it("só o padrão está escondendo coisa", () => {
    expect(estaOcultandoInativas({ kind: "padrao" })).toBe(true);
    expect(estaOcultandoInativas({ kind: "todos" })).toBe(false);
    expect(estaOcultandoInativas({ kind: "status", status: CompanyStatus.INACTIVE })).toBe(false);
  });

  it("valorSelecionado devolve o que o menu deve marcar", () => {
    expect(valorSelecionado({ kind: "padrao" })).toBe("");
    expect(valorSelecionado({ kind: "todos" })).toBe(STATUS_TODOS);
    expect(valorSelecionado({ kind: "status", status: CompanyStatus.ACTIVE })).toBe("ACTIVE");
  });
});
