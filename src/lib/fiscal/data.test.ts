import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it, expect } from "vitest";
import { lerContagem, mesclarCompetencias } from "./data";

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
