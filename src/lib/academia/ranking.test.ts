import { describe, expect, it } from "vitest";
import {
  melhorDoMes, montarRanking, posicaoDe, recorteDoRanking, resultadoEmTexto, semQuemSaiu, temCertificado, type LinhaDoResultado,
} from "./ranking";
import type { Nivel } from "./regras";

// O ranking do mês na régua do 41 Hub (10/11/2026), o recorte "top 10 + eu"
// e a saída de quem desligou "Aparecer no ranking". Pessoas fictícias.

const dig = (userId: string, nivel: Nivel, ppm: number, precisao: number, duracaoMs = 60_000): LinhaDoResultado => ({
  userId, nivel, sectorCode: "fiscal", ppm, acertos: null, total: null, precisao, duracaoMs,
});
const log = (userId: string, nivel: Nivel, acertos: number, duracaoMs: number, total = 10): LinhaDoResultado => ({
  userId, nivel, sectorCode: "bpo", ppm: null, acertos, total, precisao: (acertos / total) * 100, duracaoMs,
});

describe("digitação num nível", () => {
  it("o melhor de cada pessoa pelo PPM líquido (PPM × precisão), e a ordem por ele", () => {
    const r = montarRanking("digitacao", [
      dig("ana", "medio", 80, 60), // líquido 48
      dig("ana", "medio", 55, 95), // líquido 52,25 — é o melhor dela
      dig("bia", "medio", 60, 90), // 54
      dig("caio", "facil", 99, 99), // outro nível: fora
    ], "medio");
    expect(r.map((p) => [p.posicao, p.userId, p.ppm, p.pontos])).toEqual([
      [1, "bia", 60, 54],
      [2, "ana", 55, 52.25],
    ]);
    expect(r[1].tentativas).toBe(2);
  });

  it("empate no líquido: a maior precisão", () => {
    const r = montarRanking("digitacao", [dig("ana", "facil", 50, 80), dig("bia", "facil", 40, 100)], "facil");
    expect(r.map((p) => p.userId)).toEqual(["bia", "ana"]);
  });
});

describe("digitação em todos os níveis", () => {
  it("média ponderada (1,0 · 1,4 · 1,8) do melhor de cada nível; o nível mostrado é o mais difícil", () => {
    const r = montarRanking("numeros", [
      dig("ana", "facil", 50, 100),
      dig("ana", "dificil", 40, 90),
      dig("bia", "medio", 46, 100),
    ], null);
    // ana: (50×1 + 40×1,8) / 2,8 = 43,57 · bia: 46.
    expect(r.map((p) => [p.userId, p.ppm, p.nivel])).toEqual([
      ["bia", 46, "medio"],
      ["ana", 44, "dificil"],
    ]);
    expect(r[1].niveis).toEqual(["facil", "dificil"]);
    expect(r[1].precisao).toBe(Math.round(((100 + 90 * 1.8) / 2.8) * 10) / 10);
  });
});

describe("lógica", () => {
  it("num nível: precisão, depois menos tentativas, depois menor tempo", () => {
    const r = montarRanking("logica", [
      log("ana", "medio", 8, 120_000),
      log("ana", "medio", 8, 90_000), // mesmo acerto, mais rápido: é o melhor dela
      log("bia", "medio", 8, 150_000), // uma tentativa só: ganha da ana no desempate
      log("caio", "medio", 9, 170_000),
    ], "medio");
    expect(r.map((p) => [p.userId, p.acertos, p.tentativas, p.duracaoMs])).toEqual([
      ["caio", 9, 1, 170_000],
      ["bia", 8, 1, 150_000],
      ["ana", 8, 2, 90_000],
    ]);
  });

  it("em todos os níveis: soma ponderada (1 · 2 · 3) — tentar o difícil sempre soma", () => {
    const r = montarRanking("logica", [
      log("ana", "facil", 10, 60_000), // 100 × 1 = 100
      log("bia", "facil", 9, 60_000), // 90
      log("bia", "dificil", 5, 60_000), // + 50 × 3 = 240
    ], null);
    expect(r.map((p) => [p.userId, p.pontos, p.acertos, p.total, p.nivel])).toEqual([
      ["bia", 240, 14, 20, "dificil"],
      ["ana", 100, 10, 10, "facil"],
    ]);
  });
});

describe("o recorte da tela", () => {
  const muitos = Array.from({ length: 25 }, (_, i) => dig(`p${String(i).padStart(2, "0")}`, "medio", 100 - i, 100));
  const ranking = montarRanking("digitacao", muitos, "medio");

  it("o top 10 e a linha de quem olha, quando está abaixo — nunca o fim da lista", () => {
    const r = recorteDoRanking(ranking, "p17", 10);
    expect(r.topo.map((p) => p.posicao)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    expect(r.eu?.posicao).toBe(18);
    expect(r.participantes).toBe(25);
    // A última pessoa da lista não aparece para ninguém além dela mesma.
    expect([...r.topo, r.eu].some((p) => p?.userId === "p24")).toBe(false);
  });

  it("quem está no topo não ganha linha repetida; quem não fez nada não tem linha", () => {
    expect(recorteDoRanking(ranking, "p03", 10).eu).toBeNull();
    expect(recorteDoRanking(ranking, "ninguem", 10).eu).toBeNull();
    expect(recorteDoRanking(ranking, null, 10).eu).toBeNull();
  });
});

describe("Aparecer no ranking desligado", () => {
  it("sai antes da conta: as posições dos outros ficam seguidas", () => {
    const linhas = [dig("ana", "facil", 90, 100), dig("bia", "facil", 80, 100), dig("caio", "facil", 70, 100)];
    const r = montarRanking("digitacao", semQuemSaiu(linhas, new Set(["bia"])), "facil");
    expect(r.map((p) => [p.posicao, p.userId])).toEqual([[1, "ana"], [2, "caio"]]);
    expect(posicaoDe(r, "bia")).toBeNull();
  });

  it("sem ninguém fora, a lista passa inteira", () => {
    const linhas = [dig("ana", "facil", 90, 100)];
    expect(semQuemSaiu(linhas, new Set())).toEqual(linhas);
  });
});

describe("certificado e o melhor do mês", () => {
  const r = montarRanking("digitacao", [dig("ana", "facil", 90, 100), dig("bia", "facil", 80, 100), dig("caio", "facil", 70, 100), dig("davi", "facil", 60, 100)], null);

  it("só o pódio, e só com o mês encerrado", () => {
    expect(temCertificado(r, "caio", true)?.posicao).toBe(3);
    expect(temCertificado(r, "davi", true)).toBeNull();
    expect(temCertificado(r, "ana", false)).toBeNull();
  });

  it("o melhor do mês da pessoa e o texto dele", () => {
    const m = melhorDoMes("digitacao", [dig("ana", "facil", 80, 60), dig("ana", "medio", 55, 95)]);
    expect(m?.nivel).toBe("medio");
    expect(resultadoEmTexto("digitacao", m!)).toBe("55 PPM · 95%");
    expect(resultadoEmTexto("logica", log("ana", "facil", 8, 1)).replace(/\s/g, " ")).toBe("8 de 10 · 80%");
    expect(melhorDoMes("logica", [])).toBeNull();
  });
});

// Atalhos (Fase 2, 11/11/2026): acertos no minuto.
const ata = (userId: string, nivel: Nivel, acertos: number, total: number, duracaoMs = 60_000): LinhaDoResultado => ({
  userId, nivel, sectorCode: "dp", ppm: null, acertos, total, precisao: Math.round((acertos / total) * 10_000) / 100, duracaoMs,
});

describe("atalhos", () => {
  it("num nível, o melhor pelos acertos; empate, a precisão", () => {
    const r = montarRanking("atalhos", [ata("ana", "medio", 20, 25), ata("ana", "medio", 22, 30), ata("bia", "medio", 22, 24), ata("caio", "facil", 40, 40)], "medio");
    expect(r.map((p) => [p.posicao, p.userId, p.acertos, p.pontos])).toEqual([
      [1, "bia", 22, 22],
      [2, "ana", 22, 22],
    ]);
  });

  it("em todos os níveis, a média ponderada dos acertos (pesos da digitação)", () => {
    const [p] = montarRanking("atalhos", [ata("ana", "facil", 20, 20), ata("ana", "dificil", 10, 20)], null);
    // (20 × 1,0 + 10 × 1,8) ÷ 2,8 = 13,57
    expect(p.pontos).toBe(13.57);
    expect(p.acertos).toBe(14);
    expect(p.nivel).toBe("dificil");
  });

  it("o texto do resultado e o melhor do mês", () => {
    const m = melhorDoMes("atalhos", [ata("ana", "facil", 12, 15), ata("ana", "facil", 18, 20)]);
    expect(resultadoEmTexto("atalhos", m!)).toBe("18 acertos · 90%");
  });
});
