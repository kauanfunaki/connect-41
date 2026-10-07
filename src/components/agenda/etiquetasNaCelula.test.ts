import { describe, it, expect } from "vitest";
import { etiquetasQueCabem, ALTURA_DO_CABECALHO, ALTURA_DA_ETIQUETA, VAO_ENTRE_ETIQUETAS, ALTURA_DO_MAIS } from "./etiquetasNaCelula";

const passo = ALTURA_DA_ETIQUETA + VAO_ENTRE_ETIQUETAS;
/** A altura de célula em que cabem exatamente `n` etiquetas, sem o "+N". */
const celulaPara = (n: number) => ALTURA_DO_CABECALHO + n * passo - VAO_ENTRE_ETIQUETAS;

describe("etiquetasQueCabem", () => {
  it("mostra todas quando cabem", () => {
    expect(etiquetasQueCabem(celulaPara(3), 3)).toBe(3);
    expect(etiquetasQueCabem(celulaPara(3), 1)).toBe(1);
  });

  it("quando não cabem todas, reserva a linha do +N mais", () => {
    // Cabem 3 justas; com 5 no dia, sobram 2 etiquetas e o "+3 mais".
    const n = etiquetasQueCabem(celulaPara(3), 5);
    expect(n).toBe(2);
    expect(ALTURA_DO_CABECALHO + n * passo + ALTURA_DO_MAIS).toBeLessThanOrEqual(celulaPara(3));
  });

  it("a célula de 1600×900 (uns 105px) não corta a 3ª etiqueta", () => {
    expect(etiquetasQueCabem(105, 4)).toBe(1);
    expect(etiquetasQueCabem(105, 2)).toBe(2);
  });

  it("célula baixa demais mostra só o +N mais", () => {
    expect(etiquetasQueCabem(50, 3)).toBe(0);
  });

  it("antes de medir, mostra até duas", () => {
    expect(etiquetasQueCabem(null, 5)).toBe(2);
    expect(etiquetasQueCabem(null, 1)).toBe(1);
  });
});
