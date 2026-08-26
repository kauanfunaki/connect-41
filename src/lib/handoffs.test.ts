import { describe, expect, it } from "vitest";
import { aggregateHandoffStatus, canReadSectorInstruction } from "./handoffs";

describe("aggregateHandoffStatus", () => {
  it("sem setor nenhum é Nova", () => {
    expect(aggregateHandoffStatus([])).toBe("NEW");
  });

  it("só finaliza quando todos os setores finalizam", () => {
    expect(aggregateHandoffStatus(["DONE", "DONE"])).toBe("DONE");
    expect(aggregateHandoffStatus(["DONE", "NEW"])).toBe("IN_PROGRESS");
  });

  it("todos novos continua Nova", () => {
    expect(aggregateHandoffStatus(["NEW", "NEW"])).toBe("NEW");
  });
});

// Regressão do achado de 2026-08-24: quem está no setor Contábil lia a
// instrução escrita para o Fiscal na tela de detalhe da transferência.
describe("canReadSectorInstruction", () => {
  const base = {
    fullAccess: false,
    userId: "u-ana",
    requestedBy: "u-controladoria",
    userSectors: ["contabil"],
    sectorCode: "fiscal",
    isAssignee: false,
  };

  it("nega a instrução de setor de que a pessoa não participa", () => {
    expect(canReadSectorInstruction(base)).toBe(false);
  });

  it("libera a instrução do próprio setor", () => {
    expect(canReadSectorInstruction({ ...base, sectorCode: "contabil" })).toBe(true);
  });

  it("libera para quem abriu a transferência — foi quem escreveu as instruções", () => {
    expect(canReadSectorInstruction({ ...base, userId: "u-controladoria" })).toBe(true);
  });

  it("libera para gerência geral (ADMIN/SUPER_ADMIN/READONLY)", () => {
    expect(canReadSectorInstruction({ ...base, fullAccess: true })).toBe(true);
  });

  it("libera para o responsável designado, mesmo de fora do setor", () => {
    expect(canReadSectorInstruction({ ...base, isAssignee: true })).toBe(true);
  });

  it("pessoa sem setor nenhum não lê instrução de setor algum", () => {
    expect(canReadSectorInstruction({ ...base, userSectors: [] })).toBe(false);
  });

  // Sessão sem usuário não pode cair no ramo do requester por comparação
  // null === null vinda de um requestedBy vazio.
  it("sessão sem usuário não vira o autor da transferência", () => {
    expect(canReadSectorInstruction({ ...base, userId: null, requestedBy: "" })).toBe(false);
  });

  // O subworkspace muda o que se LISTA, não o que se tem direito de LER: a
  // pessoa continua lendo a instrução do setor dela mesmo com outro ativo.
  it("não depende do setor ativo, e sim dos setores da pessoa", () => {
    expect(
      canReadSectorInstruction({ ...base, userSectors: ["contabil", "fiscal"] })
    ).toBe(true);
  });
});
