import { describe, expect, it } from "vitest";
import { travaDoDesfazer, type DadosDoDesfazer } from "./desfazerContratacao";

const base: DadosDoDesfazer = {
  statusDaCandidatura: "CONTRATADO",
  pessoa: { type: "COLABORADOR", employmentStatus: "ADMISSAO_EM_ANDAMENTO", admissionDate: null, currentCompanyId: "empresa-1" },
  companyIdDaVaga: "empresa-1",
  temLinkDeAdmissao: false,
  outrasContratacoes: 0,
};

describe("desfazer contratação — a trava", () => {
  it("libera a contratação que ainda não andou", () => {
    expect(travaDoDesfazer(base)).toBeNull();
  });

  it("trava depois que o DP gerou o link de admissão", () => {
    expect(travaDoDesfazer({ ...base, temLinkDeAdmissao: true })).toMatch(/link/);
  });

  it("trava quando a pessoa já está ativa ou tem data de admissão", () => {
    expect(travaDoDesfazer({ ...base, pessoa: { ...base.pessoa, employmentStatus: "ATIVO" } })).toMatch(/DP/);
    expect(travaDoDesfazer({ ...base, pessoa: { ...base.pessoa, admissionDate: new Date("2026-10-01") } })).toMatch(/DP/);
  });

  it("trava quando a pessoa está em outra empresa ou contratada em outra vaga", () => {
    expect(travaDoDesfazer({ ...base, pessoa: { ...base.pessoa, currentCompanyId: "empresa-2" } })).toMatch(/outra empresa/);
    expect(travaDoDesfazer({ ...base, outrasContratacoes: 1 })).toMatch(/outra vaga/);
  });

  it("não há o que desfazer numa candidatura que não está contratada", () => {
    expect(travaDoDesfazer({ ...base, statusDaCandidatura: "EM_ANDAMENTO" })).not.toBeNull();
  });
});
