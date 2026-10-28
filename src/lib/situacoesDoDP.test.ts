import { describe, expect, it } from "vitest";
import { AbsenceStatus, TerminationStatus } from "@/generated/prisma/enums";
import { afastamentoEmAberto, dataDoDesligamento, desligamentoEmAndamento, podeRegistrarDesligamento } from "./situacoesDoDP";

describe("situações do DP", () => {
  it("o afastamento recém-lançado está em aberto — era o que sumia de /afastamentos", () => {
    expect(afastamentoEmAberto("LANCADO")).toBe(true);
    expect(afastamentoEmAberto("APROVADO")).toBe(true);
    expect(afastamentoEmAberto("AFASTADO")).toBe(true);
    expect(afastamentoEmAberto("REPROVADO")).toBe(false);
    expect(afastamentoEmAberto("CONCLUIDO")).toBe(false);
    // Toda situação que não fecha aparece: só duas fecham.
    expect(Object.values(AbsenceStatus).filter((s) => !afastamentoEmAberto(s))).toHaveLength(2);
  });

  it("desligamento em andamento: tudo menos finalizado e cancelado", () => {
    expect(desligamentoEmAndamento("SOLICITADO")).toBe(true);
    expect(desligamentoEmAndamento("ASSINATURA_PENDENTE")).toBe(true);
    expect(desligamentoEmAndamento("FINALIZADO")).toBe(false);
    expect(desligamentoEmAndamento("CANCELADO")).toBe(false);
    expect(Object.values(TerminationStatus).filter((s) => desligamentoEmAndamento(s))).toHaveLength(4);
  });

  it("um desligamento finalizado não impede o próximo; um em andamento, sim", () => {
    expect(podeRegistrarDesligamento([])).toBe(true);
    expect(podeRegistrarDesligamento([{ status: "FINALIZADO" }])).toBe(true);
    expect(podeRegistrarDesligamento([{ status: "FINALIZADO" }, { status: "CANCELADO" }])).toBe(true);
    expect(podeRegistrarDesligamento([{ status: "FINALIZADO" }, { status: "EM_CALCULO" }])).toBe(false);
  });
});

describe("data do desligamento", () => {
  const agora = new Date("2026-10-28T15:00:00Z");
  it("é o término do contrato, quando informado", () => {
    const termino = new Date("2026-09-30T00:00:00Z");
    expect(dataDoDesligamento({ terminationDate: termino, finalizedAt: agora }, agora)).toBe(termino);
  });
  it("sem o término, é o dia em que foi finalizado", () => {
    const fim = new Date("2026-10-20T12:00:00Z");
    expect(dataDoDesligamento({ terminationDate: null, finalizedAt: fim }, agora)).toBe(fim);
    expect(dataDoDesligamento({ terminationDate: null, finalizedAt: null }, agora)).toBe(agora);
  });
});
