import { describe, expect, it } from "vitest";
import { PREFERENCIAS_PADRAO, SONS, duracaoDoSom, ehSom, ganhoDoVolume, lerPreferencias, tocaSom } from "./som";

describe("o som da notificação", () => {
  it("são cinco sons, cada um com chave e nome próprios", () => {
    expect(SONS).toHaveLength(5);
    expect(new Set(SONS.map((s) => s.chave)).size).toBe(5);
    expect(new Set(SONS.map((s) => s.rotulo)).size).toBe(5);
  });

  it("todo som é curto (até 1 s) e nenhuma nota passa do volume cheio", () => {
    for (const s of SONS) {
      expect(duracaoDoSom(s.chave)).toBeLessThanOrEqual(1);
      for (const n of s.notas) expect(n.ganho).toBeLessThanOrEqual(1);
    }
  });

  it("sem nada guardado, ou com lixo, vale o padrão", () => {
    expect(lerPreferencias(null)).toEqual(PREFERENCIAS_PADRAO);
    expect(lerPreferencias("não é json")).toEqual(PREFERENCIAS_PADRAO);
    expect(lerPreferencias("[1,2]")).toEqual({ ...PREFERENCIAS_PADRAO });
  });

  it("guarda o que a pessoa escolheu e conserta o que não faz sentido", () => {
    expect(lerPreferencias(JSON.stringify({ ligado: false, som: "gota", volume: 35, noComputador: false }))).toEqual({
      ligado: false,
      som: "gota",
      volume: 35,
      noComputador: false,
    });
    const torto = lerPreferencias(JSON.stringify({ som: "buzina", volume: 250, ligado: "sim" }));
    expect(torto.som).toBe(PREFERENCIAS_PADRAO.som);
    expect(torto.volume).toBe(100);
    expect(torto.ligado).toBe(PREFERENCIAS_PADRAO.ligado);
    expect(lerPreferencias(JSON.stringify({ volume: -5 })).volume).toBe(0);
  });

  it("só toca ligado e com volume", () => {
    expect(tocaSom({ ...PREFERENCIAS_PADRAO, ligado: true, volume: 40 })).toBe(true);
    expect(tocaSom({ ...PREFERENCIAS_PADRAO, ligado: false, volume: 40 })).toBe(false);
    expect(tocaSom({ ...PREFERENCIAS_PADRAO, ligado: true, volume: 0 })).toBe(false);
  });

  it("o volume vira ganho em curva, de 0 a 1", () => {
    expect(ganhoDoVolume(0)).toBe(0);
    expect(ganhoDoVolume(100)).toBe(1);
    expect(ganhoDoVolume(50)).toBeCloseTo(0.25);
    expect(ganhoDoVolume(999)).toBe(1);
  });

  it("reconhece só as chaves dos cinco sons", () => {
    expect(ehSom("sino")).toBe(true);
    expect(ehSom("buzina")).toBe(false);
    expect(ehSom(3)).toBe(false);
  });
});
