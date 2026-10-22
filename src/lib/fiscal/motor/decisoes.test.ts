import { describe, expect, it } from "vitest";
import { lerCompetencias, normalizarDecimal, DECISOES, TIPOS_DE_DECISAO, TIPOS_VISIVEIS, cnpjsDeEstabelecimento, conferirCorpo, motivoDoCampo, textoDoValor } from "./decisoes";

describe("definição dos tipos de decisão (§5.1)", () => {
  it("cobre os dez tipos do contrato; documento_excluido fica oculto até D4", () => {
    expect(TIPOS_DE_DECISAO).toHaveLength(10);
    expect(TIPOS_VISIVEIS).not.toContain("documento_excluido");
  });
  it("os tipos sem remoção no motor (405) não oferecem apagar", () => {
    expect(["classificacao_item", "parametro_contribuicoes", "documento_apoio_categoria"].filter((t) => DECISOES[t as keyof typeof DECISOES].apagar)).toEqual([]);
  });
  it("módulos da tabela §8.2", () => {
    expect(DECISOES.ajuste_apuracao.modulo).toBe("fiscal_icms_ipi");
    expect(DECISOES.entrega_competencia.modulo).toBe("fiscal_entregas");
    expect(DECISOES.parametro_contribuicoes.modulo).toBe("fiscal_contribuicoes");
    expect(DECISOES.credito_documento_apoio.modulo).toBe("fiscal_classificacao");
  });
});

describe("conferência do corpo", () => {
  const def = DECISOES.credito_icms_item;
  const chave = { cnpj_emit: "12345678000199", cod_prod: "ABC", competencia: "2026-09", cnpj_empresa: "17122471001147" };
  it("aceita chave completa e valor decimal em string", () => {
    expect(conferirCorpo(def, "gravar", { chave, valor: { valor: "10.50" } })).toEqual({});
  });
  it("recusa número JSON, campo desconhecido e chave incompleta", () => {
    expect(conferirCorpo(def, "gravar", { chave, valor: { valor: 10.5 } })).toHaveProperty("valor");
    expect(conferirCorpo(def, "gravar", { chave, valor: { decidido_por: "x" } })).toHaveProperty("decidido_por");
    expect(conferirCorpo(def, "apagar", { chave: { cnpj_emit: "12345678000199" } })).toHaveProperty("cod_prod");
  });
  it("lote até 1000 chaves", () => {
    expect(conferirCorpo(def, "apagar", { chaves: Array(1001).fill(chave) })).toHaveProperty("chave");
    expect(conferirCorpo(def, "apagar", { chaves: [chave, chave] })).toEqual({});
  });
  it("na criação do bloco M vale `competencias`; na edição, `competencia`", () => {
    const m = DECISOES.ajuste_contribuicoes;
    expect(conferirCorpo(m, "criar", { valor: { competencias: ["2026-09", "2026-10"] } })).toEqual({});
    expect(conferirCorpo(m, "criar", { valor: { competencia: "2026-09" } })).toHaveProperty("competencia");
    expect(conferirCorpo(m, "gravar", { chave: { id: 3 }, valor: { competencias: ["2026-09"] } })).toHaveProperty("competencias");
  });
  it("vazio é valor (seguir a destinação); null só onde o motor aceita", () => {
    expect(conferirCorpo(DECISOES.classificacao_item, "gravar", { chave: { cnpj_emit: "12345678000199", cod_prod: "A" }, valor: { credito_pis_cofins: "" } })).toEqual({});
    expect(motivoDoCampo({ nome: "r", rotulo: "r", tipo: "decimal", anulavel: true }, null)).toBeNull();
    expect(motivoDoCampo({ nome: "r", rotulo: "r", tipo: "decimal" }, null)).not.toBeNull();
  });
  it("lista os CNPJs de estabelecimento para a checagem de alcance", () => {
    expect(cnpjsDeEstabelecimento(def, { chaves: [chave, { ...chave, cnpj_empresa: "17122471000175" }] })).toEqual(["17122471001147", "17122471000175"]);
    expect(cnpjsDeEstabelecimento(DECISOES.ajuste_apuracao, { valor: { cnpj_empresa: "17122471001147" } })).toEqual(["17122471001147"]);
  });
  it("texto da tabela usa o rótulo da opção", () => {
    expect(textoDoValor(DECISOES.classificacao_item, "tipo_item", "07")).toBe("07 · Material de uso e consumo");
    expect(textoDoValor(DECISOES.ajuste_apuracao, "natureza", "debito")).toBe("Débito");
  });
});

describe("entrada digitada", () => {
  it("decimal brasileiro vira o formato do motor", () => {
    expect(normalizarDecimal("1.234,56")).toBe("1234.56");
    expect(normalizarDecimal("10,5")).toBe("10.5");
    expect(normalizarDecimal("-3")).toBe("-3");
    expect(normalizarDecimal("12.50")).toBe("12.50");
    expect(normalizarDecimal("abc")).toBeNull();
    expect(normalizarDecimal("1,23456")).toBeNull();
  });
  it("lista de competências", () => {
    expect(lerCompetencias("2026-09, 2026-10;2026-09")).toEqual(["2026-09", "2026-10"]);
  });
});
