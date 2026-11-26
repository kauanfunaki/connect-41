import { describe, expect, it } from "vitest";
import { avisosDeVencimento, type PessoaDoAviso } from "./avisos";

const pessoa = (extra: Partial<PessoaDoAviso> = {}): PessoaDoAviso => ({
  personId: "p1",
  nome: "Joana",
  companyId: "c1",
  admissao: null,
  desligamento: null,
  tipoContrato: "1",
  dataTermino: null,
  estagioPrevisaoTermino: null,
  ferias: [],
  dependentes: [],
  ...extra,
});

describe("avisosDeVencimento", () => {
  it("férias: em dobro quando passou do concessivo e a vencer quando falta pouco para o último dia de começar", () => {
    // Admissão 01/01/2024: 1º período 01/01/2024–31/12/2024, concessivo até 31/12/2025.
    const emDobro = avisosDeVencimento([pessoa({ admissao: "2024-01-01" })], "2026-01-10");
    expect(emDobro.map((a) => a.tipo)).toContain("FERIAS_EM_DOBRO");
    const aVencer = avisosDeVencimento([pessoa({ admissao: "2024-01-01" })], "2025-11-01");
    expect(aVencer).toHaveLength(1);
    expect(aVencer[0]).toMatchObject({ tipo: "FERIAS_CONCESSIVO", data: "2025-12-02", vencido: false });
    expect(avisosDeVencimento([pessoa({ admissao: "2024-01-01" })], "2025-06-01")).toEqual([]);
  });

  it("férias gozadas não avisam", () => {
    const ferias = [{ aquisitivoInicio: "2024-01-01", diasGozo: 30, diasAbono: 0, faltas: 0, terco: 1000, tercoAbono: 0 }];
    expect(avisosDeVencimento([pessoa({ admissao: "2024-01-01", ferias })], "2025-11-01")).toEqual([]);
  });

  it("contrato por prazo determinado: aviso nos 30 dias antes e vencido depois", () => {
    const p = pessoa({ tipoContrato: "2", dataTermino: "2026-12-10" });
    expect(avisosDeVencimento([p], "2026-11-01")).toEqual([]);
    expect(avisosDeVencimento([p], "2026-11-20")[0]).toMatchObject({ tipo: "CONTRATO_PRAZO", vencido: false });
    expect(avisosDeVencimento([p], "2026-12-11")[0]).toMatchObject({ tipo: "CONTRATO_PRAZO", vencido: true });
    expect(avisosDeVencimento([{ ...p, tipoContrato: "1" }], "2026-12-11")).toEqual([]);
  });

  it("estágio e desligado", () => {
    expect(avisosDeVencimento([pessoa({ estagioPrevisaoTermino: "2026-12-01" })], "2026-11-25")[0].tipo).toBe("ESTAGIO");
    expect(avisosDeVencimento([pessoa({ estagioPrevisaoTermino: "2026-12-01", desligamento: "2026-11-20" })], "2026-11-25")).toEqual([]);
  });

  it("dependentes: salário-família aos 14 e IRRF aos 21 e 24", () => {
    const dependentes = [
      { nome: "Ana", nascimento: "2012-12-05", relacao: "FILHO", irrf: false, salarioFamilia: true },
      { nome: "Bia", nascimento: "2005-12-01", relacao: "FILHO", irrf: true, salarioFamilia: false },
      { nome: "Caio", nascimento: "2002-12-20", relacao: "ENTEADO", irrf: true, salarioFamilia: false },
      { nome: "Davi", nascimento: "1960-01-01", relacao: "PAIS", irrf: true, salarioFamilia: false },
    ];
    const r = avisosDeVencimento([pessoa({ dependentes })], "2026-11-25");
    expect(r.map((a) => [a.tipo, a.data])).toEqual([
      ["DEPENDENTE_IRRF", "2026-12-01"],
      ["SALARIO_FAMILIA", "2026-12-05"],
      ["DEPENDENTE_IRRF", "2026-12-20"],
    ]);
    expect(r[0].texto).toMatch(/21 anos/);
    expect(r[2].texto).toMatch(/24 anos/);
  });

  it("depois dos 21 avisa só por dois meses", () => {
    const dependentes = [{ nome: "Bia", nascimento: "2005-06-01", relacao: "FILHO", irrf: true, salarioFamilia: false }];
    expect(avisosDeVencimento([pessoa({ dependentes })], "2026-07-01")).toHaveLength(1);
    expect(avisosDeVencimento([pessoa({ dependentes })], "2026-09-01")).toEqual([]);
  });
});
