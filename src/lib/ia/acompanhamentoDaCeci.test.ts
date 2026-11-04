import { describe, expect, it } from "vitest";
import {
  agentesDaCeci,
  motivosDoNao,
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
        { agentCode: "a", nome: "Ceci · Fiscal", chamadas: 20, erros: 2, travadas: 0, mediaMs: 1, p90Ms: 1, custoCents: 0, semCusto: 0, boas: 2, ruins: 4, cortadas: 0 },
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
