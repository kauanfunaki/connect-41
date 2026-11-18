import { describe, expect, it } from "vitest";
import {
  AGENTE_DOS_CHAMADOS,
  agentesDaCeci,
  linhaDaChamada,
  motivosDoNao,
  nomeDoAgente,
  pontosDaCeci,
  segundaDaSemana,
  semanasDaCeci,
  type ChamadaDaCeci,
  type MensagemDaCeci,
  type SemanaDaCeci,
} from "./acompanhamentoDaCeci";

// A tela da Ceci na Tech (lote C dos ajustes de 03/11/2026).

const AGORA = new Date("2026-11-04T15:00:00Z"); // quarta
const msg = (p: Partial<MensagemDaCeci>): MensagemDaCeci => ({
  role: "ASSISTENTE",
  failed: false,
  truncated: false,
  rating: null,
  ratingReason: null,
  createdAt: new Date("2026-11-03T12:00:00Z"),
  agentCode: "assistente_do_bpo",
  ...p,
});
const run = (p: Partial<ChamadaDaCeci>): ChamadaDaCeci => ({
  agentCode: "assistente_do_bpo",
  startedAt: new Date("2026-11-03T12:00:00Z"),
  finishedAt: new Date("2026-11-03T12:00:04Z"),
  ok: true,
  error: null,
  costCents: 2,
  ...p,
});

describe("as semanas", () => {
  it("a segunda-feira da semana", () => {
    expect(segundaDaSemana(AGORA)).toBe("2026-11-02");
    expect(segundaDaSemana(new Date("2026-11-08T23:00:00Z"))).toBe("2026-11-02");
    expect(segundaDaSemana(new Date("2026-11-09T01:00:00Z"))).toBe("2026-11-09");
  });

  it("oito semanas, da mais antiga à atual, contando perguntas, avaliações, falhas e custo", () => {
    const s = semanasDaCeci(
      [msg({ role: "USUARIO" }), msg({ rating: "BOA" }), msg({ rating: "RUIM", failed: true }), msg({ role: "USUARIO", createdAt: new Date("2026-10-27T12:00:00Z") })],
      [run({}), run({ costCents: null })],
      AGORA
    );
    expect(s).toHaveLength(8);
    expect(s[0].inicio).toBe("2026-09-14");
    expect(s[7]).toEqual({ inicio: "2026-11-02", perguntas: 1, boas: 1, ruins: 1, falhas: 1, custoCents: 2 });
    expect(s[6].perguntas).toBe(1);
  });
});

describe("por agente", () => {
  it("erros, travadas, tempo médio e p90, custo e chamadas sem custo", () => {
    const [bpo] = agentesDaCeci(
      [msg({ rating: "BOA" }), msg({ rating: "RUIM", truncated: true })],
      [
        run({ finishedAt: new Date("2026-11-03T12:00:02Z") }),
        run({ finishedAt: new Date("2026-11-03T12:00:10Z") }),
        run({ ok: false, error: "timeout" }),
        run({ ok: null, finishedAt: null, startedAt: new Date("2026-11-04T14:00:00Z") }),
        run({ costCents: null }),
      ],
      AGORA
    );
    expect(bpo).toMatchObject({ nome: "Ceci · BPO", chamadas: 5, erros: 1, travadas: 1, semCusto: 1, custoCents: 8, boas: 1, ruins: 1, cortadas: 1 });
    expect(bpo.mediaMs).toBe(Math.round((2000 + 10000 + 4000) / 3));
    expect(bpo.p90Ms).toBe(10000);
  });

  it("motivos do 👎, do mais comum", () => {
    expect(
      motivosDoNao([msg({ rating: "RUIM", ratingReason: "incompleta" }), msg({ rating: "RUIM", ratingReason: "errou_dado" }), msg({ rating: "RUIM", ratingReason: "incompleta" }), msg({ rating: "RUIM", ratingReason: "x" })])
    ).toEqual([
      { motivo: "incompleta", rotulo: "Incompleta", vezes: 2 },
      { motivo: "errou_dado", rotulo: "Errou o dado", vezes: 1 },
    ]);
  });
});

describe("os pontos importantes", () => {
  const semana = (boas: number, ruins: number): SemanaDaCeci => ({ inicio: "x", perguntas: 0, boas, ruins, falhas: 0, custoCents: 0 });
  const nomeDoSetor = (c: string) => c.toUpperCase();

  it("queda das avaliações, agente que erra muito e setor sem Ceci", () => {
    const pontos = pontosDaCeci({
      semanas: [semana(4, 0), semana(4, 0), semana(2, 0), semana(2, 0), semana(2, 3), semana(2, 3), semana(1, 2), semana(1, 2)],
      agentes: [
        { chave: "a", agentCode: "a", nome: "Ceci · Fiscal", doChat: true, chamadas: 20, erros: 2, travadas: 0, mediaMs: 1, p90Ms: 1, custoCents: 0, semCusto: 0, boas: 2, ruins: 4, cortadas: 0 },
      ],
      motivos: [{ rotulo: "Incompleta", vezes: 3 }],
      semIa: { dp: 4 },
      nomeDoSetor,
    });
    expect(pontos.map((p) => p.texto)).toEqual([
      "As respostas boas caíram de 100% para 38% nas últimas 4 semanas.",
      "Ceci · Fiscal: 67% das respostas avaliadas levaram 👎 (4 de 6).",
      "Ceci · Fiscal: 2 de 20 chamadas deram erro (10%).",
      "4 perguntas foram para DP, que ainda não tem Ceci — candidato ao próximo agente.",
      "O motivo de 👎 mais comum é “Incompleta” (3 vezes).",
    ]);
    expect(pontos[0].tom).toBe("perigo");
  });

  it("sem nada fora do normal, uma linha dizendo isso", () => {
    expect(pontosDaCeci({ semanas: [], agentes: [], motivos: [], semIa: {}, nomeDoSetor })).toEqual([{ tom: "sucesso", texto: "Nada fora do normal no período." }]);
  });
});

describe("a IA dos chamados (melhoria-781)", () => {
  const chamado = (entityType: string | null, p: Partial<ChamadaDaCeci> = {}) => run({ agentCode: AGENTE_DOS_CHAMADOS, entityType, ...p });

  it("o nome vem do catálogo, e cada parte vira uma linha", () => {
    expect(nomeDoAgente(AGENTE_DOS_CHAMADOS)).toBe("Triagem de chamados");
    expect(nomeDoAgente("assistente_do_bpo")).toBe("Ceci · BPO");
    expect(linhaDaChamada({ agentCode: AGENTE_DOS_CHAMADOS, entityType: "HelpdeskTicket" })).toEqual({ chave: "triagem_chamados:triagem", nome: "Triagem de chamados · chamado aberto" });
    expect(linhaDaChamada({ agentCode: AGENTE_DOS_CHAMADOS, entityType: "HelpdeskDraft" }).nome).toBe("Triagem de chamados · revisão antes de abrir");
    expect(linhaDaChamada({ agentCode: AGENTE_DOS_CHAMADOS, entityType: "HelpdeskHistoricCase" }).nome).toBe("Triagem de chamados · histórico do Hub");
    // Sem o contexto gravado, fica na linha do agente.
    expect(linhaDaChamada({ agentCode: AGENTE_DOS_CHAMADOS, entityType: null })).toEqual({ chave: "triagem_chamados", nome: "Triagem de chamados" });
    // O chat não se separa pelo entityType.
    expect(linhaDaChamada({ agentCode: "assistente_do_bpo", entityType: "conversa" }).chave).toBe("assistente_do_bpo");
  });

  it("entra no processamento sem avaliações, e conta nos erros e no custo", () => {
    const agentes = agentesDaCeci(
      [msg({ rating: "BOA" }), msg({ role: "USUARIO" })],
      [
        run({}),
        chamado("HelpdeskTicket"),
        chamado("HelpdeskTicket", { ok: false, error: "OpenAI indisponível.", costCents: 0 }),
        chamado("HelpdeskDraft", { costCents: 5 }),
        chamado("HelpdeskHistoricCase", { costCents: 1 }),
      ],
      AGORA
    );
    const por = Object.fromEntries(agentes.map((a) => [a.chave, a]));
    expect(Object.keys(por).sort()).toEqual(["assistente_do_bpo", "triagem_chamados:historico", "triagem_chamados:revisao", "triagem_chamados:triagem"]);
    expect(por["triagem_chamados:triagem"]).toMatchObject({ doChat: false, chamadas: 2, erros: 1, custoCents: 2, boas: 0, ruins: 0, mediaMs: 4000, p90Ms: 4000 });
    expect(por["assistente_do_bpo"]).toMatchObject({ doChat: true, chamadas: 1, boas: 1 });
    // Os totais da tela: erros e custo somam tudo; as avaliações continuam só do chat.
    const totais = agentes.reduce((a, g) => ({ erros: a.erros + g.erros, custo: a.custo + g.custoCents, avaliadas: a.avaliadas + g.boas + g.ruins }), { erros: 0, custo: 0, avaliadas: 0 });
    expect(totais).toEqual({ erros: 1, custo: 2 + 2 + 0 + 5 + 1, avaliadas: 1 });
  });

  it("fica fora da evolução por semana, que é do chat", () => {
    const [atual] = semanasDaCeci([msg({ role: "USUARIO" })], [run({}), chamado("HelpdeskTicket", { costCents: 50 })], AGORA).slice(-1);
    expect(atual).toMatchObject({ perguntas: 1, custoCents: 2 });
  });

  it("nos pontos, sem mensagens não é problema; erro alto e travada valem como para os outros", () => {
    const nomeDoSetor = (c: string) => c;
    const base = { chave: "triagem_chamados:triagem", agentCode: AGENTE_DOS_CHAMADOS, nome: "Triagem de chamados · chamado aberto", doChat: false, travadas: 0, mediaMs: 3000, p90Ms: 5000, custoCents: 40, semCusto: 0, boas: 0, ruins: 0, cortadas: 0 };
    expect(pontosDaCeci({ semanas: [], agentes: [{ ...base, chamadas: 50, erros: 0 }], motivos: [], semIa: {}, nomeDoSetor })).toEqual([{ tom: "sucesso", texto: "Nada fora do normal no período." }]);
    expect(pontosDaCeci({ semanas: [], agentes: [{ ...base, chamadas: 20, erros: 4, travadas: 1 }], motivos: [], semIa: {}, nomeDoSetor }).map((p) => p.texto)).toEqual([
      "Triagem de chamados · chamado aberto: 4 de 20 chamadas deram erro (20%).",
      "Triagem de chamados · chamado aberto: 1 chamada ficou sem terminar.",
    ]);
  });
});
