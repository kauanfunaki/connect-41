import { describe, expect, it } from "vitest";
import { DESFECHOS, DESFECHOS_DA_TELA, desfechoDaTela, rotuloDoDesfecho, LIMPEZA_AO_ENCERRAR } from "./atendimentos";

describe("desfechos do atendimento", () => {
  it("a tela oferece os desfechos de gente, e todos têm rótulo", () => {
    for (const d of DESFECHOS_DA_TELA) {
      expect(desfechoDaTela(d)).toBe(true);
      expect(DESFECHOS[d]).toBeTruthy();
    }
  });

  // "Pediu para parar" só o candidato faz — escolher na tela seria registrar
  // um opt-out que ele não pediu.
  it("ninguém escolhe 'pediu para parar' na tela", () => {
    expect(desfechoDaTela("PEDIU_PARA_PARAR")).toBe(false);
    expect(desfechoDaTela("qualquer")).toBe(false);
  });

  it("rótulo de código desconhecido ou vazio é só 'Encerrado'", () => {
    expect(rotuloDoDesfecho("RESOLVIDO")).toBe("Resolvido");
    expect(rotuloDoDesfecho("PEDIU_PARA_PARAR")).toBe("Pediu para parar");
    expect(rotuloDoDesfecho(null)).toBe("Encerrado");
    expect(rotuloDoDesfecho("ANTIGO")).toBe("Encerrado");
  });

  it("encerrar devolve ao assistente sem responsável e mantém o vínculo", () => {
    expect(LIMPEZA_AO_ENCERRAR).toMatchObject({ handoffAt: null, assignedToId: null, linkPendingPersonId: null });
    expect(LIMPEZA_AO_ENCERRAR).not.toHaveProperty("candidaturaId");
    expect(LIMPEZA_AO_ENCERRAR).not.toHaveProperty("personId");
  });
});
