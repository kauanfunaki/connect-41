import { describe, expect, it } from "vitest";
import { perfilDaEmpresa } from "./dominio";

describe("perfilDaEmpresa", () => {
  it("usa UF, IE e regime do cadastro", () => {
    expect(perfilDaEmpresa({ stateCode: "pr", stateRegistration: "123", taxRegimeKind: "LUCRO_REAL" }, ["icms_ipi"])).toEqual({ uf: "PR", regime: "real", inscricaoEstadual: "123", obrigacoes: ["icms_ipi"], faltando: [] });
  });
  it("MEI conta como Simples", () => {
    expect(perfilDaEmpresa({ stateCode: "SP", stateRegistration: null, taxRegimeKind: "MEI" }, []).regime).toBe("simples");
  });
  it("aponta o que falta no cadastro", () => {
    expect(perfilDaEmpresa({ stateCode: null, stateRegistration: null, taxRegimeKind: "IMUNE_ISENTA" }, []).faltando).toEqual(["UF", "regime compatível com o SPED (simples, presumido ou real)"]);
    expect(perfilDaEmpresa({ stateCode: "PR", stateRegistration: null, taxRegimeKind: null }, []).faltando).toEqual(["regime tributário"]);
  });
});
