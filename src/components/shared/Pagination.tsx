import Link from "next/link";

type Props = {
  page: number;
  totalPages: number;
  buildHref: (page: number) => string;
};

// Paginação simples (anterior/próxima + "Página X de Y") — mesmo padrão já
// usado em Empresas e Auditoria, agora numa fonte só.
export function Pagination({ page, totalPages, buildHref }: Props) {
  if (totalPages <= 1) return null;

  return (
    <div className="flex items-center justify-between mt-4">
      <span className="text-[12px] text-fg-muted">
        Página {page} de {totalPages}
      </span>
      <div className="flex gap-1">
        {page > 1 && (
          <Link
            href={buildHref(page - 1)}
            className="h-8 px-3 rounded-md text-[12px] text-fg-muted hover:bg-surface-2 hover:text-fg transition-colors flex items-center"
          >
            ← Anterior
          </Link>
        )}
        {page < totalPages && (
          <Link
            href={buildHref(page + 1)}
            className="h-8 px-3 rounded-md text-[12px] text-fg-muted hover:bg-surface-2 hover:text-fg transition-colors flex items-center"
          >
            Próxima →
          </Link>
        )}
      </div>
    </div>
  );
}
