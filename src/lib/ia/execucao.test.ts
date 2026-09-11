import { describe, it, expect } from "vitest";
import {
  finalizarChamada,
  podeChamar,
  saudeDoAgente,
  inicioDoMesEmSaoPaulo,
  type EstadoParaChamar,
} from "./execucao";

const AGORA = new Date("2026-09-11T12:00:00Z");

function estado(over: Partial<EstadoParaChamar> = {}): EstadoParaChamar {
  return {
    ligado: true,
    temChave: true,
    gasto: { centavos: 0, chamadas: 0, semCusto: 0 },
    tetoMensalCentavos: 10_000,
    tetoMensalChamadas: 1_000,
    ...over,
  };
}

describe("finalizarChamada", () => {
  it("sucesso grava uso e custo", () => {
    const g = finalizarChamada(
      { ok: true, uso: { entrada: 1_200, saida: 300 }, custoCentavos: 7 },
      AGORA
    );
    expect(g.ok).toBe(true);
    expect(g.error).toBeNull();
    expect(g.inputTokens).toBe(1_200);
    expect(g.outputTokens).toBe(300);
    expect(g.costCents).toBe(7);
    expect(g.finishedAt).toBe(AGORA);
  });

  // Custo desconhecido atravessa inteiro: virar zero aqui seria furar o teto
  // pelo caminho mais silencioso possível.
  it("sucesso com custo desconhecido guarda nulo, não zero", () => {
    const g = finalizarChamada(
      { ok: true, uso: { entrada: 10, saida: 10 }, custoCentavos: null },
      AGORA
    );
    expect(g.costCents).toBeNull();
  });

  it("falha guarda o erro e nenhum uso", () => {
    const g = finalizarChamada({ ok: false, erro: "provedor fora do ar" }, AGORA);
    expect(g.ok).toBe(false);
    expect(g.error).toBe("provedor fora do ar");
    expect(g.inputTokens).toBeNull();
    expect(g.costCents).toBeNull();
  });

  it("erro longo é cortado no limite da coluna", () => {
    const g = finalizarChamada({ ok: false, erro: "x".repeat(900) }, AGORA);
    expect(g.error).toHaveLength(500);
  });

  it("erro vazio vira texto, não string vazia", () => {
    expect(finalizarChamada({ ok: false, erro: "" }, AGORA).error).toBe("falha desconhecida");
  });

  it("toda chamada carimba o fim", () => {
    expect(finalizarChamada({ ok: false, erro: "x" }, AGORA).finishedAt).toBe(AGORA);
  });
});

describe("podeChamar", () => {
  it("agente ligado, com chave e dentro dos tetos, pode", () => {
    expect(podeChamar(estado()).pode).toBe(true);
  });

  it("desligado não roda", () => {
    const v = podeChamar(estado({ ligado: false }));
    expect(v.pode).toBe(false);
    if (!v.pode) expect(v.motivo).toBe("desligado");
  });

  // Responder "teto atingido" a quem nunca configurou chave manda a pessoa
  // procurar no lugar errado.
  it("sem chave vem antes de qualquer teto", () => {
    const v = podeChamar(
      estado({ temChave: false, gasto: { centavos: 99_999, chamadas: 99_999, semCusto: 0 } })
    );
    expect(v.pode).toBe(false);
    if (!v.pode) expect(v.motivo).toBe("sem_chave");
  });

  it("atingir o teto de reais já para", () => {
    const v = podeChamar(estado({ gasto: { centavos: 10_000, chamadas: 1, semCusto: 0 } }));
    expect(v.pode).toBe(false);
    if (!v.pode) expect(v.motivo).toBe("teto_de_reais");
  });

  it("um centavo abaixo do teto ainda passa", () => {
    expect(podeChamar(estado({ gasto: { centavos: 9_999, chamadas: 1, semCusto: 0 } })).pode).toBe(true);
  });

  // O teto que funciona sem tabela de preço: todas as chamadas com custo
  // desconhecido, gasto somado igual a zero, e mesmo assim ele segura.
  it("teto de chamadas segura mesmo quando nenhum custo é conhecido", () => {
    const v = podeChamar(estado({ gasto: { centavos: 0, chamadas: 1_000, semCusto: 1_000 } }));
    expect(v.pode).toBe(false);
    if (!v.pode) expect(v.motivo).toBe("teto_de_chamadas");
  });
});

describe("saudeDoAgente", () => {
  it("nunca usado é diferente de ok", () => {
    expect(saudeDoAgente(estado())).toBe("nunca_usado");
  });

  it("uso normal é ok", () => {
    expect(saudeDoAgente(estado({ gasto: { centavos: 100, chamadas: 5, semCusto: 0 } }))).toBe("ok");
  });

  it("desligado e sem chave vêm primeiro", () => {
    expect(saudeDoAgente(estado({ ligado: false }))).toBe("desligado");
    expect(saudeDoAgente(estado({ temChave: false }))).toBe("sem_chave");
  });

  it("perto do teto avisa antes de travar", () => {
    expect(saudeDoAgente(estado({ gasto: { centavos: 8_000, chamadas: 5, semCusto: 0 } }))).toBe(
      "perto_do_teto"
    );
  });

  it("no teto é estado próprio", () => {
    expect(saudeDoAgente(estado({ gasto: { centavos: 10_000, chamadas: 5, semCusto: 0 } }))).toBe(
      "no_teto"
    );
  });

  // O ponto do estado: o total do mês parece tranquilo e não significa nada.
  it("custo desconhecido levanta a mão mesmo com total baixo", () => {
    expect(saudeDoAgente(estado({ gasto: { centavos: 50, chamadas: 30, semCusto: 12 } }))).toBe(
      "custo_desconhecido"
    );
  });

  it("o teto de chamadas também dispara o aviso", () => {
    expect(saudeDoAgente(estado({ gasto: { centavos: 0, chamadas: 900, semCusto: 0 } }))).toBe(
      "perto_do_teto"
    );
  });
});

describe("inicioDoMesEmSaoPaulo", () => {
  it("é meia-noite de São Paulo, que é 03:00 UTC", () => {
    expect(inicioDoMesEmSaoPaulo(new Date("2026-09-11T12:00:00Z")).toISOString()).toBe(
      "2026-09-01T03:00:00.000Z"
    );
  });

  // O caso que o fuso do servidor erraria: às 23h de 31/08 em São Paulo já é
  // 02:00 UTC de 1º/09. O mês do teto é o de quem olha a tela.
  it("às 23h do último dia ainda é o mês que está acabando", () => {
    expect(inicioDoMesEmSaoPaulo(new Date("2026-09-01T02:00:00Z")).toISOString()).toBe(
      "2026-08-01T03:00:00.000Z"
    );
  });

  it("logo depois da virada em São Paulo, o mês novo começa", () => {
    expect(inicioDoMesEmSaoPaulo(new Date("2026-09-01T03:30:00Z")).toISOString()).toBe(
      "2026-09-01T03:00:00.000Z"
    );
  });

  it("janeiro volta para dezembro do ano anterior", () => {
    expect(inicioDoMesEmSaoPaulo(new Date("2027-01-01T02:00:00Z")).toISOString()).toBe(
      "2026-12-01T03:00:00.000Z"
    );
  });
});

describe("finalizarChamada sem contagem de tokens", () => {
  // O provedor respondeu, mas não disse quanto custou. Não é chamada de graça:
  // é chamada que não sabemos somar — e o teto de chamadas é quem segura.
  it("sucesso sem uso guarda tokens e custo nulos", () => {
    const g = finalizarChamada({ ok: true, uso: null, custoCentavos: null }, AGORA);
    expect(g.ok).toBe(true);
    expect(g.inputTokens).toBeNull();
    expect(g.outputTokens).toBeNull();
    expect(g.costCents).toBeNull();
  });
});
