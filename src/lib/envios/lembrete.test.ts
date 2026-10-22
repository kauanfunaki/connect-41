import { describe, expect, it } from "vitest";
import {
  avaliarLembreteDoEnvio,
  inicioDoPrazoDoLembrete,
  lerDiasDoLembrete,
  publicadoAteParaLembrete,
  textoDoLembrete,
  type EnvioDoLembrete,
} from "./lembrete";

// O lembrete de não lido (22/10/2026): um só, depois de N dias sem ninguém do
// cliente abrir — contados do primeiro e-mail (ou da publicação, só portal).

const dia = (d: number, h = 12) => new Date(Date.UTC(2026, 9, d, h));
const linha = (p: Partial<EnvioDoLembrete["recipients"][number]> = {}) => ({ sentAt: null, firstViewedAt: null, signedAt: null, ...p });
const envio = (p: Partial<EnvioDoLembrete> = {}): EnvioDoLembrete => ({
  status: "PUBLISHED",
  publishedAt: dia(10),
  reminderDays: 2,
  reminderSentAt: null,
  recipients: [linha({ sentAt: dia(10) })],
  ...p,
});

describe("lerDiasDoLembrete", () => {
  it("só os prazos oferecidos; o resto é sem lembrete", () => {
    expect(lerDiasDoLembrete("2")).toBe(2);
    expect(lerDiasDoLembrete(" 5 ")).toBe(5);
    expect(lerDiasDoLembrete("10")).toBe(10);
    expect(lerDiasDoLembrete("")).toBeNull();
    expect(lerDiasDoLembrete("3")).toBeNull();
    expect(lerDiasDoLembrete(null)).toBeNull();
    expect(lerDiasDoLembrete("abc")).toBeNull();
  });
});

describe("inicioDoPrazoDoLembrete", () => {
  it("conta do primeiro e-mail que saiu", () => {
    expect(inicioDoPrazoDoLembrete(envio({ recipients: [linha({ sentAt: dia(12) }), linha({ sentAt: dia(11) }), linha()] }))).toEqual(dia(11));
  });
  it("sem e-mail (só portal), da publicação", () => {
    expect(inicioDoPrazoDoLembrete(envio({ recipients: [] }))).toEqual(dia(10));
  });
});

describe("avaliarLembreteDoEnvio", () => {
  it("vence depois de N dias sem ninguém abrir", () => {
    expect(avaliarLembreteDoEnvio(envio(), dia(12, 11))).toEqual({ devido: false, motivo: "no-prazo" });
    expect(avaliarLembreteDoEnvio(envio(), dia(12, 12))).toEqual({ devido: true });
  });
  it("sem lembrete escolhido, nunca", () => {
    expect(avaliarLembreteDoEnvio(envio({ reminderDays: null }), dia(30))).toEqual({ devido: false, motivo: "sem-lembrete" });
  });
  it("um só: com o lembrete já enviado, não sai outro", () => {
    expect(avaliarLembreteDoEnvio(envio({ reminderSentAt: dia(12) }), dia(30))).toEqual({ devido: false, motivo: "ja-enviado" });
  });
  it("rascunho (agendado ou não) não tem lembrete", () => {
    expect(avaliarLembreteDoEnvio(envio({ status: "DRAFT" }), dia(30))).toEqual({ devido: false, motivo: "nao-publicado" });
  });
  it("alguém do cliente abriu (por e-mail ou portal): não lembra", () => {
    const aberto = envio({ recipients: [linha({ sentAt: dia(10) }), linha({ firstViewedAt: dia(11) })] });
    expect(avaliarLembreteDoEnvio(aberto, dia(30))).toEqual({ devido: false, motivo: "ja-aberto" });
  });
  it("aceito: não lembra", () => {
    expect(avaliarLembreteDoEnvio(envio({ recipients: [linha({ signedAt: dia(11) })] }), dia(30))).toEqual({ devido: false, motivo: "aceito" });
  });
});

describe("textos e corte", () => {
  it("a ficha diz quando saiu, ou o que está programado", () => {
    expect(textoDoLembrete({ reminderDays: 5, reminderSentAt: null })).toBe("Lembrete se ninguém abrir em 5 dias");
    expect(textoDoLembrete({ reminderDays: 5, reminderSentAt: new Date("2026-10-15T13:30:00Z") })).toMatch(/^Lembrete enviado em 15\/10\/2026.*10:30/);
    expect(textoDoLembrete({ reminderDays: null, reminderSentAt: null })).toBeNull();
  });
  it("a consulta corta pelo menor prazo", () => {
    expect(publicadoAteParaLembrete(dia(12))).toEqual(dia(10));
  });
});
