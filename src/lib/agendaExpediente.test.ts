import { describe, expect, it } from "vitest";
import {
  EXPEDIENTE_PADRAO,
  colunaDoInstante,
  contarForaDoHorario,
  descreverExpediente,
  duracaoEmHoras,
  erroDoExpediente,
  horasDaGrade,
  intervaloDaBusca,
  lerExpediente,
  passaDaMeiaNoite,
  posicaoDaReuniao,
  resolverExpediente,
  slotDaLinha,
  slotNoDia,
  slotParaNovaReuniao,
  type Expediente,
} from "./agendaExpediente";

/** Instante a partir do relógio de Brasília: sp("2026-10-06T01:00"). */
function sp(local: string): Date {
  return new Date(`${local}:00-03:00`);
}

function reuniao(inicio: string, fim: string) {
  return { startAt: sp(inicio).toISOString(), endAt: sp(fim).toISOString() };
}

const DIURNO: Expediente = { inicio: 7, fim: 21 };
const NOTURNO: Expediente = { inicio: 22, fim: 6 };
const DIA_INTEIRO: Expediente = { inicio: 7, fim: 7 };

// 05/10/2026 é uma segunda-feira.
const SEG = "2026-10-05";
const TER = "2026-10-06";
const QUA = "2026-10-07";
const DOM_ANTERIOR = "2026-10-04";

describe("duração e virada do dia", () => {
  it("conta as horas da coluna, com início igual ao fim valendo 24", () => {
    expect(duracaoEmHoras(DIURNO)).toBe(14);
    expect(duracaoEmHoras(NOTURNO)).toBe(8);
    expect(duracaoEmHoras(DIA_INTEIRO)).toBe(24);
    expect(duracaoEmHoras({ inicio: 0, fim: 0 })).toBe(24);
    expect(duracaoEmHoras({ inicio: 18, fim: 0 })).toBe(6);
  });

  it("só passa da meia-noite quando a coluna entra no dia seguinte", () => {
    expect(passaDaMeiaNoite(DIURNO)).toBe(false);
    expect(passaDaMeiaNoite(NOTURNO)).toBe(true);
    expect(passaDaMeiaNoite(DIA_INTEIRO)).toBe(true);
    // Termina à meia-noite em ponto, e a de 24h a partir de 0h: tudo no mesmo dia.
    expect(passaDaMeiaNoite({ inicio: 18, fim: 0 })).toBe(false);
    expect(passaDaMeiaNoite({ inicio: 0, fim: 0 })).toBe(false);
  });
});

describe("validação", () => {
  it("aceita horas cheias de 0 a 23 com pelo menos 4 horas", () => {
    expect(erroDoExpediente(7, 21)).toBeNull();
    expect(erroDoExpediente(22, 6)).toBeNull();
    expect(erroDoExpediente(20, 0)).toBeNull();
    expect(erroDoExpediente(9, 9)).toBeNull();
    expect(erroDoExpediente(8, 12)).toBeNull();
  });

  it("recusa menos de 4 horas, inclusive passando da meia-noite", () => {
    expect(erroDoExpediente(8, 11)).toMatch(/pelo menos 4 horas/);
    expect(erroDoExpediente(22, 1)).toMatch(/pelo menos 4 horas/);
  });

  it("recusa hora fora de 0–23, quebrada ou que não é número", () => {
    for (const [i, f] of [[24, 6], [-1, 6], [7.5, 21], [NaN, 21], ["7", 21], [null, 21]] as const) {
      expect(erroDoExpediente(i, f)).toMatch(/horas cheias/);
    }
  });

  it("lê o formulário sem inventar valor para campo vazio", () => {
    expect(lerExpediente("22", "6")).toEqual({ ok: true, expediente: NOTURNO });
    expect(lerExpediente(" 7 ", "21")).toEqual({ ok: true, expediente: DIURNO });
    expect(lerExpediente("", "6").ok).toBe(false);
    expect(lerExpediente(null, "6").ok).toBe(false);
    expect(lerExpediente("7h", "21").ok).toBe(false);
    expect(lerExpediente("7", "9")).toEqual({ ok: false, erro: "O horário precisa cobrir pelo menos 4 horas." });
  });
});

describe("resolverExpediente", () => {
  it("sem configuração continua 7h–21h", () => {
    expect(resolverExpediente(null, null)).toEqual({ inicio: 7, fim: 21 });
    expect(EXPEDIENTE_PADRAO).toEqual({ inicio: 7, fim: 21 });
  });

  it("a pessoa vence o escritório, que vence o padrão", () => {
    expect(resolverExpediente(NOTURNO, null)).toEqual(NOTURNO);
    expect(resolverExpediente(NOTURNO, DIA_INTEIRO)).toEqual(DIA_INTEIRO);
    expect(resolverExpediente(null, NOTURNO)).toEqual(NOTURNO);
  });

  it("ignora linha inválida em vez de quebrar a grade", () => {
    expect(resolverExpediente(NOTURNO, { inicio: 8, fim: 9 })).toEqual(NOTURNO);
    expect(resolverExpediente({ inicio: 30, fim: 6 }, null)).toEqual(EXPEDIENTE_PADRAO);
  });
});

describe("rótulos", () => {
  it("lista as horas da grade na ordem, virando a meia-noite", () => {
    expect(horasDaGrade(NOTURNO)).toEqual([22, 23, 0, 1, 2, 3, 4, 5]);
    expect(horasDaGrade(DIURNO)).toEqual([7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20]);
    expect(horasDaGrade(DIA_INTEIRO)).toHaveLength(24);
  });

  it("descreve o horário para a tela de configuração", () => {
    expect(descreverExpediente(DIURNO)).toBe("7:00 às 21:00");
    expect(descreverExpediente(NOTURNO)).toBe("22:00 às 6:00 do dia seguinte");
    expect(descreverExpediente({ inicio: 18, fim: 0 })).toBe("18:00 às 0:00");
    expect(descreverExpediente(DIA_INTEIRO)).toBe("24 horas, a partir das 7:00");
  });
});

describe("colunaDoInstante", () => {
  it("no horário diurno, a coluna é o próprio dia", () => {
    expect(colunaDoInstante(DIURNO, sp(`${SEG}T07:00`))).toEqual({ dia: SEG, minuto: 0 });
    expect(colunaDoInstante(DIURNO, sp(`${SEG}T20:59`))).toEqual({ dia: SEG, minuto: 839 });
  });

  it("fora do horário não tem coluna", () => {
    expect(colunaDoInstante(DIURNO, sp(`${SEG}T21:00`))).toBeNull();
    expect(colunaDoInstante(DIURNO, sp(`${SEG}T06:59`))).toBeNull();
    expect(colunaDoInstante(NOTURNO, sp(`${TER}T10:00`))).toBeNull();
  });

  it("passando da meia-noite, a madrugada de terça é da coluna de segunda", () => {
    expect(colunaDoInstante(NOTURNO, sp(`${TER}T01:00`))).toEqual({ dia: SEG, minuto: 180 });
    expect(colunaDoInstante(NOTURNO, sp(`${TER}T05:59`))).toEqual({ dia: SEG, minuto: 479 });
    expect(colunaDoInstante(NOTURNO, sp(`${TER}T06:00`))).toBeNull();
    expect(colunaDoInstante(NOTURNO, sp(`${TER}T23:30`))).toEqual({ dia: TER, minuto: 90 });
  });

  it("24 horas a partir das 7h: as 5h de terça ainda são de segunda", () => {
    expect(colunaDoInstante(DIA_INTEIRO, sp(`${TER}T05:00`))).toEqual({ dia: SEG, minuto: 1320 });
    expect(colunaDoInstante(DIA_INTEIRO, sp(`${TER}T07:00`))).toEqual({ dia: TER, minuto: 0 });
  });
});

describe("posicaoDaReuniao", () => {
  it("posiciona pelo minuto desde o topo da coluna", () => {
    expect(posicaoDaReuniao(DIURNO, sp(`${SEG}T09:00`), sp(`${SEG}T10:30`))).toEqual({ dia: SEG, inicioMin: 120, fimMin: 210 });
  });

  it("reunião à 01h de terça cai na coluna de segunda no horário noturno", () => {
    expect(posicaoDaReuniao(NOTURNO, sp(`${TER}T01:00`), sp(`${TER}T02:00`))).toEqual({ dia: SEG, inicioMin: 180, fimMin: 240 });
  });

  it("corta o que passa do fim da coluna", () => {
    expect(posicaoDaReuniao(DIURNO, sp(`${SEG}T20:00`), sp(`${TER}T09:00`))).toEqual({ dia: SEG, inicioMin: 780, fimMin: 840 });
    // Começa na coluna de domingo (22h → 6h) e invade o intervalo.
    expect(posicaoDaReuniao(NOTURNO, sp(`${SEG}T05:30`), sp(`${SEG}T07:00`))).toEqual({ dia: DOM_ANTERIOR, inicioMin: 450, fimMin: 480 });
  });

  it("a que começa antes do horário mas entra nele aparece cortada no topo", () => {
    expect(posicaoDaReuniao(DIURNO, sp(`${SEG}T06:30`), sp(`${SEG}T08:00`))).toEqual({ dia: SEG, inicioMin: 0, fimMin: 60 });
    expect(posicaoDaReuniao(NOTURNO, sp(`${SEG}T21:00`), sp(`${SEG}T23:00`))).toEqual({ dia: SEG, inicioMin: 0, fimMin: 60 });
  });

  it("inteira fora do horário não tem posição", () => {
    expect(posicaoDaReuniao(DIURNO, sp(`${SEG}T05:00`), sp(`${SEG}T06:00`))).toBeNull();
    expect(posicaoDaReuniao(DIURNO, sp(`${SEG}T21:00`), sp(`${SEG}T22:00`))).toBeNull();
    expect(posicaoDaReuniao(NOTURNO, sp(`${SEG}T10:00`), sp(`${SEG}T11:00`))).toBeNull();
  });

  it("reunião curta ganha altura de 15 minutos, sem passar do fim", () => {
    expect(posicaoDaReuniao(DIURNO, sp(`${SEG}T09:00`), sp(`${SEG}T09:05`))).toEqual({ dia: SEG, inicioMin: 120, fimMin: 135 });
    expect(posicaoDaReuniao(DIURNO, sp(`${SEG}T20:55`), sp(`${SEG}T21:00`))).toEqual({ dia: SEG, inicioMin: 835, fimMin: 840 });
  });
});

describe("contarForaDoHorario", () => {
  it("conta as reuniões dos dias à vista que começam fora do horário", () => {
    const reunioes = [
      reuniao(`${SEG}T09:00`, `${SEG}T10:00`), // no horário
      reuniao(`${SEG}T22:00`, `${SEG}T23:00`), // depois
      reuniao(`${TER}T05:00`, `${TER}T06:00`), // antes
      reuniao(`${TER}T06:30`, `${TER}T08:00`), // começa antes, mas aparece cortada
      reuniao(`${QUA}T22:00`, `${QUA}T23:00`), // dia que não está à vista
    ];
    expect(contarForaDoHorario(DIURNO, [SEG, TER], reunioes)).toBe(2);
  });

  it("não conta a madrugada que é da coluna de outro dia", () => {
    const reunioes = [
      reuniao(`${SEG}T01:00`, `${SEG}T02:00`), // coluna de domingo — no horário
      reuniao(`${SEG}T10:00`, `${SEG}T11:00`), // fora
      reuniao(`${TER}T02:00`, `${TER}T03:00`), // coluna de segunda, à vista
    ];
    expect(contarForaDoHorario(NOTURNO, [SEG], reunioes)).toBe(1);
  });

  it("conta a que só apareceria na coluna de um dia que não está à vista", () => {
    expect(contarForaDoHorario(DIURNO, [SEG], [reuniao(`${SEG}T23:00`, `${TER}T08:00`)])).toBe(1);
  });

  it("no expediente de 24 horas nada fica de fora", () => {
    expect(contarForaDoHorario(DIA_INTEIRO, [SEG], [reuniao(`${SEG}T23:00`, `${SEG}T23:30`)])).toBe(0);
  });
});

describe("intervaloDaBusca", () => {
  it("cobre os dias de calendário quando a coluna não passa da meia-noite", () => {
    const { inicio, fim } = intervaloDaBusca(DIURNO, SEG, "2026-10-11");
    expect(inicio).toEqual(sp(`${SEG}T00:00`));
    expect(fim).toEqual(sp("2026-10-12T00:00"));
  });

  it("vai até o fim da última coluna quando ela entra no dia seguinte", () => {
    expect(intervaloDaBusca(NOTURNO, SEG, SEG).fim).toEqual(sp(`${TER}T06:00`));
    expect(intervaloDaBusca(DIA_INTEIRO, SEG, SEG).fim).toEqual(sp(`${TER}T07:00`));
  });
});

describe("horário de reunião nova", () => {
  it("o clique numa linha vira a hora certa, inclusive depois da meia-noite", () => {
    expect(slotDaLinha(NOTURNO, SEG, 0)).toEqual({ start: `${SEG}T22:00`, end: `${SEG}T23:00` });
    expect(slotDaLinha(NOTURNO, SEG, 1)).toEqual({ start: `${SEG}T23:00`, end: `${TER}T00:00` });
    expect(slotDaLinha(NOTURNO, SEG, 3)).toEqual({ start: `${TER}T01:00`, end: `${TER}T02:00` });
    expect(slotDaLinha(DIURNO, SEG, 13)).toEqual({ start: `${SEG}T20:00`, end: `${SEG}T21:00` });
  });

  const SEMANA = [SEG, TER, QUA, "2026-10-08", "2026-10-09", "2026-10-10", "2026-10-11"];

  it("botão Nova reunião: a próxima hora cheia de hoje, presa ao horário como antes", () => {
    expect(slotParaNovaReuniao(DIURNO, SEMANA, sp(`${SEG}T10:20`))).toEqual({ start: `${SEG}T11:00`, end: `${SEG}T12:00` });
    expect(slotParaNovaReuniao(DIURNO, SEMANA, sp(`${SEG}T05:00`)).start).toBe(`${SEG}T07:00`);
    expect(slotParaNovaReuniao(DIURNO, SEMANA, sp(`${SEG}T22:10`)).start).toBe(`${SEG}T20:00`);
    expect(slotParaNovaReuniao(DIURNO, SEMANA, sp(`${SEG}T23:30`)).start).toBe(`${SEG}T20:00`);
  });

  it("botão Nova reunião passando da meia-noite: a coluna em que estamos agora", () => {
    // 01h10 de terça é da coluna de segunda, que está à vista.
    expect(slotParaNovaReuniao(NOTURNO, SEMANA, sp(`${TER}T01:10`))).toEqual({ start: `${TER}T02:00`, end: `${TER}T03:00` });
    expect(slotParaNovaReuniao(NOTURNO, [SEG], sp(`${TER}T01:10`)).start).toBe(`${TER}T02:00`);
    // Só a coluna de terça à vista (visão de dia): a primeira hora dela.
    expect(slotParaNovaReuniao(NOTURNO, [TER], sp(`${TER}T01:10`)).start).toBe(`${TER}T22:00`);
    // Fora do horário, antes de a coluna de hoje começar.
    expect(slotParaNovaReuniao(NOTURNO, SEMANA, sp(`${TER}T10:00`)).start).toBe(`${TER}T22:00`);
    // Virada do dia.
    expect(slotParaNovaReuniao(NOTURNO, SEMANA, sp(`${TER}T23:30`))).toEqual({ start: `${QUA}T00:00`, end: `${QUA}T01:00` });
  });

  it("botão Nova reunião sem hoje à vista: a mesma hora na primeira coluna", () => {
    const proxima = ["2026-10-12", "2026-10-13"];
    expect(slotParaNovaReuniao(DIURNO, proxima, sp(`${SEG}T10:20`)).start).toBe("2026-10-12T11:00");
    // Na coluna da segunda seguinte, as 2h são da madrugada de terça.
    expect(slotParaNovaReuniao(NOTURNO, proxima, sp(`${SEG}T01:10`)).start).toBe("2026-10-13T02:00");
    expect(slotParaNovaReuniao(NOTURNO, proxima, sp(`${SEG}T10:00`)).start).toBe("2026-10-12T22:00");
  });

  it("clique num dia do mês: a hora puxada para o horário, no dia clicado", () => {
    expect(slotNoDia(DIURNO, QUA, sp(`${SEG}T10:20`))).toEqual({ start: `${QUA}T11:00`, end: `${QUA}T12:00` });
    expect(slotNoDia(DIURNO, QUA, sp(`${SEG}T05:00`)).start).toBe(`${QUA}T07:00`);
    expect(slotNoDia(DIURNO, QUA, sp(`${SEG}T23:30`)).start).toBe(`${QUA}T20:00`);
    // Madrugada continua no dia clicado, mesmo sendo da coluna do dia anterior.
    expect(slotNoDia(NOTURNO, QUA, sp(`${SEG}T01:10`)).start).toBe(`${QUA}T02:00`);
    expect(slotNoDia(NOTURNO, QUA, sp(`${SEG}T10:00`)).start).toBe(`${QUA}T22:00`);
    expect(slotNoDia(NOTURNO, QUA, sp(`${SEG}T23:30`))).toEqual({ start: `${QUA}T00:00`, end: `${QUA}T01:00` });
  });
});
