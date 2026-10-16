import { describe, expect, it } from "vitest";
import { DISC_DIMENSIONS, scoreDisc, type DiscAnswer, type DiscScores } from "@/lib/disc";
import { DISC_BANK, TOTAL_BLOCKS, type DiscDimension } from "@/lib/discBank";
import {
  EXPLICACOES_DO_DISC,
  codigoDoPerfil,
  duasMaisFortes,
  explicacaoDoPerfil,
  nomeDoPerfil,
  pontoNoEixo,
  pontosDaTeia,
  pontosDoPoligono,
  rotuloDaTeia,
} from "./discExplicado";

/** Notas de exemplo — as do desenho aprovado (perfil SI). */
function notas(d: number, i: number, s: number, c: number): DiscScores {
  const n = (pct: number) => ({ mais: 0, menos: 0, net: 0, pct });
  return { D: n(d), I: n(i), S: n(s), C: n(c) };
}

const TEIA = { cx: 130, cy: 110, raio: 80 };

describe("a teia — os pontos em escala", () => {
  it("bate com o desenho aprovado: D 29%, I 67%, S 71%, C 33%", () => {
    expect(pontosDaTeia(notas(29, 67, 71, 33), TEIA)).toEqual([
      { dim: "D", x: 130, y: 86.8 },
      { dim: "I", x: 183.6, y: 110 },
      { dim: "S", x: 130, y: 166.8 },
      { dim: "C", x: 103.6, y: 110 },
    ]);
  });

  it("0% é o centro, 100% é a ponta, 50% é o meio do eixo", () => {
    const [d, i, s, c] = pontosDaTeia(notas(0, 100, 50, 100), TEIA);
    expect([d.x, d.y]).toEqual([130, 110]);
    expect([i.x, i.y]).toEqual([210, 110]);
    expect([s.x, s.y]).toEqual([130, 150]);
    expect([c.x, c.y]).toEqual([50, 110]);
  });

  it("a grade de 100% é o losango das pontas", () => {
    const losango = pontosDoPoligono(DISC_DIMENSIONS.map((d) => pontoNoEixo(d, 1, TEIA)));
    expect(losango).toBe("130,30 210,110 130,190 50,110");
  });

  it("nota fora de 0–100 (dado estragado) não sai do desenho", () => {
    const [d] = pontosDaTeia(notas(140, 0, 0, 0), TEIA);
    expect(d.y).toBe(30);
    const [d2] = pontosDaTeia(notas(-20, 0, 0, 0), TEIA);
    expect(d2.y).toBe(110);
  });

  it("o leitor de tela ouve as quatro notas, com o nome de cada letra", () => {
    expect(rotuloDaTeia(notas(29, 67, 71, 33))).toBe(
      "Gráfico de teia do DISC: Dominância 29%, Influência 67%, Estabilidade 71%, Conformidade 33%."
    );
  });
});

describe("as barras em destaque", () => {
  it("são as duas notas mais altas", () => {
    expect(duasMaisFortes(notas(29, 67, 71, 33))).toEqual(["S", "I"]);
  });

  it("empate desempata na ordem D, I, S, C — como o scoreDisc", () => {
    expect(duasMaisFortes(notas(50, 50, 50, 50))).toEqual(["D", "I"]);
    expect(duasMaisFortes(notas(10, 60, 30, 60))).toEqual(["I", "C"]);
  });
});

describe("o perfil explicado", () => {
  it("nome e código do perfil", () => {
    expect(codigoDoPerfil("S", "I")).toBe("SI");
    expect(codigoDoPerfil("D", null)).toBe("D");
    expect(nomeDoPerfil("S", "I")).toBe("Estabilidade / Influência");
    expect(nomeDoPerfil("C", null)).toBe("Conformidade");
  });

  it("os 16 perfis que o teste pode dar têm texto próprio: resumo, pontos fortes e de atenção", () => {
    const codigos: string[] = [];
    for (const p of DISC_DIMENSIONS) {
      codigos.push(p);
      for (const s of DISC_DIMENSIONS) if (s !== p) codigos.push(p + s);
    }
    expect(codigos).toHaveLength(16);
    expect(Object.keys(EXPLICACOES_DO_DISC).sort()).toEqual([...codigos].sort());
    for (const c of codigos) {
      const e = EXPLICACOES_DO_DISC[c];
      expect(e.resumo.length, c).toBeGreaterThan(30);
      expect(e.pontosFortes.length, c).toBeGreaterThanOrEqual(2);
      expect(e.pontosDeAtencao.length, c).toBeGreaterThanOrEqual(2);
    }
  });

  it("todo perfil que o scoreDisc devolve acha o texto dele — sem cair no da letra", () => {
    // Respostas sorteadas (gerador fixo, o teste não muda de uma rodada para a outra).
    let semente = 41;
    const sorteio = (n: number) => {
      semente = (Math.imul(semente, 1664525) + 1013904223) >>> 0;
      return (semente >>> 8) % n;
    };
    const vistos = new Set<string>();
    for (let rodada = 0; rodada < 3000; rodada++) {
      // Cada rodada puxa para uma ou duas letras, para cobrir os perfis combinados.
      const preferida = DISC_DIMENSIONS[sorteio(4)];
      const respostas: DiscAnswer[] = Array.from({ length: TOTAL_BLOCKS }, (_, block) => {
        const indiceDe = (dim: DiscDimension) => DISC_BANK[block].findIndex((w) => w.dim === dim);
        const mais = sorteio(3) === 0 ? indiceDe(preferida) : sorteio(4);
        let menos = sorteio(4);
        if (menos === mais) menos = (menos + 1) % 4;
        return { block, maisIndex: mais, menosIndex: menos };
      });
      const r = scoreDisc(respostas);
      const codigo = codigoDoPerfil(r.primaryProfile, r.secondaryProfile);
      vistos.add(codigo);
      expect(EXPLICACOES_DO_DISC[codigo], codigo).toBeDefined();
      expect(explicacaoDoPerfil(r.primaryProfile, r.secondaryProfile)).toBe(EXPLICACOES_DO_DISC[codigo]);
    }
    // O sorteio passou pelos perfis de uma letra e pelos combinados.
    expect(vistos.size).toBeGreaterThan(10);
  });

  it("código fora da lista (dado antigo) cai no texto da letra principal", () => {
    expect(explicacaoDoPerfil("D", "D" as DiscDimension)).toBe(EXPLICACOES_DO_DISC.D);
  });
});
