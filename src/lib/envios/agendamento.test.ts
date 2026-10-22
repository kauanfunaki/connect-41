import { describe, expect, it } from "vitest";
import { agendamentoVencido, camposDoAgendamento, emailsDoAgendamento, lerAgendamento } from "./agendamento";

// O envio agendado (22/10/2026): data e hora de Brasília, no futuro, até um ano.

const agora = new Date("2026-10-22T15:00:00Z"); // 12:00 em Brasília

describe("lerAgendamento", () => {
  it("sem data, sem agendamento", () => {
    expect(lerAgendamento({ data: "", hora: "10:00" }, agora)).toEqual({ ok: true, quando: null });
    expect(lerAgendamento({ data: null, hora: null }, agora)).toEqual({ ok: true, quando: null });
  });
  it("a hora é de Brasília (UTC-3)", () => {
    expect(lerAgendamento({ data: "2026-10-23", hora: "09:30" }, agora)).toEqual({ ok: true, quando: new Date("2026-10-23T12:30:00Z") });
  });
  it("sem hora, 08:00", () => {
    expect(lerAgendamento({ data: "2026-10-23", hora: "" }, agora)).toEqual({ ok: true, quando: new Date("2026-10-23T11:00:00Z") });
  });
  it("no passado, não", () => {
    const r = lerAgendamento({ data: "2026-10-22", hora: "11:59" }, agora);
    expect(r).toEqual({ ok: false, erro: "Escolha uma data e hora no futuro para o agendamento." });
  });
  it("datas e horas que não existem, e mais de um ano à frente, não", () => {
    expect(lerAgendamento({ data: "2027-02-30", hora: "10:00" }, agora).ok).toBe(false);
    expect(lerAgendamento({ data: "23/10/2026", hora: "10:00" }, agora).ok).toBe(false);
    expect(lerAgendamento({ data: "2026-10-23", hora: "25:00" }, agora).ok).toBe(false);
    expect(lerAgendamento({ data: "2028-10-23", hora: "10:00" }, agora).ok).toBe(false);
  });
});

describe("camposDoAgendamento", () => {
  it("volta para os campos em Brasília", () => {
    expect(camposDoAgendamento(new Date("2026-10-23T12:30:00Z"))).toEqual({ data: "2026-10-23", hora: "09:30" });
    expect(camposDoAgendamento(null)).toEqual({ data: "", hora: "" });
  });
});

describe("emailsDoAgendamento", () => {
  it("lista limpa, em minúsculas, sem repetir; lixo vira vazio", () => {
    expect(emailsDoAgendamento(["A@x.com", "a@x.com ", "ruim", 3, "b@y.com.br"])).toEqual(["a@x.com", "b@y.com.br"]);
    expect(emailsDoAgendamento(null)).toEqual([]);
    expect(emailsDoAgendamento({ a: 1 })).toEqual([]);
  });
});

describe("agendamentoVencido", () => {
  it("só o rascunho com a hora chegada", () => {
    expect(agendamentoVencido({ status: "DRAFT", scheduledFor: new Date("2026-10-22T15:00:00Z") }, agora)).toBe(true);
    expect(agendamentoVencido({ status: "DRAFT", scheduledFor: new Date("2026-10-22T15:01:00Z") }, agora)).toBe(false);
    expect(agendamentoVencido({ status: "DRAFT", scheduledFor: null }, agora)).toBe(false);
    expect(agendamentoVencido({ status: "PUBLISHED", scheduledFor: new Date("2026-10-20T15:00:00Z") }, agora)).toBe(false);
  });
});
