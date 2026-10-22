import { describe, expect, it } from "vitest";
import { competenciaPadrao, contextoDaUrl, mapearEstabelecimentos } from "./estabelecimentos";
import type { EmpresaDoMotor } from "@/lib/sped/motor";

const emp = (id: number, cnpj: string, matriz = cnpj.slice(8, 12) === "0001"): EmpresaDoMotor => ({
  id, cnpj, matriz, rotulo: `E${id}`, razao_social: "BLD", nome_fantasia: "", apelido: "", codigo_externo: "", codigo_dominio: "",
  uf: "SP", ie: "", cod_mun: "", ativo: true, obrigacoes: ["icms_ipi"], config: {}, atualizado_em: null, atualizado_por: null,
});

describe("Company ↔ estabelecimento (J1.2)", () => {
  it("casa pelo CNPJ inteiro, com máscara ou sem, e expõe as divergências", () => {
    const m = mapearEstabelecimentos("17122471", [emp(3, "17122471001147"), emp(1, "17122471000175"), emp(9, "17122471009999"), emp(5, "99999999000100")], [
      { id: "matriz", nome: "BLD Matriz", cnpj: "17.122.471/0001-75", regime: "Lucro real" },
      { id: "sp", nome: "BLD SP", cnpj: "17122471001147", regime: null },
      { id: "pr", nome: "BLD PR", cnpj: "17122471002200", regime: null },
      { id: "outra", nome: "Outra", cnpj: "11111111000100", regime: null },
    ]);
    expect(m.visiveis.map((v) => [v.id, v.companyId])).toEqual([[1, "matriz"], [3, "sp"]]);
    expect(m.semCadastro.map((e) => e.id)).toEqual([9]);
    expect(m.semMotor.map((c) => c.id)).toEqual(["pr"]);
  });
});

describe("contexto da URL", () => {
  const visiveis = (raiz: string) => (raiz === "17122471" ? [{ id: 3 }] : []);
  it("aceita só o que a pessoa alcança", () => {
    expect(contextoDaUrl({ raiz: "17122471", estab: "3", competencia: "2026-09" }, ["17122471"], visiveis)).toEqual({ raiz: "17122471", estabelecimentoId: 3, competencia: "2026-09" });
    expect(contextoDaUrl({ raiz: "99999999", estab: "77", competencia: "2026-13" }, ["17122471"], visiveis, new Date("2026-10-22T12:00:00Z")))
      .toEqual({ raiz: "17122471", estabelecimentoId: null, competencia: "2026-09" });
    expect(contextoDaUrl({}, [], visiveis)).toBeNull();
  });
  it("competência padrão é o mês anterior, inclusive em janeiro", () => {
    expect(competenciaPadrao(new Date("2027-01-10T12:00:00Z"))).toBe("2026-12");
  });
});
