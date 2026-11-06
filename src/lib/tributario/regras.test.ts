import { describe, expect, it } from "vitest";
import {
  cnpjDaAvaliacao,
  colunasDaAvaliacao,
  mensagemDoProblema,
  novaAvaliacao,
  regimeAtualDaEmpresa,
  validarAvaliacao,
  type EmpresaParaAvaliacao,
} from "./regras";

const empresa: EmpresaParaAvaliacao = {
  name: "Transportes Modelo Ltda",
  displayName: "Transportes Modelo",
  cnpj: "12.345.678/0001-95",
  taxRegimeKind: "LUCRO_PRESUMIDO",
  stateCode: "pr",
  city: "Curitiba",
};

describe("avaliação nova a partir do cadastro", () => {
  it("traz nome de exibição, CNPJ só com dígitos, regime, UF e cidade", () => {
    const e = novaAvaliacao("rapida", 2026, { empresa });
    expect(e.name).toBe("Transportes Modelo");
    expect(e.cnpj).toBe("12345678000195");
    expect(e.currentRegime).toBe("presumed");
    expect(e.uf).toBe("PR");
    expect(e.city).toBe("Curitiba");
    expect(e.mode).toBe("quick");
    expect(e.start).toBe("2026-01-01");
    expect(e.end).toBe("2026-12-31");
    expect(Object.keys(e.values)).toHaveLength(0);
  });

  it("prospecto sem cadastro leva só o nome digitado e nasce sem CNPJ", () => {
    const e = novaAvaliacao("guiada", 2026, { prospecto: "  Padaria do Bairro  " });
    expect(e.name).toBe("Padaria do Bairro");
    expect(e.cnpj).toBe("");
    expect(e.mode).toBe("guided");
    expect(e.currentRegime).toBe("unknown");
  });

  it("nome vazio de prospecto cai no nome padrão em vez de falhar", () => {
    expect(novaAvaliacao("rapida", 2026, { prospecto: "   " }).name).toBe("Nova avaliação");
  });
});

describe("regime e CNPJ", () => {
  it("só Simples, Presumido e Real viram regime atual", () => {
    expect(regimeAtualDaEmpresa("SIMPLES_NACIONAL")).toBe("simple");
    expect(regimeAtualDaEmpresa("LUCRO_REAL")).toBe("real");
    expect(regimeAtualDaEmpresa("MEI")).toBe("unknown");
    expect(regimeAtualDaEmpresa(null)).toBe("unknown");
  });

  it("CNPJ incompleto ou CPF não entram na avaliação", () => {
    expect(cnpjDaAvaliacao("12345678000195")).toBe("12345678000195");
    expect(cnpjDaAvaliacao("123.456.789-09")).toBe("");
    expect(cnpjDaAvaliacao(null)).toBe("");
  });
});

describe("colunas e validação", () => {
  it("as colunas da lista copiam nome, CNPJ, modo e ano dos dados", () => {
    const e = novaAvaliacao("guiada", 2025, { empresa });
    expect(colunasDaAvaliacao(e)).toEqual({ nome: "Transportes Modelo", cnpj: "12345678000195", modo: "guiada", ano: 2025 });
  });

  it("dados válidos passam; inválidos voltam com mensagem em português", () => {
    const e = novaAvaliacao("rapida", 2026, { empresa });
    expect(validarAvaliacao(e).ok).toBe(true);
    const semNome = validarAvaliacao({ ...e, name: "" });
    expect(semNome).toEqual({ ok: false, error: "Dê um nome à avaliação (até 160 caracteres)." });
    const negativo = validarAvaliacao({ ...e, values: { receita_bruta: -1 } });
    expect(negativo.ok).toBe(false);
    if (!negativo.ok) expect(negativo.error).toBe("Use valores positivos para receitas e despesas");
  });

  it("valor fora do tipo cita o rótulo do campo", () => {
    expect(mensagemDoProblema({ path: ["values", "receita_bruta"], message: "x" })).toContain("Receita bruta");
  });
});
