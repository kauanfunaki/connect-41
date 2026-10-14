import type { CSSProperties } from "react";

// O desenho do 41 Carreiras: triângulos equiláteros (60°), o mesmo ângulo do
// logo da 41 Tallent — sem redesenhar o logo. Só decoração: escondidos do
// leitor de tela.

const atraso = (ms: number, comprimento?: number) => ({ "--atraso": `${ms}ms`, ...(comprimento ? { "--comprimento": comprimento } : {}) }) as CSSProperties;

/** A composição da capa: três contornos concêntricos e dois triângulos cheios, que se desenham na entrada. */
export function ArteDaCapa() {
  return (
    <svg viewBox="0 0 600 520" aria-hidden="true" focusable="false" preserveAspectRatio="xMidYMid meet">
      <polygon className="t41-traco t41-desenha" strokeWidth="1.5" points="300,0 600,519.6 0,519.6" style={atraso(250, 1800)} />
      <polygon className="t41-traco t41-desenha" strokeWidth="1.5" points="300,97 516,471.1 84,471.1" style={atraso(420, 1300)} opacity="0.75" />
      <polygon className="t41-traco t41-desenha" strokeWidth="1.5" points="300,194 432,422.6 168,422.6" style={atraso(590, 800)} opacity="0.5" />
      <polygon className="t41-surge" points="476,36 524,119 428,119" fill="#d090ff" style={atraso(900)} />
      <polygon className="t41-surge" points="92,330 190,500 -6,500" fill="#22033f" style={atraso(1000)} />
      <polygon className="t41-surge" points="300,262 330,314 270,314" fill="#ebd3ff" style={atraso(1100)} />
    </svg>
  );
}

/** O triângulo das faixas roxas das páginas internas, cortado pela borda. */
export function TrianguloDaFaixa() {
  return (
    <svg className="t41-faixa__triangulo" viewBox="0 0 340 295" aria-hidden="true" focusable="false">
      <polygon className="t41-traco" strokeWidth="1.5" points="170,1 339,294 1,294" opacity="0.7" />
      <polygon className="t41-traco" strokeWidth="1.5" points="170,80 293,294 47,294" opacity="0.4" />
      <polygon points="262,30 290,79 234,79" fill="#d090ff" />
    </svg>
  );
}

/** O triângulo grande, em contorno roxo, da faixa lilás. */
export function TrianguloDaFaixaLilas() {
  return (
    <svg className="t41-faixa-lilas__arte" viewBox="0 0 360 312" aria-hidden="true" focusable="false">
      <polygon points="180,1 359,311 1,311" fill="none" stroke="#3b0670" strokeWidth="1.5" opacity="0.5" />
      <polygon points="180,90 307,311 53,311" fill="none" stroke="#3b0670" strokeWidth="1.5" opacity="0.3" />
      <polygon points="180,190 236,287 124,287" fill="#ebd3ff" />
    </svg>
  );
}

/** Um triângulo de contorno, para os vazios ("nenhuma vaga"). */
export function TrianguloVazio() {
  return (
    <svg width="56" height="49" viewBox="0 0 56 49" aria-hidden="true" focusable="false">
      <polygon points="28,1.5 54.5,47.5 1.5,47.5" fill="none" stroke="#3b0670" strokeWidth="2" />
      <polygon points="28,20 38,37.5 18,37.5" fill="#d090ff" />
    </svg>
  );
}
