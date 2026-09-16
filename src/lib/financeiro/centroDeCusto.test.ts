import { describe, expect, it } from "vitest";
import {
  validarCentroDeCusto,
  centroDoLancamento,
  centroComum,
  casarCentroDeCusto,
  lerFiltroDeCentro,
  passaNoFiltroDeCentro,
  valorDoFiltroDeCentro,
  podeDefinirCentro,
  type CentroConhecido,
} from "./centroDeCusto";

describe("validarCentroDeCusto", () => {
  it("normaliza espaço e aceita código vazio", () => {
    expect(validarCentroDeCusto({ nome: "  Obra   Centro ", codigo: "" })).toEqual({ ok: true, dados: { nome: "Obra Centro", codigo: null } });
    expect(validarCentroDeCusto({ nome: "Loja", codigo: "LJ-01" })).toEqual({ ok: true, dados: { nome: "Loja", codigo: "LJ-01" } });
  });

  it("recusa nome vazio, longo demais e código com espaço ou acento", () => {
    expect(validarCentroDeCusto({ nome: " ", codigo: null }).ok).toBe(false);
    expect(validarCentroDeCusto({ nome: "x".repeat(121), codigo: null }).ok).toBe(false);
    expect(validarCentroDeCusto({ nome: "Loja", codigo: "LJ 01" }).ok).toBe(false);
    expect(validarCentroDeCusto({ nome: "Loja", codigo: "ÇÃO" }).ok).toBe(false);
    expect(validarCentroDeCusto({ nome: "Loja", codigo: "x".repeat(31) }).ok).toBe(false);
  });
});

describe("centroDoLancamento", () => {
  const centros = new Map<string, CentroConhecido>([
    ["a", { id: "a", companyId: "e1", active: true }],
    ["b", { id: "b", companyId: "e1", active: false }],
    ["c", { id: "c", companyId: "e2", active: true }],
  ]);
  const base = { companyId: "e1", centros };

  it("o informado vence o padrão da contraparte", () => {
    expect(centroDoLancamento({ ...base, informadoId: "a", padraoDaContraparteId: "c" })).toEqual({ ok: true, centroId: "a" });
  });

  it("informado de outra empresa, inexistente ou inativo é recusa", () => {
    expect(centroDoLancamento({ ...base, informadoId: "c", padraoDaContraparteId: null }).ok).toBe(false);
    expect(centroDoLancamento({ ...base, informadoId: "zz", padraoDaContraparteId: null }).ok).toBe(false);
    expect(centroDoLancamento({ ...base, informadoId: "b", padraoDaContraparteId: null }).ok).toBe(false);
  });

  it("sem informado herda o padrão só se for da mesma empresa e ativo", () => {
    expect(centroDoLancamento({ ...base, informadoId: null, padraoDaContraparteId: "a" })).toEqual({ ok: true, centroId: "a" });
    expect(centroDoLancamento({ ...base, informadoId: null, padraoDaContraparteId: "b" })).toEqual({ ok: true, centroId: null });
    expect(centroDoLancamento({ ...base, informadoId: null, padraoDaContraparteId: "c" })).toEqual({ ok: true, centroId: null });
    expect(centroDoLancamento({ ...base, informadoId: null, padraoDaContraparteId: null })).toEqual({ ok: true, centroId: null });
  });
});

describe("centroComum", () => {
  it("todos iguais dá o centro; divergente, algum sem centro ou lista vazia dá nulo", () => {
    expect(centroComum(["a", "a"])).toBe("a");
    expect(centroComum(["a", "b"])).toBeNull();
    expect(centroComum(["a", null])).toBeNull();
    expect(centroComum([null, null])).toBeNull();
    expect(centroComum([])).toBeNull();
  });
});

describe("casarCentroDeCusto", () => {
  const centros = [
    { id: "1", nome: "Obra Centro", codigo: "OB1" },
    { id: "2", nome: "Loja", codigo: null },
    { id: "3", nome: "OB2", codigo: "X" },
    { id: "4", nome: "Depósito", codigo: "OB2" },
  ];

  it("casa por nome (sem acento e caixa) ou por código; vazio é sem centro", () => {
    expect(casarCentroDeCusto("obra  centro", centros)).toEqual({ ok: true, centroId: "1" });
    expect(casarCentroDeCusto("ob1", centros)).toEqual({ ok: true, centroId: "1" });
    expect(casarCentroDeCusto("deposito", centros)).toEqual({ ok: true, centroId: "4" });
    expect(casarCentroDeCusto("  ", centros)).toEqual({ ok: true, centroId: null });
  });

  it("não encontrado e ambíguo são erro da linha", () => {
    expect(casarCentroDeCusto("Fábrica", centros).ok).toBe(false);
    const ambiguo = casarCentroDeCusto("OB2", centros);
    expect(ambiguo.ok).toBe(false);
    if (!ambiguo.ok) expect(ambiguo.erro).toMatch(/ambíguo/);
  });
});

describe("podeDefinirCentro", () => {
  const contas = [
    { id: "1", companyId: "e1" },
    { id: "2", companyId: "e1" },
  ];
  const centro = { companyId: "e1", active: true, nome: "Loja" };

  it("define em contas da empresa do centro, e tira de qualquer uma", () => {
    expect(podeDefinirCentro(contas, centro, 2)).toEqual({ pode: true });
    expect(podeDefinirCentro([...contas, { id: "3", companyId: "e2" }], null, 3)).toEqual({ pode: true });
  });

  it("recusa seleção vazia, grande demais, conta sumida, centro inativo e empresa misturada", () => {
    expect(podeDefinirCentro([], centro, 0).pode).toBe(false);
    expect(podeDefinirCentro(contas, centro, 201).pode).toBe(false);
    expect(podeDefinirCentro(contas, centro, 3).pode).toBe(false);
    expect(podeDefinirCentro(contas, { ...centro, active: false }, 2).pode).toBe(false);
    const misturada = podeDefinirCentro([...contas, { id: "3", companyId: "e2" }], centro, 3);
    expect(misturada.pode).toBe(false);
    if (!misturada.pode) expect(misturada.motivo).toMatch(/1 conta selecionada é de outra empresa/);
  });
});

describe("filtro de centro", () => {
  const ids = new Set(["a"]);
  it("lê todos, sem e centro; id desconhecido volta para todos", () => {
    expect(lerFiltroDeCentro(undefined, ids)).toEqual({ tipo: "todos" });
    expect(lerFiltroDeCentro("sem", ids)).toEqual({ tipo: "sem" });
    expect(lerFiltroDeCentro("a", ids)).toEqual({ tipo: "centro", id: "a" });
    expect(lerFiltroDeCentro("outro", ids)).toEqual({ tipo: "todos" });
  });

  it("aplica e volta para a URL", () => {
    expect(passaNoFiltroDeCentro("a", { tipo: "todos" })).toBe(true);
    expect(passaNoFiltroDeCentro(null, { tipo: "sem" })).toBe(true);
    expect(passaNoFiltroDeCentro(undefined, { tipo: "sem" })).toBe(true);
    expect(passaNoFiltroDeCentro("a", { tipo: "sem" })).toBe(false);
    expect(passaNoFiltroDeCentro("a", { tipo: "centro", id: "a" })).toBe(true);
    expect(passaNoFiltroDeCentro(null, { tipo: "centro", id: "a" })).toBe(false);
    expect(valorDoFiltroDeCentro({ tipo: "todos" })).toBe("");
    expect(valorDoFiltroDeCentro({ tipo: "sem" })).toBe("sem");
    expect(valorDoFiltroDeCentro({ tipo: "centro", id: "a" })).toBe("a");
  });
});
