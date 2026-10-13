import { describe, expect, it } from "vitest";
import { alcanceFiscalDaEscolha, escopoFinanceiroDaEscolha } from "./escopoDaEscolha";
import { resolverEmpresaDaTela, type EscolhaDaEmpresa } from "./escolhaDaEmpresa";
import { whereDoAlcance } from "@/lib/fiscal/alcance";
import { whereDoEscopo } from "@/lib/financeiro/consultas";

const EMPRESA: EscolhaDaEmpresa = { tipo: "empresa", companyId: "bld", origem: "ultima" };
const TODAS: EscolhaDaEmpresa = { tipo: "todas" };
const NENHUMA: EscolhaDaEmpresa = { tipo: "escolher", motivo: "nenhuma" };
const INVALIDA: EscolhaDaEmpresa = { tipo: "escolher", motivo: "invalida" };

describe("escopo das telas pesadas do financeiro", () => {
  it("com empresa, a consulta leva só ela", () => {
    const escopo = escopoFinanceiroDaEscolha("t1", EMPRESA, { permitirTodas: true })!;
    expect(escopo).toEqual({ tenantId: "t1", companyIds: ["bld"] });
    expect(whereDoEscopo(escopo)).toEqual({ tenantId: "t1", companyId: { in: ["bld"] } });
  });

  it("sem empresa, não há consulta — nunca o tenant inteiro por falta de escolha", () => {
    expect(escopoFinanceiroDaEscolha("t1", NENHUMA, { permitirTodas: true })).toBeNull();
    expect(escopoFinanceiroDaEscolha("t1", INVALIDA, { permitirTodas: true })).toBeNull();
  });

  it("o tenant inteiro só com 'todas' pedido e permitido pela tela", () => {
    expect(escopoFinanceiroDaEscolha("t1", TODAS, { permitirTodas: true })).toEqual({ tenantId: "t1", companyIds: null });
    // Tela sem teto (o realizado do fluxo de caixa) não lê todas, nem pedindo.
    expect(escopoFinanceiroDaEscolha("t1", TODAS)).toBeNull();
  });

  it("de ponta a ponta: tela aberta sem URL e sem última empresa não consulta nada", () => {
    const escolha = resolverEmpresaDaTela({ pedida: undefined, ultima: null, disponiveis: ["alfa", "bld"], permitirTodas: true });
    expect(escopoFinanceiroDaEscolha("t1", escolha, { permitirTodas: true })).toBeNull();
  });
});

describe("alcance do acervo fiscal na tela da equipe", () => {
  it("é sempre uma empresa", () => {
    const alcance = alcanceFiscalDaEscolha("t1", EMPRESA)!;
    expect(alcance).toEqual({ tipo: "EMPRESAS", tenantId: "t1", companyIds: ["bld"] });
    expect(whereDoAlcance(alcance)).toEqual({ tenantId: "t1", companyId: { in: ["bld"] } });
  });

  it("nunca o tenant inteiro — nem com 'todas' na URL", () => {
    expect(alcanceFiscalDaEscolha("t1", TODAS)).toBeNull();
    expect(alcanceFiscalDaEscolha("t1", NENHUMA)).toBeNull();
    expect(alcanceFiscalDaEscolha("t1", INVALIDA)).toBeNull();
  });
});
