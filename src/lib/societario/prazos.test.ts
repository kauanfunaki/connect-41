import { describe, it, expect } from "vitest";
import {
  faixaDoPrazo,
  textoDoPrazo,
  agruparPorFaixa,
  agruparAgenda,
  ultimoDiaDaAgenda,
  fimDoDia,
  lerVisaoDaAgenda,
  ordenarExigencias,
  lerSituacaoDaExigencia,
  colunasDoKanban,
} from "./prazos";

// Datas civis ao meio-dia UTC, como o Societário grava (ver `datas.ts`).
const dia = (chave: string) => new Date(`${chave}T12:00:00Z`);

// Terça, 15/09/2026, às 23h de São Paulo — já é quarta em UTC. É o caso que
// pega quem compara instante em vez de dia civil.
const hoje = new Date("2026-09-16T02:00:00Z");

describe("faixaDoPrazo", () => {
  it("separa vencido, hoje, próximos 7 dias e depois pelo dia de São Paulo", () => {
    expect(faixaDoPrazo(dia("2026-09-14"), hoje)).toBe("vencido");
    expect(faixaDoPrazo(dia("2026-09-15"), hoje)).toBe("hoje");
    expect(faixaDoPrazo(dia("2026-09-16"), hoje)).toBe("semana");
    expect(faixaDoPrazo(dia("2026-09-22"), hoje)).toBe("semana");
    expect(faixaDoPrazo(dia("2026-09-23"), hoje)).toBe("depois");
  });

  // Meia-noite UTC do dia 15 é 21h do dia 14 em São Paulo. Continua sendo
  // "vencido" — a régua é o fuso do setor, não o do servidor.
  it("meia-noite UTC cai no dia anterior em São Paulo", () => {
    expect(faixaDoPrazo(new Date("2026-09-15T00:00:00Z"), hoje)).toBe("vencido");
  });
});

describe("textoDoPrazo", () => {
  it("fala em dias de calendário", () => {
    expect(textoDoPrazo(dia("2026-09-10"), hoje)).toBe("venceu há 5 dias");
    expect(textoDoPrazo(dia("2026-09-14"), hoje)).toBe("venceu ontem");
    expect(textoDoPrazo(dia("2026-09-15"), hoje)).toBe("vence hoje");
    expect(textoDoPrazo(dia("2026-09-16"), hoje)).toBe("vence amanhã");
    expect(textoDoPrazo(dia("2026-09-20"), hoje)).toBe("em 5 dias");
  });
});

describe("agruparPorFaixa", () => {
  it("ordena cada faixa pela data, o vencido mais antigo primeiro", () => {
    const itens = [
      { id: "b", d: dia("2026-09-12") },
      { id: "hoje", d: dia("2026-09-15") },
      { id: "a", d: dia("2026-09-01") },
      { id: "longe", d: dia("2026-12-01") },
    ];
    const g = agruparPorFaixa(itens, (i) => i.d, hoje);
    expect(g.vencido.map((i) => i.id)).toEqual(["a", "b"]);
    expect(g.hoje.map((i) => i.id)).toEqual(["hoje"]);
    expect(g.semana).toEqual([]);
    expect(g.depois.map((i) => i.id)).toEqual(["longe"]);
  });
});

describe("agenda", () => {
  it("vencidos vão para um grupo só, no topo; o resto por semana a partir da segunda", () => {
    const itens = [
      { id: "prox-semana", d: dia("2026-09-23") },
      { id: "vencido", d: dia("2026-08-20") },
      { id: "hoje", d: dia("2026-09-15") },
      { id: "domingo", d: dia("2026-09-20") },
    ];
    const grupos = agruparAgenda(itens, (i) => i.d, "semana", hoje);
    expect(grupos.map((g) => g.chave)).toEqual(["vencidos", "2026-09-14", "2026-09-21"]);
    expect(grupos[0].vencido).toBe(true);
    // Domingo pertence à semana que começou na segunda anterior.
    expect(grupos[1].itens.map((i) => i.id)).toEqual(["hoje", "domingo"]);
  });

  it("por mês agrupa no dia 1º", () => {
    const itens = [{ d: dia("2026-10-31") }, { d: dia("2026-09-30") }, { d: dia("2026-10-01") }];
    const grupos = agruparAgenda(itens, (i) => i.d, "mes", hoje);
    expect(grupos.map((g) => [g.chave, g.itens.length])).toEqual([
      ["2026-09-01", 1],
      ["2026-10-01", 2],
    ]);
  });

  it("sem vencidos, não inventa grupo vazio", () => {
    expect(agruparAgenda([{ d: dia("2026-09-16") }], (i) => i.d, "semana", hoje)[0].chave).toBe("2026-09-14");
  });

  it("a janela fecha no fim do último grupo inteiro", () => {
    // 8 semanas a partir da segunda 14/09 terminam no domingo 08/11.
    expect(ultimoDiaDaAgenda("semana", hoje)).toBe("2026-11-08");
    // 6 meses a partir de setembro terminam em 28/02/2027.
    expect(ultimoDiaDaAgenda("mes", hoje)).toBe("2027-02-28");
  });

  it("o fim do dia é 23:59 de São Paulo", () => {
    expect(fimDoDia("2026-09-15").toISOString()).toBe("2026-09-16T02:59:59.999Z");
  });

  it("visão desconhecida cai em semana", () => {
    expect(lerVisaoDaAgenda("mes")).toBe("mes");
    expect(lerVisaoDaAgenda("ano")).toBe("semana");
    expect(lerVisaoDaAgenda(undefined)).toBe("semana");
  });
});

describe("ordenarExigencias", () => {
  const ex = (id: string, o: { dueAt?: string; raisedAt?: string; resolvedAt?: string }) => ({
    id,
    dueAt: o.dueAt ? dia(o.dueAt) : null,
    raisedAt: dia(o.raisedAt ?? "2026-09-01"),
    resolvedAt: o.resolvedAt ? dia(o.resolvedAt) : null,
  });

  it("aberta com prazo próximo, depois aberta sem prazo, depois resolvidas da mais recente", () => {
    const ordem = ordenarExigencias([
      ex("resolvida-antiga", { resolvedAt: "2026-09-02" }),
      ex("sem-prazo-nova", { raisedAt: "2026-09-10" }),
      ex("prazo-longe", { dueAt: "2026-10-01" }),
      ex("resolvida-nova", { resolvedAt: "2026-09-12" }),
      ex("sem-prazo-velha", { raisedAt: "2026-09-03" }),
      ex("prazo-perto", { dueAt: "2026-09-18" }),
    ]).map((e) => e.id);

    expect(ordem).toEqual([
      "prazo-perto",
      "prazo-longe",
      "sem-prazo-velha",
      "sem-prazo-nova",
      "resolvida-nova",
      "resolvida-antiga",
    ]);
  });

  it("filtro desconhecido cai em abertas", () => {
    expect(lerSituacaoDaExigencia("resolvidas")).toBe("resolvidas");
    expect(lerSituacaoDaExigencia("x")).toBe("abertas");
  });
});

describe("colunasDoKanban", () => {
  // A ordem de dentro da coluna é a da fila. Se o kanban reordenasse, fila e
  // kanban discordariam sobre o que vem primeiro.
  it("segue o fluxo nas colunas e preserva a ordem de entrada dentro delas", () => {
    const colunas = colunasDoKanban([
      { id: "2", situacao: "EM_EXIGENCIA" as const },
      { id: "1", situacao: "EM_ANDAMENTO" as const },
      { id: "3", situacao: "EM_EXIGENCIA" as const },
    ]);
    expect(colunas.map((c) => c.situacao)).toEqual([
      "EM_ANDAMENTO",
      "AGUARDANDO_ORGAO",
      "EM_EXIGENCIA",
      "AGUARDANDO_CLIENTE",
      "SUSPENSO",
      "CONCLUIDO",
    ]);
    expect(colunas[2].linhas.map((l) => l.id)).toEqual(["2", "3"]);
    expect(colunas[1].linhas).toEqual([]);
  });
});
