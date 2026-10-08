/**
 * O título de uma seção solta numa tela do portal: o `h2` fora de cartão, com o
 * cartão, a tabela ou a lista logo embaixo.
 *
 * Padrão aceito na página de decisões (08/10/2026): títulos de seção iguais
 * entre as telas do portal. O Início usava `text-section` (18px, Space
 * Grotesk) e Cobrança, Fluxo de caixa e o detalhe do processo usavam
 * `text-card-title` (14px), que é o tamanho de título *de cartão*. Ficou o do
 * Início, com o mesmo respiro (12px) até o que vem embaixo.
 */
export function TituloDeSecao({
  id,
  className = "",
  children,
}: {
  /** Para a seção apontar para ele (`aria-labelledby`). */
  id?: string;
  /** Respiro acima, quando a seção não está numa pilha com `gap`. */
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <h2 id={id} className={`mb-3 font-display text-section font-semibold text-fg leading-tight ${className}`.trim()}>
      {children}
    </h2>
  );
}
