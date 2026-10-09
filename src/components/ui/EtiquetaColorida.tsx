/**
 * Etiqueta com a cor escolhida pelo escritório — as etiquetas dos candidatos e
 * das tarefas do Kanban (08/10/2026). É categoria, então tem o desenho do
 * `Badge` (escolha 2A do Kauan: situação = Selo, categoria = Badge); a
 * diferença é a cor, que vem do banco e não da paleta.
 *
 * Era um `<span>` montado à mão em cinco telas, com a cor crua na letra: um
 * amarelo-claro sumia no fundo branco. Aqui a letra é a cor misturada com o
 * texto do tema — escurece no claro e clareia no escuro —, e o fundo e a borda
 * são a cor bem diluída.
 */
export function EtiquetaColorida({
  cor,
  children,
  className = "",
}: {
  /** A cor gravada na etiqueta ("#RRGGBB"). */
  cor: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <span
      className={`inline-flex max-w-full items-center whitespace-nowrap rounded-full border px-2.5 py-[3px] text-badge font-semibold leading-4 ${className}`.trim()}
      style={{
        color: `color-mix(in oklab, ${cor} 62%, var(--c41-fg))`,
        background: `color-mix(in oklab, ${cor} 12%, transparent)`,
        borderColor: `color-mix(in oklab, ${cor} 35%, transparent)`,
      }}
    >
      <span className="truncate">{children}</span>
    </span>
  );
}
