import { describe, expect, it } from "vitest";
import { fraseDoPrazo, linkDoWhatsApp, mensagemDoTeste, partesDoPrazo, prazoDoLink, primeiroNome } from "./linkDoTeste";

// Link gerado em 13/10/2026 às 09:12 (São Paulo), valendo 7 dias.
const CRIADO = new Date("2026-10-13T12:12:00.000Z");
const EXPIRA = new Date("2026-10-20T12:12:00.000Z");

describe("prazoDoLink — os dias que faltam", () => {
  it("conta dias de calendário em São Paulo: no dia 14, faltam 6", () => {
    const p = prazoDoLink({ criadoEm: CRIADO, expiraEm: EXPIRA, agora: new Date("2026-10-14T20:00:00.000Z") });
    expect(p).toMatchObject({ vencido: false, diasRestantes: 6 });
    expect(fraseDoPrazo(p)).toBe("Expira em 6 dias");
  });

  it("logo depois de gerar: 7 dias e a barra quase vazia", () => {
    const p = prazoDoLink({ criadoEm: CRIADO, expiraEm: EXPIRA, agora: CRIADO });
    expect(p.diasRestantes).toBe(7);
    expect(p.usado).toBe(0);
  });

  it("a barra é a parte do prazo que já passou", () => {
    const meio = new Date((CRIADO.getTime() + EXPIRA.getTime()) / 2);
    expect(prazoDoLink({ criadoEm: CRIADO, expiraEm: EXPIRA, agora: meio }).usado).toBeCloseTo(0.5, 5);
  });

  it("no dia do vencimento, antes da hora, é 'Expira hoje' — e não '1 dia'", () => {
    const p = prazoDoLink({ criadoEm: CRIADO, expiraEm: EXPIRA, agora: new Date("2026-10-20T11:00:00.000Z") });
    expect(p).toMatchObject({ vencido: false, diasRestantes: 0 });
    expect(fraseDoPrazo(p)).toBe("Expira hoje");
  });

  it("na véspera é 'Expira amanhã', mesmo à noite", () => {
    // 19/10 às 23h em São Paulo = 20/10 02h UTC.
    const p = prazoDoLink({ criadoEm: CRIADO, expiraEm: EXPIRA, agora: new Date("2026-10-20T02:00:00.000Z") });
    expect(p.diasRestantes).toBe(1);
    expect(fraseDoPrazo(p)).toBe("Expira amanhã");
  });

  it("depois da hora do vencimento, venceu: barra cheia", () => {
    const p = prazoDoLink({ criadoEm: CRIADO, expiraEm: EXPIRA, agora: EXPIRA });
    expect(p).toEqual({ vencido: true, diasRestantes: 0, usado: 1 });
    expect(partesDoPrazo(p)).toEqual({ texto: "", destaque: "Venceu" });
  });

  it("o destaque em negrito é a quantidade", () => {
    expect(partesDoPrazo({ vencido: false, diasRestantes: 6, usado: 0.1 })).toEqual({ texto: "Expira em", destaque: "6 dias" });
  });
});

describe("mensagemDoTeste — a mensagem do WhatsApp", () => {
  const LINK = "https://useconnect.com.br/teste/abc123";

  it("com a vaga: primeiro nome, vaga, link e prazo", () => {
    expect(mensagemDoTeste({ nome: "Gabriel Santos da Silva", vaga: "Auxiliar de produção", url: LINK, validoAte: "20/10" })).toBe(
      "Olá, Gabriel! Para seguir no processo da vaga Auxiliar de produção, responda este teste rápido pelo link:\n" +
        `${LINK}\n\nO link vale até 20/10. Qualquer dúvida, é só responder aqui.`
    );
  });

  it("sem vaga (teste mandado da ficha), sem falar de vaga", () => {
    const m = mensagemDoTeste({ nome: "Ana", vaga: null, url: LINK, validoAte: "20/10" });
    expect(m.startsWith("Olá, Ana! Responda este teste rápido pelo link:\n")).toBe(true);
    expect(m).not.toContain("vaga");
    expect(m).toContain(LINK);
  });

  it("primeiroNome aguenta espaços sobrando", () => {
    expect(primeiroNome("  Larissa   Oliveira ")).toBe("Larissa");
  });
});

describe("linkDoWhatsApp", () => {
  it("com celular brasileiro, abre a conversa com o candidato (DDI 55)", () => {
    const href = linkDoWhatsApp("(41) 99999-8888", "Olá!\nlink");
    expect(href).toBe("https://wa.me/5541999998888?text=Ol%C3%A1!%0Alink");
  });

  it("número já com 55 não ganha outro", () => {
    expect(linkDoWhatsApp("+55 41 99999-8888", "x")).toBe("https://wa.me/5541999998888?text=x");
  });

  it("sem telefone que sirva, abre o WhatsApp para escolher o contato", () => {
    expect(linkDoWhatsApp(null, "x")).toBe("https://wa.me/?text=x");
    expect(linkDoWhatsApp("123", "x")).toBe("https://wa.me/?text=x");
  });

  it("a mensagem vai inteira, codificada", () => {
    const m = mensagemDoTeste({ nome: "Ana", vaga: "Caixa & repositor", url: "https://x.com/teste/a?b=1", validoAte: "20/10" });
    const texto = new URL(linkDoWhatsApp(null, m)).searchParams.get("text");
    expect(texto).toBe(m);
  });
});
