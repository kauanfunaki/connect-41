"use client";

import { useId } from "react";

/**
 * Os quatro estados da Lígia: `parada` (neutra), `pensando` (enquanto a
 * resposta chega), `deuCerto` (resposta ou proposta concluída) e
 * `naoConsegui` (erro).
 */
export type EstadoDaLigia = "parada" | "pensando" | "deuCerto" | "naoConsegui";

/**
 * A Lígia, assistente do Connect (decisão do Kauan, 13/10/2026 — opção "A · O
 * ponto do Connect"). O personagem sai do próprio símbolo do Connect: o anel
 * aberto vira o fone, o ponto do meio vira o rosto azul e o "nó" da direita
 * continua lá. Nome e textos em `src/lib/ia/ligia.ts`.
 *
 * Refino do esboço da página de opções: o anel e o nó seguem as proporções do
 * logo (abertura de 80°, nó com 1/5 do raio), o rosto cresceu para os olhos
 * aparecerem a 24–48 px, e sobra um vão entre rosto e anel para os dois não
 * virarem uma bola só no tamanho pequeno.
 *
 * Cores fixas de identidade, por variável (`--c41-ligia-*`, em globals.css)
 * para o anel e o nó usarem o tom do logo de fundo escuro no tema escuro —
 * contraste conferido lá. Olhos e boca são brancos nos dois temas.
 *
 * `pensando` gira o anel devagar, como um carregando feito do próprio logo;
 * com `prefers-reduced-motion`, ele fica parado e só o olhar para cima diz
 * que ela está pensando.
 *
 * Decorativa por padrão (o nome está escrito ao lado); com `rotulo`, vira
 * imagem com nome para leitor de tela.
 */
export function Ligia({
  estado = "parada",
  tamanho = 32,
  className = "",
  rotulo,
}: {
  estado?: EstadoDaLigia;
  /** Lado do quadrado, em px. */
  tamanho?: number;
  className?: string;
  /** Nome para leitor de tela, quando não há texto ao lado. */
  rotulo?: string;
}) {
  // Mais de uma Lígia na tela (botão, topo, mensagens): o id do degradê tem de
  // ser único, e sem os caracteres que o useId usa.
  const id = `ligia${useId().replace(/[^a-zA-Z0-9_-]/g, "")}`;
  const branco = "#FFFFFF";
  const traco = { fill: "none", stroke: branco, strokeWidth: 4.2, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };
  const bochecha = { fill: "var(--c41-ligia-bochecha, #9DBEFF)" };

  return (
    <svg
      viewBox="0 0 120 120"
      width={tamanho}
      height={tamanho}
      data-estado={estado}
      className={`flex-shrink-0 ${className}`.trim()}
      {...(rotulo ? { role: "img", "aria-label": rotulo } : { "aria-hidden": true, focusable: false })}
    >
      <defs>
        <linearGradient id={`${id}-anel`} x1="0" y1="1" x2="1" y2="0">
          <stop offset="0" style={{ stopColor: "var(--c41-ligia-anel-de, #1B4FD8)" }} />
          <stop offset="1" style={{ stopColor: "var(--c41-ligia-anel-ate, #4D8DFF)" }} />
        </linearGradient>
        <linearGradient id={`${id}-rosto`} x1="0" y1="1" x2="1" y2="0">
          <stop offset="0" style={{ stopColor: "var(--c41-ligia-rosto-de, #1A56DE)" }} />
          <stop offset="1" style={{ stopColor: "var(--c41-ligia-rosto-ate, #3F7FF8)" }} />
        </linearGradient>
      </defs>

      {/* O fone: o anel aberto do logo (centro 58,60, raio 45, abertura de 80°) e o nó. */}
      <g className={estado === "pensando" ? "c41-ligia-pensando" : undefined}>
        <path
          d="M 92.47 31.07 A 45 45 0 1 0 92.47 88.93"
          fill="none"
          stroke={`url(#${id}-anel)`}
          strokeWidth={11}
          strokeLinecap="round"
        />
        <circle cx={103} cy={60} r={9.5} style={{ fill: "var(--c41-ligia-no, #1F5EEA)" }} />
      </g>

      {/* O rosto: o ponto do meio do logo. */}
      <circle cx={58} cy={60} r={33} fill={`url(#${id}-rosto)`} />

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
