import { describe, expect, it } from "vitest";
import { ehRotinaDoSistema, pessoaOuRotina } from "./rotinas";

// Robô e agendador na trilha (05/11/2026): eram "Usuário sem nome (excluído)".

describe("ehRotinaDoSistema", () => {
  it("rotina pelo nome gravado, ou a linha antiga sem nome nenhum", () => {
    expect(ehRotinaDoSistema({ userId: null, actorName: "Robô do Societário" })).toBe(true);
    expect(ehRotinaDoSistema({ userId: null, actorName: null })).toBe(true);
  });

  it("pessoa excluída (nome guardado) e pessoa com conta não são rotina", () => {
    expect(ehRotinaDoSistema({ userId: null, actorName: "Rafael Souza" })).toBe(false);
    expect(ehRotinaDoSistema({ userId: "u1", actorName: "Ana" })).toBe(false);
  });
});

describe("pessoaOuRotina", () => {
  it("a pessoa quando há uma; senão a rotina", () => {
    expect(pessoaOuRotina("u1", "roboDoSocietario")).toEqual({ userId: "u1" });
    expect(pessoaOuRotina(null, "roboDoSocietario")).toEqual({ rotina: "roboDoSocietario" });
    expect(pessoaOuRotina("", "agendadorDeEnvios")).toEqual({ rotina: "agendadorDeEnvios" });
  });
});
