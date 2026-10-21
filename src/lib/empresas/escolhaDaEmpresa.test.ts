import { describe, expect, it } from "vitest";
import {
  TODAS_AS_EMPRESAS,
  empresaNaUrl,
  hrefDaEmpresa,
  idDaEscolha,
  pedidaForaDoFoco,
  resolverEmpresaDaTela,
  todasNoFoco,
  valorDoSeletor,
} from "./escolhaDaEmpresa";

// As empresas em ordem alfabética, como `empresasDoSeletor` devolve: a primeira
// é a que as telas de uma empresa por vez abriam sozinhas até 13/10/2026.
const LISTA = ["alfa", "beta", "gama"];

describe("resolverEmpresaDaTela — a empresa que a tela abre", () => {
  it("a empresa da URL ganha de tudo", () => {
    expect(resolverEmpresaDaTela({ pedida: "gama", ultima: "beta", disponiveis: LISTA })).toEqual({
      tipo: "empresa",
      companyId: "gama",
      origem: "url",
    });
  });

  it("sem empresa na URL, abre na última aberta", () => {
    expect(resolverEmpresaDaTela({ pedida: undefined, ultima: "beta", disponiveis: LISTA })).toEqual({
      tipo: "empresa",
      companyId: "beta",
      origem: "ultima",
    });
  });

  it("parâmetro vazio é o mesmo que nenhum", () => {
    expect(resolverEmpresaDaTela({ pedida: "  ", ultima: "beta", disponiveis: LISTA })).toMatchObject({ companyId: "beta" });
  });

  it("sem URL e sem última, pede para escolher — nunca a primeira da lista", () => {
    const escolha = resolverEmpresaDaTela({ pedida: null, ultima: null, disponiveis: LISTA });
    expect(escolha).toEqual({ tipo: "escolher", motivo: "nenhuma" });
    expect(idDaEscolha(escolha)).not.toBe(LISTA[0]);
  });

  it("a última que não está na lista da tela (inativa, de outra tela) não vale", () => {
    expect(resolverEmpresaDaTela({ pedida: undefined, ultima: "fora", disponiveis: LISTA })).toEqual({ tipo: "escolher", motivo: "nenhuma" });
  });

  it("a empresa da URL fora da lista pede para escolher, em vez de cair na última ou na primeira", () => {
    expect(resolverEmpresaDaTela({ pedida: "de-outro-escritorio", ultima: "beta", disponiveis: LISTA })).toEqual({
      tipo: "escolher",
      motivo: "invalida",
    });
  });

  it("lista de uma empresa só abre nela: não há outra em que errar", () => {
    expect(resolverEmpresaDaTela({ pedida: undefined, ultima: null, disponiveis: ["unica"] })).toEqual({
      tipo: "empresa",
      companyId: "unica",
      origem: "unica",
    });
  });

  it("lista vazia pede para escolher", () => {
    expect(resolverEmpresaDaTela({ pedida: undefined, ultima: "beta", disponiveis: [] })).toEqual({ tipo: "escolher", motivo: "nenhuma" });
  });

  it("'todas' só vale na tela que oferece; sem a oferta, pede para escolher", () => {
    expect(resolverEmpresaDaTela({ pedida: TODAS_AS_EMPRESAS, ultima: "beta", disponiveis: LISTA, permitirTodas: true })).toEqual({ tipo: "todas" });
    expect(resolverEmpresaDaTela({ pedida: TODAS_AS_EMPRESAS, ultima: "beta", disponiveis: LISTA })).toEqual({
      tipo: "escolher",
      motivo: "invalida",
    });
  });

  it("na tela que oferece 'todas', sem URL ainda abre na última — 'todas' é escolha, não padrão", () => {
    expect(resolverEmpresaDaTela({ pedida: undefined, ultima: "gama", disponiveis: LISTA, permitirTodas: true })).toMatchObject({
      tipo: "empresa",
      companyId: "gama",
    });
    expect(resolverEmpresaDaTela({ pedida: undefined, ultima: null, disponiveis: LISTA, permitirTodas: true })).toEqual({
      tipo: "escolher",
      motivo: "nenhuma",
    });
  });
});

describe("o valor da escolha no seletor e nos links", () => {
  it("empresa, todas e nenhuma", () => {
    const empresa = resolverEmpresaDaTela({ pedida: "beta", ultima: null, disponiveis: LISTA });
    const todas = resolverEmpresaDaTela({ pedida: TODAS_AS_EMPRESAS, ultima: null, disponiveis: LISTA, permitirTodas: true });
    const nenhuma = resolverEmpresaDaTela({ pedida: undefined, ultima: null, disponiveis: LISTA });
    expect([valorDoSeletor(empresa), valorDoSeletor(todas), valorDoSeletor(nenhuma)]).toEqual(["beta", TODAS_AS_EMPRESAS, null]);
    // "Todas" vai explícita nos links da tela: sem o parâmetro, a tela voltaria para a última.
    expect([empresaNaUrl(empresa), empresaNaUrl(todas), empresaNaUrl(nenhuma)]).toEqual(["beta", TODAS_AS_EMPRESAS, undefined]);
    expect([idDaEscolha(empresa), idDaEscolha(todas), idDaEscolha(nenhuma)]).toEqual(["beta", null, null]);
  });
});

describe("hrefDaEmpresa — para onde o seletor leva", () => {
  it("leva a empresa e os parâmetros que a tela mantém", () => {
    expect(hrefDaEmpresa("/lancamentos", "bld", { manter: { mes: "2026-10", aba: undefined } })).toBe("/lancamentos?mes=2026-10&empresa=bld");
  });

  it("não duplica a empresa que vinha em `manter`", () => {
    expect(hrefDaEmpresa("/dre", "fiel", { manter: { empresa: "bld", visao: "ano" } })).toBe("/dre?visao=ano&empresa=fiel");
  });

  it("'Todas' na tela pesada vai explícita; na leve, sem parâmetro", () => {
    expect(hrefDaEmpresa("/pagar", "", { todas: "explicita" })).toBe(`/pagar?empresa=${TODAS_AS_EMPRESAS}`);
    expect(hrefDaEmpresa("/comunicacao", "", { todas: "padrao" })).toBe("/comunicacao");
  });

  it("codifica o que vai na URL", () => {
    expect(hrefDaEmpresa("/pagar", "a b&c")).toBe("/pagar?empresa=a+b%26c");
  });
});

// Com uma empresa em foco (21/10/2026): a BLD (matriz e filiais, uma base só
// no Omie) e uma empresa sem filial.
describe("resolverEmpresaDaTela — com uma empresa em foco", () => {
  const TELA = ["bld", "bld-f1", "bld-f2", "padaria", "outra"];
  const BLD = { companyId: "bld-f1", grupo: ["bld", "bld-f1", "bld-f2"] };
  const PADARIA = { companyId: "padaria", grupo: ["padaria"] };

  it("abre na empresa em foco, e não na última aberta", () => {
    expect(resolverEmpresaDaTela({ pedida: null, ultima: "outra", disponiveis: TELA, foco: BLD })).toEqual({
      tipo: "empresa",
      companyId: "bld-f1",
      origem: "foco",
    });
  });

  it("a URL troca entre a matriz e as filiais da base", () => {
    expect(resolverEmpresaDaTela({ pedida: "bld", ultima: null, disponiveis: TELA, foco: BLD })).toMatchObject({ companyId: "bld", origem: "url" });
  });

  it("a URL de outra empresa não abre a outra: fica no foco, e a tela avisa", () => {
    const entrada = { pedida: "padaria", ultima: null, disponiveis: TELA, foco: BLD };
    expect(resolverEmpresaDaTela(entrada)).toMatchObject({ companyId: "bld-f1", origem: "foco" });
    expect(pedidaForaDoFoco(entrada)).toBe(true);
  });

  it("dentro do foco, não há aviso", () => {
    expect(pedidaForaDoFoco({ pedida: "bld-f2", disponiveis: TELA, foco: BLD })).toBe(false);
    expect(pedidaForaDoFoco({ pedida: null, disponiveis: TELA, foco: BLD })).toBe(false);
    expect(pedidaForaDoFoco({ pedida: "padaria", disponiveis: TELA, foco: null })).toBe(false);
  });

  it("na BLD, 'todas' é a base inteira — matriz e filiais", () => {
    const entrada = { pedida: TODAS_AS_EMPRESAS, ultima: null, disponiveis: TELA, permitirTodas: true, foco: BLD };
    expect(resolverEmpresaDaTela(entrada)).toEqual({ tipo: "todas" });
    expect(pedidaForaDoFoco(entrada)).toBe(false);
    expect(todasNoFoco(true, 3)).toBe(true);
  });

  it("numa empresa sem filial, 'todas' fica nela, e a tela avisa", () => {
    const entrada = { pedida: TODAS_AS_EMPRESAS, ultima: null, disponiveis: TELA, permitirTodas: true, foco: PADARIA };
    expect(resolverEmpresaDaTela(entrada)).toMatchObject({ companyId: "padaria", origem: "foco" });
    expect(pedidaForaDoFoco(entrada)).toBe(true);
    expect(todasNoFoco(true, 1)).toBe(false);
  });

  it("'todas' onde a tela não oferece continua inválido", () => {
    expect(resolverEmpresaDaTela({ pedida: TODAS_AS_EMPRESAS, ultima: null, disponiveis: TELA, foco: BLD })).toEqual({
      tipo: "escolher",
      motivo: "invalida",
    });
  });

  it("id que não existe pede para escolher, como sem foco", () => {
    expect(resolverEmpresaDaTela({ pedida: "sumiu", ultima: null, disponiveis: TELA, foco: BLD })).toEqual({ tipo: "escolher", motivo: "invalida" });
  });

  it("a escolhida fora desta tela: a última aberta da base desempata, depois a única", () => {
    const semAEscolhida = ["bld", "bld-f2", "outra"];
    expect(resolverEmpresaDaTela({ pedida: null, ultima: "bld-f2", disponiveis: semAEscolhida, foco: BLD })).toMatchObject({
      companyId: "bld-f2",
      origem: "ultima",
    });
    // A última de fora da base não vale.
    expect(resolverEmpresaDaTela({ pedida: null, ultima: "outra", disponiveis: semAEscolhida, foco: BLD })).toEqual({
      tipo: "escolher",
      motivo: "nenhuma",
    });
    expect(resolverEmpresaDaTela({ pedida: null, ultima: null, disponiveis: ["bld", "outra"], foco: BLD })).toMatchObject({
      companyId: "bld",
      origem: "unica",
    });
  });

  it("nenhuma empresa da base nesta tela: diz isso, em vez de mostrar outra", () => {
    expect(resolverEmpresaDaTela({ pedida: null, ultima: "outra", disponiveis: ["outra"], foco: PADARIA })).toEqual({
      tipo: "escolher",
      motivo: "foco-fora-da-tela",
    });
  });
});
