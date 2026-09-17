import { describe, expect, it } from "vitest";
import {
  avaliarLembrete,
  passosPorExtenso,
  rotuloDoPasso,
  situacaoDoLembrete,
  JANELA_DO_ULTIMO_LEMBRETE,
  RESERVA_DO_LEMBRETE,
} from "./lembrete";

const HOJE = "2026-09-17";

function aberta(prazoKey: string | null, enviados: number[] = []) {
  return { status: "ABERTA" as const, prazoKey, enviados };
}

describe("avaliarLembrete", () => {
  it("só lembra pendência que espera o cliente", () => {
    for (const status of ["RESPONDIDA", "RESOLVIDA", "CANCELADA"] as const) {
      expect(avaliarLembrete({ status, prazoKey: "2026-09-10", enviados: [] }, HOJE)).toEqual({
        enviar: null,
        motivo: "NAO_AGUARDA_CLIENTE",
      });
    }
  });

  it("sem prazo não há o que lembrar", () => {
    expect(avaliarLembrete(aberta(null), HOJE)).toEqual({ enviar: null, motivo: "SEM_PRAZO" });
  });

  it("a que vence hoje ainda está no prazo; a de ontem recebe o primeiro lembrete", () => {
    expect(avaliarLembrete(aberta("2026-09-17"), HOJE)).toEqual({ enviar: null, motivo: "NO_PRAZO" });
    expect(avaliarLembrete(aberta("2026-09-20"), HOJE)).toEqual({ enviar: null, motivo: "NO_PRAZO" });
    expect(avaliarLembrete(aberta("2026-09-16"), HOJE)).toEqual({ enviar: 1, diasDeAtraso: 1 });
  });

  it("o maior passo alcançado, uma vez cada", () => {
    expect(avaliarLembrete(aberta("2026-09-15", [1]), HOJE)).toEqual({ enviar: null, motivo: "SEM_PASSO_HOJE" });
    expect(avaliarLembrete(aberta("2026-09-14", [1]), HOJE)).toEqual({ enviar: 3, diasDeAtraso: 3 });
    expect(avaliarLembrete(aberta("2026-09-10", [1, 3]), HOJE)).toEqual({ enviar: 7, diasDeAtraso: 7 });
    expect(avaliarLembrete(aberta("2026-09-10", [1, 3, 7]), HOJE)).toEqual({ enviar: null, motivo: "SEM_PASSO_HOJE" });
  });

  it("dias sem cron: na volta sai só o passo atual", () => {
    // Venceu há 6 dias e nenhum cron rodou desde então: sai o de 3, não o de 1 junto.
    expect(avaliarLembrete(aberta("2026-09-11"), HOJE)).toEqual({ enviar: 3, diasDeAtraso: 6 });
  });

  it("pendência esquecida há muito tempo não recebe e-mail quando o lembrete entra no ar", () => {
    const ultimoDia = 15 + JANELA_DO_ULTIMO_LEMBRETE - 1;
    expect(avaliarLembrete(aberta("2026-08-04"), HOJE)).toEqual({ enviar: 15, diasDeAtraso: ultimoDia });
    expect(avaliarLembrete(aberta("2026-08-03"), HOJE)).toEqual({ enviar: null, motivo: "SEM_PASSO_HOJE" });
    expect(avaliarLembrete(aberta("2026-01-10"), HOJE)).toEqual({ enviar: null, motivo: "SEM_PASSO_HOJE" });
  });

  it("devolvida pela equipe depois de alguns lembretes: segue dos passos que faltam", () => {
    expect(avaliarLembrete(aberta("2026-09-02", [1, 3]), HOJE)).toEqual({ enviar: 15, diasDeAtraso: 15 });
  });
});

describe("situacaoDoLembrete", () => {
  const agora = new Date("2026-09-17T13:00:00Z");
  const base = { ok: false, erro: null, em: new Date("2026-09-17T12:00:00Z"), destinatarios: 2 };

  it("enviado diz para quantas pessoas", () => {
    expect(situacaoDoLembrete({ ...base, ok: true }, agora)).toEqual({ tom: "ok", texto: "enviado a 2 pessoas" });
    expect(situacaoDoLembrete({ ...base, ok: true, destinatarios: 1 }, agora)).toEqual({ tom: "ok", texto: "enviado a 1 pessoa" });
  });

  it("reserva recente é envio em curso; reserva velha é queda no meio, e diz que não repete", () => {
    const recente = { ...base, erro: RESERVA_DO_LEMBRETE, em: new Date("2026-09-17T12:58:00Z") };
    expect(situacaoDoLembrete(recente, agora).tom).toBe("andamento");
    const presa = { ...base, erro: RESERVA_DO_LEMBRETE };
    expect(situacaoDoLembrete(presa, agora)).toEqual({ tom: "falha", texto: "envio interrompido — não é repetido automaticamente" });
  });

  it("falha mostra o motivo gravado", () => {
    expect(situacaoDoLembrete({ ...base, erro: "1 de 2 e-mail(s) falharam" }, agora)).toEqual({ tom: "falha", texto: "1 de 2 e-mail(s) falharam" });
  });
});

describe("textos do lembrete", () => {
  it("rótulo do passo e passos por extenso", () => {
    expect(rotuloDoPasso(1)).toBe("1 dia de atraso");
    expect(rotuloDoPasso(7)).toBe("7 dias de atraso");
    expect(passosPorExtenso()).toBe("1, 3, 7 e 15");
    expect(passosPorExtenso([5])).toBe("5");
  });
});
