import { describe, expect, it } from "vitest";
import { lerPassos, textoDosPassos, passoDevido, avaliarRegua, lerEmail, PASSOS_PADRAO, type TituloParaRegua } from "./regua";

const HOJE = "2026-09-16";
const LIGADA = { ligada: true, passos: PASSOS_PADRAO };

describe("lerPassos", () => {
  it("ordena, tira repetidos e aceita espaço ou ponto e vírgula", () => {
    expect(lerPassos("30, 7;1 15 7")).toEqual({ ok: true, passos: [1, 7, 15, 30] });
    expect(textoDosPassos([1, 7, 15, 30])).toBe("1,7,15,30");
  });

  it("recusa vazio, texto, zero e acima do teto", () => {
    expect(lerPassos("").ok).toBe(false);
    expect(lerPassos("1, sete").ok).toBe(false);
    expect(lerPassos("0,7").ok).toBe(false);
    expect(lerPassos("400").ok).toBe(false);
    expect(lerPassos("1,2,3,4,5,6,7,8,9,10,11").ok).toBe(false);
  });
});

describe("passoDevido", () => {
  it("o maior passo alcançado, até o próximo chegar", () => {
    expect(passoDevido(0, PASSOS_PADRAO, [])).toBeNull();
    expect(passoDevido(1, PASSOS_PADRAO, [])).toBe(1);
    expect(passoDevido(6, PASSOS_PADRAO, [])).toBe(1);
    expect(passoDevido(7, PASSOS_PADRAO, [])).toBe(7);
    expect(passoDevido(20, PASSOS_PADRAO, [])).toBe(15);
  });

  it("não reenvia o passo já registrado, e não manda passo menor que um já enviado", () => {
    expect(passoDevido(3, PASSOS_PADRAO, [1])).toBeNull();
    expect(passoDevido(8, PASSOS_PADRAO, [1])).toBe(7);
    expect(passoDevido(8, PASSOS_PADRAO, [1, 7])).toBeNull();
    // Configuração trocada depois de enviar o de 10: o de 7 já não é notícia.
    expect(passoDevido(8, PASSOS_PADRAO, [10])).toBeNull();
  });

  it("cron parado não manda passos acumulados: só o atual", () => {
    expect(passoDevido(16, PASSOS_PADRAO, [])).toBe(15);
  });

  it("o último passo vale por uma janela; dívida velha fica fora", () => {
    expect(passoDevido(30, PASSOS_PADRAO, [])).toBe(30);
    expect(passoDevido(59, PASSOS_PADRAO, [])).toBe(30);
    expect(passoDevido(60, PASSOS_PADRAO, [])).toBeNull();
    expect(passoDevido(400, PASSOS_PADRAO, [])).toBeNull();
  });
});

describe("avaliarRegua", () => {
  const t = (x: Partial<TituloParaRegua> = {}): TituloParaRegua => ({
    situacao: "VENCIDO_SEM_CONTATO",
    vencimentoKey: "2026-09-09",
    ultimoContato: null,
    email: "sacado@cliente.com.br",
    empresaForaDaRegua: false,
    enviados: [],
    ...x,
  });

  it("título vencido há 7 dias, com e-mail, recebe o passo 7", () => {
    expect(avaliarRegua(t(), LIGADA, HOJE)).toEqual({ enviar: 7 });
  });

  it("régua desligada e empresa fora", () => {
    expect(avaliarRegua(t(), { ...LIGADA, ligada: false }, HOJE)).toEqual({ enviar: null, motivo: "REGUA_DESLIGADA" });
    expect(avaliarRegua(t({ empresaForaDaRegua: true }), LIGADA, HOJE)).toEqual({ enviar: null, motivo: "EMPRESA_FORA" });
  });

  it("pausas: acordo, contestação e promessa ainda não vencida", () => {
    expect(avaliarRegua(t({ situacao: "EM_ACORDO" }), LIGADA, HOJE)).toEqual({ enviar: null, motivo: "EM_ACORDO" });
    const contestou = { resultado: "CONTESTOU" as const, contatoKey: "2026-09-10", proximaAcaoKey: null };
    expect(avaliarRegua(t({ situacao: "CONTESTADO", ultimoContato: contestou }), LIGADA, HOJE)).toEqual({
      enviar: null,
      motivo: "CONTESTADO",
    });
    const promessa = (k: string) => ({ resultado: "PROMETEU_PAGAR" as const, contatoKey: "2026-09-10", proximaAcaoKey: k });
    expect(avaliarRegua(t({ situacao: "PROMETEU_PAGAR", ultimoContato: promessa("2026-09-20") }), LIGADA, HOJE)).toEqual({
      enviar: null,
      motivo: "PROMESSA_DE_PAGAMENTO",
    });
    // Promessa para hoje ainda pode ser cumprida hoje.
    expect(avaliarRegua(t({ situacao: "PROMETEU_PAGAR", ultimoContato: promessa(HOJE) }), LIGADA, HOJE)).toEqual({
      enviar: null,
      motivo: "PROMESSA_DE_PAGAMENTO",
    });
    // Promessa vencida sem pagamento: a régua volta.
    expect(avaliarRegua(t({ situacao: "PROMETEU_PAGAR", ultimoContato: promessa("2026-09-15") }), LIGADA, HOJE)).toEqual({ enviar: 7 });
  });

  it("sem e-mail não entra — mas a pausa é dita antes", () => {
    expect(avaliarRegua(t({ email: null }), LIGADA, HOJE)).toEqual({ enviar: null, motivo: "SEM_EMAIL" });
    expect(avaliarRegua(t({ email: null, situacao: "EM_ACORDO" }), LIGADA, HOJE)).toEqual({ enviar: null, motivo: "EM_ACORDO" });
  });

  it("em dia, perda e fora da cobrança não recebem", () => {
    expect(avaliarRegua(t({ situacao: "EM_DIA", vencimentoKey: HOJE }), LIGADA, HOJE)).toEqual({ enviar: null, motivo: "NAO_ESTA_EM_COBRANCA" });
    expect(avaliarRegua(t({ situacao: "PERDA" }), LIGADA, HOJE)).toEqual({ enviar: null, motivo: "NAO_ESTA_EM_COBRANCA" });
    expect(avaliarRegua(t({ situacao: null }), LIGADA, HOJE)).toEqual({ enviar: null, motivo: "NAO_ESTA_EM_COBRANCA" });
  });

  it("reexecutar depois de registrar o passo não reenvia", () => {
    expect(avaliarRegua(t({ enviados: [7] }), LIGADA, HOJE)).toEqual({ enviar: null, motivo: "SEM_PASSO_HOJE" });
  });
});

describe("lerEmail", () => {
  it("normaliza, aceita vazio e recusa o malformado", () => {
    expect(lerEmail("  Financeiro@Cliente.COM.br ")).toBe("financeiro@cliente.com.br");
    expect(lerEmail("")).toBeNull();
    expect(lerEmail("sem-arroba")).toBe(false);
  });
});
