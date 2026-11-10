import { beforeEach, describe, expect, it, vi } from "vitest";
import type { PosicaoNoRanking } from "./ranking";

// A API do ranking (10/11/2026): os parâmetros, o recorte do topo e o que sai
// em cada linha. O banco é de mentira; a autenticação pelo token está em
// src/lib/tokens-pessoais/servidor.test.ts (escopo "academia:ler").

const m = vi.hoisted(() => ({ ranking: vi.fn(), premio: vi.fn(), pessoas: vi.fn() }));
vi.mock("./servidor", () => ({ rankingDoMes: m.ranking, premioDoMes: m.premio }));
vi.mock("@/lib/prisma", () => ({ getPrisma: () => ({ user: { findMany: m.pessoas } }) }));
vi.mock("@/lib/sectors", () => ({ getSectorMaps: async () => ({ labels: { fiscal: "Fiscal" } }), sectorLabel: (l: Record<string, string>, c: string) => l[c] ?? c }));

import { lerParametrosDoRanking, rankingParaApi } from "./api";
import { ErroApi } from "@/lib/api-v1/erros";

const AGORA = new Date("2026-11-10T12:00:00Z");
const pos = (posicao: number): PosicaoNoRanking => ({
  posicao, userId: `u${posicao}`, nivel: "medio", niveis: ["medio"], sectorCode: "fiscal", ppm: 80 - posicao, acertos: null, total: null,
  precisao: 95, pontos: 80 - posicao, tentativas: 1, duracaoMs: 60_000,
});

beforeEach(() => {
  vi.clearAllMocks();
  m.ranking.mockResolvedValue({ ranking: Array.from({ length: 15 }, (_, i) => pos(i + 1)), linhas: [] });
  m.premio.mockResolvedValue("Top 3 ganham chocolate");
  m.pessoas.mockImplementation(({ where }: { where: { id: { in: string[] } } }) => Promise.resolve(where.id.in.map((id) => ({ id, name: `Pessoa ${id}` }))));
});

describe("parâmetros", () => {
  it("teste obrigatório; mês padrão é o de hoje; limite de 1 a 50", () => {
    expect(lerParametrosDoRanking({ teste: "numeros" }, AGORA)).toEqual({ teste: "numeros", mes: "2026-11", nivel: null, limite: 10 });
    expect(lerParametrosDoRanking({ teste: "logica", mes: "2026-10", nivel: "facil", limite: "3" }, AGORA)).toEqual({ teste: "logica", mes: "2026-10", nivel: "facil", limite: 3 });
    for (const errado of [{}, { teste: "xadrez" }, { teste: "logica", mes: "2026-13" }, { teste: "logica", limite: "0" }, { teste: "logica", limite: "51" }, { teste: "logica", nivel: "extremo" }]) {
      expect(() => lerParametrosDoRanking(errado as Record<string, string>, AGORA), JSON.stringify(errado)).toThrow(ErroApi);
    }
  });
});

describe("a resposta", () => {
  it("o top N com nome, setor e números; certificado só no pódio de mês encerrado, no ranking geral", async () => {
    const r = await rankingParaApi({ tenantId: "esc-a" }, { teste: "digitacao", mes: "2026-10" }, "https://app.exemplo", AGORA);
    expect(r.ranking).toHaveLength(10);
    expect(r.participantes).toBe(15);
    expect(r.ranking[0]).toMatchObject({ posicao: 1, nome: "Pessoa u1", setor: "Fiscal", ppm: 79, precisao: 95, nivelRotulo: "Médio", certificado: true });
    expect(r.ranking.filter((l) => l.certificado).map((l) => l.posicao)).toEqual([1, 2, 3]);
    expect(r).toMatchObject({ mesEncerrado: true, premio: "Top 3 ganham chocolate", certificado: { disponivel: true, colocacoes: 3 } });
    expect(r.url).toBe("https://app.exemplo/academia/ranking?mes=2026-10&teste=digitacao");
    // Só busca o nome de quem sai na resposta.
    expect(m.pessoas.mock.calls[0][0].where.id.in).toHaveLength(10);
  });

  it("mês em andamento ou recorte por nível: sem certificado", async () => {
    const atual = await rankingParaApi({ tenantId: "esc-a" }, { teste: "digitacao" }, "https://app.exemplo", AGORA);
    expect(atual.mesEncerrado).toBe(false);
    expect(atual.ranking.some((l) => l.certificado)).toBe(false);
    const porNivel = await rankingParaApi({ tenantId: "esc-a" }, { teste: "digitacao", mes: "2026-10", nivel: "medio" }, "https://app.exemplo", AGORA);
    expect(porNivel.certificado.disponivel).toBe(false);
    expect(m.ranking).toHaveBeenLastCalledWith("esc-a", { teste: "digitacao", mes: "2026-10", nivel: "medio", setor: null });
  });
});
