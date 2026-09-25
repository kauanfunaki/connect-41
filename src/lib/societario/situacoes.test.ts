import { describe, it, expect } from "vitest";
import { situacaoDoProcesso, transicaoDeSituacao } from "./processo";
import { ordenarFila, type LinhaDaFila } from "./fila";

describe("situacaoDoProcesso com status marcado pela equipe", () => {
  const exigencia = [{ organId: "junta", attempt: 1, outcome: "EXIGENCIA" as const }];

  it("aguardando cliente ganha da exigência: a vez é do cliente", () => {
    expect(situacaoDoProcesso(exigencia, false, "AGUARDANDO_CLIENTE")).toBe("AGUARDANDO_CLIENTE");
    expect(situacaoDoProcesso(exigencia, false, "SUSPENSO")).toBe("SUSPENSO");
  });

  it("sem status marcado, segue derivada; concluído ganha de tudo", () => {
    expect(situacaoDoProcesso(exigencia, false, "EM_ANDAMENTO")).toBe("EM_EXIGENCIA");
    expect(situacaoDoProcesso(exigencia, false)).toBe("EM_EXIGENCIA");
    expect(situacaoDoProcesso(exigencia, true, "SUSPENSO")).toBe("CONCLUIDO");
  });
});

describe("transicaoDeSituacao", () => {
  it("pausar e encerrar pedem motivo", () => {
    expect(transicaoDeSituacao("EM_ANDAMENTO", "aguardar_cliente", " ")).toEqual({ ok: false, erro: "Diga o motivo." });
    expect(transicaoDeSituacao("EM_ANDAMENTO", "cancelar", "Cliente   desistiu")).toEqual({
      ok: true,
      status: "CANCELADO",
      motivo: "Cliente desistiu",
    });
  });

  it("retomar limpa o motivo e só vale para pausado ou encerrado sem conclusão", () => {
    expect(transicaoDeSituacao("SUSPENSO", "retomar", "")).toEqual({ ok: true, status: "EM_ANDAMENTO", motivo: null });
    expect(transicaoDeSituacao("INDEFERIDO", "retomar", "")).toMatchObject({ ok: true, status: "EM_ANDAMENTO" });
    expect(transicaoDeSituacao("EM_EXIGENCIA", "retomar", "")).toMatchObject({ ok: false });
  });

  it("concluído não muda por aqui; encerrado precisa ser retomado antes", () => {
    expect(transicaoDeSituacao("CONCLUIDO", "cancelar", "engano")).toMatchObject({ ok: false });
    expect(transicaoDeSituacao("CANCELADO", "suspender", "outro motivo")).toMatchObject({ ok: false });
  });

  it("pausa sobre pausa troca de uma para a outra, mas não repete", () => {
    expect(transicaoDeSituacao("AGUARDANDO_CLIENTE", "suspender", "pediu para parar")).toMatchObject({ ok: true, status: "SUSPENSO" });
    expect(transicaoDeSituacao("SUSPENSO", "suspender", "de novo")).toMatchObject({ ok: false });
  });
});

describe("fila", () => {
  const linha = (id: string, situacao: LinhaDaFila["situacao"]): LinhaDaFila =>
    ({
      id,
      situacao,
      prazo: { dias: 1, situacao: "dentro", previstoMin: 4, previstoMax: 7 },
      iniciadoEm: new Date("2026-09-01T12:00:00Z"),
    }) as LinhaDaFila;

  it("pausas vão para o fim, depois do que espera o órgão", () => {
    const ordem = ordenarFila([
      linha("s", "SUSPENSO"),
      linha("c", "AGUARDANDO_CLIENTE"),
      linha("o", "AGUARDANDO_ORGAO"),
      linha("e", "EM_EXIGENCIA"),
      linha("a", "EM_ANDAMENTO"),
    ]).map((l) => l.id);
    expect(ordem).toEqual(["e", "o", "a", "c", "s"]);
  });
});
