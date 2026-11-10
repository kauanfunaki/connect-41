import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it, expect, vi, beforeEach } from "vitest";

// Um prisma que só anota o que foi chamado: o caminho exato conta pelo índice
// (SQL com FORCE INDEX, uma consulta por empresa), nunca trazendo 1001 linhas.
const chamadas: { metodo: string; args: unknown }[] = [];
vi.mock("@/lib/prisma", () => ({
  getPrisma: () => ({
    $queryRaw: async (partes: TemplateStringsArray, ...valores: unknown[]) => {
      const sql = partes.join("?");
      chamadas.push({ metodo: "$queryRaw", args: { sql, empresa: valores[1] } });
      if (sql.includes("GROUP BY destination")) return [{ destination: "PENDENTE", n: BigInt(750) }, { destination: "LANCADO", n: 400 }];
      return [{ n: BigInt(1200) }];
    },
    fiscalDocument: {
      findMany: async (args: { take?: number }) => (chamadas.push({ metodo: "findMany", args }), Array.from({ length: args.take ?? 0 }, (_, i) => ({ id: String(i) }))),
    },
  }),
}));

import { lerContagem, mesclarCompetencias, contagemExata, resumoDosGrupos, contarDocumentos, resumoPorDestino } from "./data";

const EMPRESA = { tipo: "EMPRESAS" as const, tenantId: "t", companyIds: ["c-1"] };
const GRUPO = { tipo: "EMPRESAS" as const, tenantId: "t", companyIds: ["c-1", "c-2"] };
const ESCRITORIO = { tipo: "TENANT" as const, tenantId: "t" };

describe("lerContagem", () => {
  it("abaixo do teto, o total é exato", () => {
    expect(lerContagem(0, 1000)).toEqual({ total: 0, limitado: false });
    expect(lerContagem(37, 1000)).toEqual({ total: 37, limitado: false });
  });

  it("exatamente no teto ainda é exato — a busca traz teto + 1 para saber se passou", () => {
    expect(lerContagem(1000, 1000)).toEqual({ total: 1000, limitado: false });
  });

  it("passou do teto: mostra o teto e avisa que há mais", () => {
    expect(lerContagem(1001, 1000)).toEqual({ total: 1000, limitado: true });
  });
});

describe("mesclarCompetencias", () => {
  it("une as empresas sem repetir o mês, do mais recente para o mais antigo", () => {
    const a = ["2026-08", "2026-07", "2026-05"];
    const b = ["2026-08", "2026-06"];
    expect(mesclarCompetencias([a, b], 36)).toEqual(["2026-08", "2026-07", "2026-06", "2026-05"]);
  });

  it("corta no limite depois de juntar, não antes", () => {
    const a = ["2026-08", "2026-06"];
    const b = ["2026-07", "2026-05"];
    expect(mesclarCompetencias([a, b], 3)).toEqual(["2026-08", "2026-07", "2026-06"]);
  });

  it("vira o ano na ordem certa — dezembro antes de janeiro seguinte, não depois", () => {
    expect(mesclarCompetencias([["2025-12"], ["2026-01"]], 36)).toEqual(["2026-01", "2025-12"]);
  });

  it("cliente sem empresa não tem competência", () => {
    expect(mesclarCompetencias([], 36)).toEqual([]);
  });
});

describe("índice forçado nas competências do portal", () => {
  it("o nome citado no FORCE INDEX é o que o schema fixa com `map:`", () => {
    const codigo = readFileSync(join(process.cwd(), "src/lib/fiscal/data.ts"), "utf8");
    const schema = readFileSync(join(process.cwd(), "prisma/schema.prisma"), "utf8");
    const citado = /FORCE INDEX \((\w+)\)/.exec(codigo)?.[1];
    expect(citado).toBeDefined();
    expect(schema).toContain(`map: "${citado}"`);
  });
});

describe("contagem exata (10/11/2026)", () => {
  beforeEach(() => { chamadas.length = 0; });

  it("é exata com alcance de empresas, sem busca por texto", () => {
    expect(contagemExata(EMPRESA, {})).toBe(true);
    expect(contagemExata(EMPRESA, { competencia: "2026-10", tipo: "NFE", destino: "PENDENTE" })).toBe(true);
    expect(contagemExata(EMPRESA, { busca: "  " })).toBe(true);
  });

  it("o escritório inteiro e a busca por texto seguem com o teto", () => {
    expect(contagemExata(ESCRITORIO, {})).toBe(false);
    expect(contagemExata(EMPRESA, { busca: "fornecedor" })).toBe(false);
  });

  it("o resumo preenche com zero o destino que o groupBy não trouxe", () => {
    expect(resumoDosGrupos([{ destination: "LANCADO", _count: { _all: 3 } }])).toEqual({
      PENDENTE: { total: 0, limitado: false },
      LANCADO: { total: 3, limitado: false },
      IGNORADO: { total: 0, limitado: false },
    });
  });

  it("conta pelo índice, empresa por empresa, e soma — passa de mil sem parar no teto", async () => {
    expect(await contarDocumentos(GRUPO, {})).toEqual({ total: 2400, limitado: false });
    expect(chamadas.map((c) => (c.args as { empresa: string }).empresa)).toEqual(["c-1", "c-2"]);
    for (const c of chamadas) expect((c.args as { sql: string }).sql).toContain("FORCE INDEX (fiscal_documents_contagem_idx)");
  });

  it("a empresa do filtro fora do alcance não é contada", async () => {
    expect(await contarDocumentos(EMPRESA, { companyId: "do-vizinho" })).toEqual({ total: 0, limitado: false });
    expect(chamadas).toEqual([]);
  });

  it("os cartões somam o GROUP BY de cada empresa e põem zero no destino que não veio", async () => {
    const resumo = await resumoPorDestino(GRUPO, {});
    expect(resumo).toEqual({
      PENDENTE: { total: 1500, limitado: false },
      LANCADO: { total: 800, limitado: false },
      IGNORADO: { total: 0, limitado: false },
    });
  });

  it("com busca por texto, volta ao teto: no máximo 1001 linhas", async () => {
    expect(await contarDocumentos(EMPRESA, { busca: "123" })).toEqual({ total: 1000, limitado: true });
    expect(chamadas).toEqual([{ metodo: "findMany", args: expect.objectContaining({ take: 1001 }) }]);
  });

  it("o índice da contagem está no schema com o nome fixado", () => {
    const schema = readFileSync(join(process.cwd(), "prisma/schema.prisma"), "utf8");
    expect(schema).toContain('@@index([tenantId, companyId, removedAtOrigin, competence, destination, situation, type], map: "fiscal_documents_contagem_idx")');
  });
});
