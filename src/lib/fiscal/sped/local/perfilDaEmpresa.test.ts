import { describe, expect, it } from "vitest";
import { perfilDaEmpresa } from "./dominio";

describe("perfilDaEmpresa", () => {
  it("usa UF, IE e regime do cadastro", () => {
    expect(perfilDaEmpresa({ stateCode: "pr", stateRegistration: "123", taxRegimeKind: "LUCRO_REAL", contabilistaCpf: "123.456.789-01" }, { obrigacoes: ["icms_ipi"], codigoMunicipio: "4106902" })).toMatchObject({ uf: "PR", regime: "real", inscricaoEstadual: "123", obrigacoes: ["icms_ipi"], codigoMunicipio: "4106902", contadorCpf: "12345678901", faltando: [] });
  });
  it("MEI conta como Simples", () => {
    expect(perfilDaEmpresa({ stateCode: "SP", stateRegistration: null, taxRegimeKind: "MEI" }).regime).toBe("simples");
  });
  it("o contabilista vem inteiro de uma fonte: a empresa, o perfil antigo ou o padrão do escritório", () => {
    const cadastro = { stateCode: "PR", stateRegistration: null, taxRegimeKind: "LUCRO_REAL" };
    const padrao = { contabilistaNome: "PADRAO DO ESCRITORIO", contabilistaCpf: "987.654.321-00", contabilistaCrc: "PR-1/O-0" };
    // Sem contabilista na empresa nem no perfil antigo: o do escritório.
    expect(perfilDaEmpresa(cadastro, { obrigacoes: [] }, padrao)).toMatchObject({ contadorNome: "PADRAO DO ESCRITORIO", contadorCpf: "98765432100", contadorCrc: "PR-1/O-0" });
    // A empresa com só o nome: nada do escritório entra junto.
    expect(perfilDaEmpresa({ ...cadastro, contabilistaNome: "DA EMPRESA" }, { obrigacoes: [] }, padrao)).toMatchObject({ contadorNome: "DA EMPRESA", contadorCpf: "", contadorCrc: "" });
    // O perfil antigo ganha do escritório, e também vai inteiro.
    expect(perfilDaEmpresa(cadastro, { obrigacoes: [], contadorNome: "DO PERFIL", contadorCrc: "SC-2/O-0" }, padrao)).toMatchObject({ contadorNome: "DO PERFIL", contadorCpf: "", contadorCrc: "SC-2/O-0" });
    expect(perfilDaEmpresa(cadastro)).toMatchObject({ contadorNome: "", contadorCpf: "", contadorCrc: "" });
  });
  it("aponta o que falta no cadastro", () => {
    expect(perfilDaEmpresa({ stateCode: null, stateRegistration: null, taxRegimeKind: "IMUNE_ISENTA" }).faltando).toEqual(["UF", "regime compatível com o SPED (simples, presumido ou real)"]);
    expect(perfilDaEmpresa({ stateCode: "PR", stateRegistration: null, taxRegimeKind: null }).faltando).toEqual(["regime tributário"]);
  });
});
