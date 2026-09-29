import Link from "next/link";

/** Chips de setor. "Todos" some quando a pessoa só enxerga um setor. */
export function FiltroDeSetor({
  base,
  setores,
  ativo,
}: {
  base: string;
  setores: { value: string; label: string }[];
  ativo: string | null;
}) {
  if (setores.length <= 1) return null;
  const chip = (ligado: boolean) =>
    `inline-flex items-center h-8 px-3 rounded-md text-[12px] font-medium transition-colors ${
      ligado ? "bg-surface-2 text-fg border border-border-strong" : "text-fg-muted hover:text-fg hover:bg-surface-2"
    }`;
  return (
    <div className="flex flex-wrap items-center gap-1" role="group" aria-label="Filtrar por setor">
      <Link href={base} aria-current={!ativo ? "true" : undefined} className={chip(!ativo)}>
        Todos os setores
      </Link>
      {setores.map((s) => (
        <Link
          key={s.value}
          href={`${base}?setor=${encodeURIComponent(s.value)}`}
          aria-current={ativo === s.value ? "true" : undefined}
          className={chip(ativo === s.value)}
        >
          {s.label}
        </Link>
      ))}
    </div>
  );
}
