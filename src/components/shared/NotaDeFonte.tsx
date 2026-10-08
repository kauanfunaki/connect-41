/**
 * A nota de rodapé de uma tabela ou de um bloco: de onde vem o número, o que
 * ele inclui ("Regime de caixa…", "A projeção soma só…").
 *
 * Promovida de `dre/analises/AbasDeAnalise.tsx` (07/10/2026): as telas do BPO
 * escreviam o mesmo parágrafo 18 vezes, com respiro de 8 ou 12px conforme a
 * tela. O respiro fica em 12px; o tamanho segue o das 18 notas (11px). O ícone
 * é opcional — as Análises usam o ⓘ, as outras telas não; se todas passam a
 * usá-lo é decisão do Kauan.
 */
export function NotaDeFonte({
  children,
  icone,
  className = "",
}: {
  children: React.ReactNode;
  /** Ex.: `<Info size={12} />`. */
  icone?: React.ReactNode;
  className?: string;
}) {
  return (
    <p className={`flex items-start gap-1.5 mt-3 text-micro text-fg-muted ${className}`.trim()}>
      {icone && <span className="mt-0.5 shrink-0">{icone}</span>}
      <span>{children}</span>
    </p>
  );
}
