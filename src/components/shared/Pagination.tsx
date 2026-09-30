import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/Button";

type Props = {
  page: number;
  totalPages: number;
  buildHref: (page: number) => string;
  /** Total de itens, quando a tela quer dizer "de 397". */
  total?: number;
  /** Nome do item no plural ("empresas"), para acompanhar o total. */
  rotulo?: string;
};

// Paginação simples (anterior/próxima + "Página X de Y"), numa fonte só.
//
// Desde o polimento de 30/09, anterior e próxima são botões — eram texto
// cinza sem caixa, que a regra "botão não é link" da conferência do BPO
// reprovou. Empresas, Pessoas e Clientes tinham cada uma a sua cópia; agora
// usam esta.
export function Pagination({ page, totalPages, buildHref, total, rotulo }: Props) {
  if (totalPages <= 1) return null;

  return (
    <nav className="flex flex-wrap items-center justify-between gap-3 mt-4" aria-label="Paginação">
      <span className="text-[length:var(--fs-ui)] text-fg-muted tabular-nums">
        Página <strong className="font-semibold text-fg">{page}</strong> de {totalPages}
        {total !== undefined && ` · ${total} ${rotulo ?? "itens"}`}
      </span>
      <div className="flex gap-1.5">
        {page > 1 ? (
          <Button href={buildHref(page - 1)} variant="secondary" size="sm">
            <ChevronLeft size={14} /> Anterior
          </Button>
        ) : (
          <Button variant="secondary" size="sm" disabled>
            <ChevronLeft size={14} /> Anterior
          </Button>
        )}
        {page < totalPages ? (
          <Button href={buildHref(page + 1)} variant="secondary" size="sm">
            Próxima <ChevronRight size={14} />
          </Button>
        ) : (
          <Button variant="secondary" size="sm" disabled>
            Próxima <ChevronRight size={14} />
          </Button>
        )}
      </div>
    </nav>
  );
}
