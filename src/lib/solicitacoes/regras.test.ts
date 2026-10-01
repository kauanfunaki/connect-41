import { describe, expect, it } from "vitest";
import {
  assuntosPadraoDoTenant,
  emAberto,
  situacaoDaResposta,
  somarDiasUteis,
  transicao,
  validarAbertura,
  validarAssunto,
  type StatusDaSolicitacao,
} from "./regras";

const TODOS: StatusDaSolicitacao[] = ["ABERTA", "EM_ANDAMENTO", "AGUARDANDO_CLIENTE", "CONCLUIDA", "CANCELADA"];

describe("transicao — de quem é a vez", () => {
  it("a equipe responde e escolhe para onde vai", () => {
    expect(transicao("ABERTA", "EQUIPE", "RESPONDER")).toEqual({ ok: true, novo: "EM_ANDAMENTO" });
    expect(transicao("ABERTA", "EQUIPE", "RESPONDER", "AGUARDANDO_CLIENTE")).toEqual({ ok: true, novo: "AGUARDANDO_CLIENTE" });
    expect(transicao("EM_ANDAMENTO", "EQUIPE", "RESPONDER", "CONCLUIDA")).toEqual({ ok: true, novo: "CONCLUIDA" });
  });

  it("a equipe não responde numa encerrada sem reabrir", () => {
    expect(transicao("CONCLUIDA", "EQUIPE", "RESPONDER").ok).toBe(false);
    expect(transicao("CANCELADA", "EQUIPE", "RESPONDER").ok).toBe(false);
  });

  it("a resposta do cliente devolve a vez à 41 — e reabre a concluída", () => {
    expect(transicao("AGUARDANDO_CLIENTE", "CLIENTE", "RESPONDER")).toEqual({ ok: true, novo: "EM_ANDAMENTO" });
    expect(transicao("CONCLUIDA", "CLIENTE", "RESPONDER")).toEqual({ ok: true, novo: "EM_ANDAMENTO" });
    // Ninguém respondeu ainda: continua nova, para não sair do recorte "Novas".
    expect(transicao("ABERTA", "CLIENTE", "RESPONDER")).toEqual({ ok: true, novo: "ABERTA" });
  });

  it("a cancelada não reabre pela resposta do cliente", () => {
    expect(transicao("CANCELADA", "CLIENTE", "RESPONDER").ok).toBe(false);
  });

  it("os dois lados cancelam o que está em aberto, e só isso", () => {
    for (const ator of ["EQUIPE", "CLIENTE"] as const) {
      expect(transicao("EM_ANDAMENTO", ator, "CANCELAR")).toEqual({ ok: true, novo: "CANCELADA" });
      expect(transicao("CONCLUIDA", ator, "CANCELAR").ok).toBe(false);
    }
  });

  it("assumir, encaminhar, concluir e reabrir são só da equipe", () => {
    for (const acao of ["ASSUMIR", "ENCAMINHAR", "CONCLUIR", "REABRIR"] as const) {
      for (const s of TODOS) expect(transicao(s, "CLIENTE", acao).ok).toBe(false);
    }
  });

  it("assumir põe a nova em andamento e não mexe nas outras", () => {
    expect(transicao("ABERTA", "EQUIPE", "ASSUMIR")).toEqual({ ok: true, novo: "EM_ANDAMENTO" });
    expect(transicao("AGUARDANDO_CLIENTE", "EQUIPE", "ASSUMIR")).toEqual({ ok: true, novo: "AGUARDANDO_CLIENTE" });
  });

  it("reabrir só o que está encerrado", () => {
    expect(transicao("CONCLUIDA", "EQUIPE", "REABRIR")).toEqual({ ok: true, novo: "EM_ANDAMENTO" });
    expect(transicao("EM_ANDAMENTO", "EQUIPE", "REABRIR").ok).toBe(false);
  });

  it("em aberto = tudo menos concluída e cancelada", () => {
    expect(TODOS.filter(emAberto)).toEqual(["ABERTA", "EM_ANDAMENTO", "AGUARDANDO_CLIENTE"]);
  });
});

describe("somarDiasUteis — o prazo prometido ao cliente", () => {
  const semFeriado = new Set<string>();

  it("o dia da abertura não conta", () => {
    // Quarta, 01/10/2026 + 1 dia útil = quinta.
    expect(somarDiasUteis("2026-10-01", 1, semFeriado)).toBe("2026-10-02");
  });

  it("aberta na sexta com 2 dias úteis vence na terça", () => {
    expect(somarDiasUteis("2026-10-02", 2, semFeriado)).toBe("2026-10-06");
  });

  it("pula o feriado do tenant", () => {
    // 12/10/2026 é segunda (Nossa Senhora Aparecida): sexta 09 + 1 = terça 13.
    expect(somarDiasUteis("2026-10-09", 1, new Set(["2026-10-12"]))).toBe("2026-10-13");
  });

  it("prazo zero ou negativo vira um dia útil", () => {
    expect(somarDiasUteis("2026-10-01", 0, semFeriado)).toBe("2026-10-02");
  });
});

describe("situacaoDaResposta — comparada em dias de São Paulo", () => {
  // O prazo fica gravado ao meio-dia UTC do dia.
  const prazo = new Date("2026-10-06T12:00:00Z");
  const base = { status: "ABERTA" as const, responseDue: prazo, firstResponseAt: null };

  it("às 22h do dia do prazo (01h UTC do dia seguinte) ainda vence hoje", () => {
    expect(situacaoDaResposta(base, new Date("2026-10-07T01:00:00Z"))).toBe("VENCE_HOJE");
  });

  it("no dia seguinte, atrasada", () => {
    expect(situacaoDaResposta(base, new Date("2026-10-07T12:00:00Z"))).toBe("ATRASADA");
  });

  it("antes do dia, no prazo", () => {
    expect(situacaoDaResposta(base, new Date("2026-10-05T12:00:00Z"))).toBe("NO_PRAZO");
  });

  it("respondida cumpre o prazo, mesmo que depois", () => {
    expect(situacaoDaResposta({ ...base, firstResponseAt: new Date("2026-10-08T12:00:00Z") }, new Date("2026-10-09T12:00:00Z"))).toBe(
      "RESPONDIDA"
    );
  });

  it("encerrada sem resposta não fica atrasada para sempre", () => {
    expect(situacaoDaResposta({ ...base, status: "CANCELADA" }, new Date("2026-10-20T12:00:00Z"))).toBe("ENCERRADA");
  });
});

describe("validação", () => {
  it("abertura precisa dizer o que o cliente quer", () => {
    expect(validarAbertura("  oi ").ok).toBe(false);
    expect(validarAbertura("Preciso do contrato social atualizado")).toEqual({ ok: true, texto: "Preciso do contrato social atualizado" });
  });

  it("assunto: nome, setor e prazo de 1 a 30 dias úteis", () => {
    const ok = { label: "Pedir um documento", description: "", sectorCode: "controladoria", responseDays: "2" };
    expect(validarAssunto(ok)).toEqual({
      ok: true,
      dados: { label: "Pedir um documento", description: null, sectorCode: "controladoria", responseDays: 2 },
    });
    expect(validarAssunto({ ...ok, label: " " }).ok).toBe(false);
    expect(validarAssunto({ ...ok, sectorCode: "" }).ok).toBe(false);
    expect(validarAssunto({ ...ok, responseDays: "0" }).ok).toBe(false);
    expect(validarAssunto({ ...ok, responseDays: "31" }).ok).toBe(false);
    expect(validarAssunto({ ...ok, responseDays: "1.5" }).ok).toBe(false);
  });
});

describe("assuntosPadraoDoTenant — a lista que nasce com o tenant", () => {
  it("usa o setor de cada assunto quando o tenant tem", () => {
    const a = assuntosPadraoDoTenant(["controladoria", "societario", "dp", "fiscal", "bpo"]);
    expect(a.map((x) => x.sectorCode)).toEqual(["controladoria", "societario", "dp", "fiscal", "bpo", "controladoria"]);
  });

  it("setor que falta cai na Controladoria", () => {
    const a = assuntosPadraoDoTenant(["controladoria", "dp"]);
    expect(new Set(a.map((x) => x.sectorCode))).toEqual(new Set(["controladoria", "dp"]));
  });

  it("sem Controladoria, cai no primeiro setor ativo", () => {
    const a = assuntosPadraoDoTenant(["fiscal"]);
    expect(a.every((x) => x.sectorCode === "fiscal")).toBe(true);
  });

  it("tenant sem setor não ganha assunto", () => {
    expect(assuntosPadraoDoTenant([])).toEqual([]);
  });
});
