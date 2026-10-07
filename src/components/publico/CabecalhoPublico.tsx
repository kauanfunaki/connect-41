import type { ReactNode } from "react";

/**
 * O topo das telas públicas — portal de vagas, conta do candidato, link de
 * admissão e link de teste (07/10/2026, auditoria DRG-28).
 *
 * Cada página montava o próprio `<header>` com o h1 em 22px cravado e o texto
 * de apoio em 13px: sete cópias iguais que podiam derivar uma a uma. O desenho
 * é o mesmo de antes, com os tamanhos nos tokens.
 *
 * - `logo`: só o portal de vagas mostra o logo do escritório. Levar o logo para
 *   os links de admissão e de teste é decisão do Kauan (DRG-29), por isso a
 *   prop é opcional e as outras telas não passam nada.
 * - `acao`: o que fica à direita do título (o "Sair" da conta do candidato).
 * - `children`: o que vem embaixo do subtítulo (as etiquetas da vaga).
 */
export function CabecalhoPublico({
  titulo,
  subtitulo,
  logo,
  acao,
  centralizado = false,
  className = "mb-6",
  children,
}: {
  titulo: ReactNode;
  subtitulo?: ReactNode;
  logo?: { src: string; alt: string } | null;
  acao?: ReactNode;
  centralizado?: boolean;
  /** O respiro em volta (padrão `mb-6`). */
  className?: string;
  children?: ReactNode;
}) {
  const texto = (
    <div className="min-w-0">
      <h1 className="text-[length:var(--fs-title)] font-semibold text-fg tracking-[-0.01em]">{titulo}</h1>
      {subtitulo && <p className="text-[length:var(--fs-ui)] text-fg-muted mt-1">{subtitulo}</p>}
      {children}
    </div>
  );

  return (
    <header
      className={`${centralizado ? "text-center" : ""} ${acao ? "flex flex-wrap items-start justify-between gap-3" : ""} ${className}`
        .replace(/\s+/g, " ")
        .trim()}
    >
      {logo && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={logo.src} alt={logo.alt} className={`h-12 mb-4 object-contain ${centralizado ? "mx-auto" : ""}`.trim()} />
      )}
      {texto}
      {acao}
    </header>
  );
}
