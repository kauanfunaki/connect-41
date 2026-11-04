import { describe, expect, it } from "vitest";
import { andamentoDoAcordo, grupoDaFila } from "./organizacao";

const semAcao = { quandoKey: null, paraHoje: false };

describe("grupoDaFila", () => {
  it("a próxima ação de hoje ou vencida vai para Ligar hoje, mesmo com promessa", () => {
    expect(grupoDaFila({ situacao: "EM_COBRANCA", acao: { quandoKey: "2026-11-04", paraHoje: true } })).toBe("hoje");
    expect(grupoDaFila({ situacao: "PROMETEU_PAGAR", acao: { quandoKey: "2026-11-03", paraHoje: true } })).toBe("hoje");
  });
  it("vencido sem contato, sem nada agendado", () => {
    expect(grupoDaFila({ situacao: "VENCIDO_SEM_CONTATO", acao: semAcao })).toBe("semContato");
  });
  it("promessa ou retorno para outro dia aguardam o sacado", () => {
    expect(grupoDaFila({ situacao: "PROMETEU_PAGAR", acao: { quandoKey: "2026-11-10", paraHoje: false } })).toBe("aguardando");
    expect(grupoDaFila({ situacao: "EM_COBRANCA", acao: { quandoKey: "2026-11-10", paraHoje: false } })).toBe("aguardando");
  });
  it("em cobrança sem nada agendado pede a próxima ação", () => {
    expect(grupoDaFila({ situacao: "EM_COBRANCA", acao: semAcao })).toBe("semAcao");
  });
  it("contestado, em acordo e perda ficam fora do dia, mesmo com ação vencida", () => {
    expect(grupoDaFila({ situacao: "CONTESTADO", acao: { quandoKey: "2026-11-01", paraHoje: true } })).toBe("parados");
    expect(grupoDaFila({ situacao: "EM_ACORDO", acao: semAcao })).toBe("parados");
    expect(grupoDaFila({ situacao: "PERDA", acao: semAcao })).toBe("parados");
  });
});

describe("andamentoDoAcordo", () => {
  const p = (vencimentoKey: string, pago = false, encerrada = false, valorCentavos = 100) => ({ vencimentoKey, pago, encerrada, valorCentavos });

  it("conta as pagas e acha a próxima a pagar", () => {
    const a = andamentoDoAcordo([p("2026-10-05", true), p("2026-11-05"), p("2026-12-05")], "2026-11-04");
    expect(a).toMatchObject({ pagas: 1, total: 3, vencidas: 0, emAbertoCentavos: 200 });
    expect(a.proxima).toEqual({ vencimentoKey: "2026-11-05", valorCentavos: 100, vencida: false });
  });
  it("marca a parcela vencida", () => {
    const a = andamentoDoAcordo([p("2026-11-01"), p("2026-12-01")], "2026-11-04");
    expect(a.proxima?.vencida).toBe(true);
    expect(a.vencidas).toBe(1);
  });
  it("parcela encerrada não é a pagar; tudo pago não tem próxima", () => {
    expect(andamentoDoAcordo([p("2026-10-01", false, true), p("2026-10-05", true)], "2026-11-04")).toMatchObject({ proxima: null, emAbertoCentavos: 0, vencidas: 0 });
  });
});
