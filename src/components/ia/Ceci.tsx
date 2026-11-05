"use client";

import { useId } from "react";

/**
 * Os quatro estados da Ceci: `parada` (neutra), `pensando` (enquanto a
 * resposta chega), `deuCerto` (resposta ou proposta concluída) e
 * `naoConsegui` (erro).
 */
export type EstadoDaCeci = "parada" | "pensando" | "deuCerto" | "naoConsegui";

/**
 * A Ceci, assistente do Connect (decisão do Kauan, 13/10/2026 — opção "A · O
 * ponto do Connect"). O personagem sai do próprio símbolo do Connect: o anel
 * aberto vira o fone, o ponto do meio vira o rosto azul e o "nó" da direita
 * continua lá. Nome e textos em `src/lib/ia/ceci.ts`.
 *
 * Refino do esboço da página de opções: o anel e o nó seguem as proporções do
 * logo (abertura de 80°, nó com 1/5 do raio), o rosto cresceu para os olhos
 * aparecerem a 24–48 px, e sobra um vão entre rosto e anel para os dois não
 * virarem uma bola só no tamanho pequeno.
 *
 * Cores fixas de identidade, por variável (`--c41-ceci-*`, em globals.css)
 * para o anel e o nó usarem o tom do logo de fundo escuro no tema escuro —
 * contraste conferido lá. Olhos e boca são brancos nos dois temas.
 *
 * `pensando` gira o anel devagar, como um carregando feito do próprio logo;
 * com `prefers-reduced-motion`, ele fica parado e só o olhar para cima diz
 * que ela está pensando.
 *
 * Decorativa por padrão (o nome está escrito ao lado, ou no `aria-label` do
 * botão que a leva, como o do canto); com `rotulo`, vira imagem com nome para
 * leitor de tela.
 */
export function Ceci({
  estado = "parada",
  tamanho = 32,
  className = "",
  rotulo,
  sombra = false,
}: {
  estado?: EstadoDaCeci;
  /** Lado do quadrado, em px. */
  tamanho?: number;
  className?: string;
  /** Nome para leitor de tela, quando não há texto ao lado. */
  rotulo?: string;
  /**
   * A sombra do botão do canto, que flutua sobre a página (contraste sobre
   * azul, ver globals.css). Só do lado de fora do desenho: o vão entre o rosto
   * e o anel fica limpo.
   */
  sombra?: boolean;
}) {
  // Mais de uma Ceci na tela (botão, topo, mensagens): o id do degradê tem de
  // ser único, e sem os caracteres que o useId usa.
  const id = `ceci${useId().replace(/[^a-zA-Z0-9_-]/g, "")}`;
  const branco = "#FFFFFF";
  const traco = { fill: "none", stroke: branco, strokeWidth: 4.2, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };
  const bochecha = { fill: "var(--c41-ceci-bochecha, #9DBEFF)" };

  // O anel e o rosto, sem a expressão. Desenhados uma segunda vez, por baixo,
  // só para gerar a sombra (com a mesma animação, ficam em compasso).
  const corpo = (
    <>
      {/* O fone: o anel aberto do logo (centro 58,60, raio 45, abertura de 80°) e o nó. */}
      <g className={estado === "pensando" ? "c41-ceci-pensando" : undefined}>
        <path
          d="M 92.47 31.07 A 45 45 0 1 0 92.47 88.93"
          fill="none"
          stroke={`url(#${id}-anel)`}
          strokeWidth={11}
          strokeLinecap="round"
        />
        <circle cx={103} cy={60} r={9.5} style={{ fill: "var(--c41-ceci-no, #1F5EEA)" }} />
      </g>

      {/* O rosto: o ponto do meio do logo. */}
      <circle cx={58} cy={60} r={33} fill={`url(#${id}-rosto)`} />
    </>
  );

  return (
    <svg
      viewBox="0 0 120 120"
      width={tamanho}
      height={tamanho}
      data-estado={estado}
      className={`flex-shrink-0 ${className}`.trim()}
      // A sombra passa da borda do quadrado; sem isto, sai cortada embaixo.
      overflow={sombra ? "visible" : undefined}
      {...(rotulo ? { role: "img", "aria-label": rotulo } : { "aria-hidden": true, focusable: false })}
    >
      <defs>
        <linearGradient id={`${id}-anel`} x1="0" y1="1" x2="1" y2="0">
          <stop offset="0" style={{ stopColor: "var(--c41-ceci-anel-de, #1B4FD8)" }} />
          <stop offset="1" style={{ stopColor: "var(--c41-ceci-anel-ate, #4D8DFF)" }} />
        </linearGradient>
        <linearGradient id={`${id}-rosto`} x1="0" y1="1" x2="1" y2="0">
          <stop offset="0" style={{ stopColor: "var(--c41-ceci-rosto-de, #1A56DE)" }} />
          <stop offset="1" style={{ stopColor: "var(--c41-ceci-rosto-ate, #3F7FF8)" }} />
        </linearGradient>
        {sombra && (
          <>
            {/* As duas sombras de antes (1px/1,5px e 3px/8px no botão de 48 px),
                em unidades do viewBox (2,5 por px). Só a sombra sai do filtro. */}
            <filter id={`${id}-sombra`} filterUnits="userSpaceOnUse" x={-30} y={-30} width={180} height={190} colorInterpolationFilters="sRGB">
              <feGaussianBlur in="SourceAlpha" stdDeviation={1.9} result="perto" />
              <feOffset in="perto" dy={2.5} result="pertoDesce" />
              <feFlood style={{ floodColor: "var(--c41-ceci-sombra-perto, rgba(15,26,51,.28))" }} result="corPerto" />
              <feComposite in="corPerto" in2="pertoDesce" operator="in" result="sombraPerto" />
              <feGaussianBlur in="SourceAlpha" stdDeviation={10} result="longe" />
              <feOffset in="longe" dy={7.5} result="longeDesce" />
              <feFlood style={{ floodColor: "var(--c41-ceci-sombra-longe, rgba(15,26,51,.16))" }} result="corLonge" />
              <feComposite in="corLonge" in2="longeDesce" operator="in" result="sombraLonge" />
              <feMerge>
                <feMergeNode in="sombraLonge" />
                <feMergeNode in="sombraPerto" />
              </feMerge>
            </filter>
            {/* Do rosto até a borda de dentro do anel (raio 39,5) não há
                sombra: era a sombra do rosto caindo no vão que desenhava uma
                faixa cinza em volta da carinha, cortada na abertura do anel
                (05/11/2026). Assim o vão fica claro e fechado, da mesma
                largura em toda a volta. */}
            <mask id={`${id}-fora`} maskUnits="userSpaceOnUse" x={-30} y={-30} width={180} height={190}>
              <rect x={-30} y={-30} width={180} height={190} fill={branco} />
              <circle cx={58} cy={60} r={39.5} fill="#000000" />
            </mask>
          </>
        )}
      </defs>

      {sombra && <g filter={`url(#${id}-sombra)`} mask={`url(#${id}-fora)`}>{corpo}</g>}
      {corpo}

      {estado === "parada" && (
        <>
          <ellipse cx={47.5} cy={55} rx={4.6} ry={6} fill={branco} />
          <ellipse cx={68.5} cy={55} rx={4.6} ry={6} fill={branco} />
          <path d="M 48 68.5 Q 58 77.5 68 68.5" {...traco} />
          <circle cx={39.5} cy={66} r={3.6} opacity={0.75} {...bochecha} />
          <circle cx={76.5} cy={66} r={3.6} opacity={0.75} {...bochecha} />
        </>
      )}

      {estado === "pensando" && (
        <>
          {/* Olhar para cima e para o lado, boca de lado de quem está conferindo. */}
          <ellipse cx={51} cy={49} rx={4.4} ry={5.6} fill={branco} />
          <ellipse cx={71.5} cy={49} rx={4.4} ry={5.6} fill={branco} />
          <path d="M 52 72.5 L 65 69" {...traco} />
          <circle cx={39.5} cy={64} r={3.4} opacity={0.5} {...bochecha} />
          <circle cx={76.5} cy={64} r={3.4} opacity={0.5} {...bochecha} />
        </>
      )}

      {estado === "deuCerto" && (
        <>
          {/* Olhos fechados de feliz e o sorriso aberto. */}
          <path d="M 42.5 56 Q 47.5 49.5 52.5 56" {...traco} />
          <path d="M 63.5 56 Q 68.5 49.5 73.5 56" {...traco} />
          <path d="M 46 66 Q 58 83 70 66 Z" fill={branco} stroke={branco} strokeWidth={2} strokeLinejoin="round" />
          <circle cx={39} cy={64} r={3.8} opacity={0.9} {...bochecha} />
          <circle cx={77} cy={64} r={3.8} opacity={0.9} {...bochecha} />
        </>
      )}

      {estado === "naoConsegui" && (
        <>
          {/* Preocupada: sobrancelhas subindo no meio e a boca para baixo. */}
          <path d="M 40 47.5 L 51 43.5" {...traco} strokeWidth={3.6} />
          <path d="M 65 43.5 L 76 47.5" {...traco} strokeWidth={3.6} />
          <ellipse cx={47.5} cy={56} rx={4.2} ry={5.4} fill={branco} />
          <ellipse cx={68.5} cy={56} rx={4.2} ry={5.4} fill={branco} />
          <path d="M 49 74 Q 58 67 67 74" {...traco} />
        </>
      )}
    </svg>
  );
}
