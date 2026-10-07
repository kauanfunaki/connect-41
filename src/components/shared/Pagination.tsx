import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/Button";

type Props = {
  page: number;
  buildHref: (page: number) => string;
  /** A última página. Sem ela — contagem no teto, como no acervo fiscal —
   *  vale `temProxima`, e o texto não diz "de N". */
  totalPages?: number;
  temProxima?: boolean;
  /** Total de itens, quando a tela quer dizer "397 empresas". */
  total?: number;
  /** O total é um piso ("mais de 1.000"), não a conta exata. */
  totalAproximado?: boolean;
  /** Nome do item no plural ("empresas"), para acompanhar o total. */
  rotulo?: string;
};

const INTEIRO = new Intl.NumberFormat("pt-BR");

export function Pagination({ page, totalPages, temProxima = false, buildHref, total, totalAproximado = false, rotulo }: Props) {
  const conhecida = totalPages !== undefined;
  const haProxima = conhecida ? page < totalPages : temProxima;
  if (conhecida ? totalPages <= 1 : page <= 1 && !haProxima) return null;

  return (
    <nav className="flex flex-wrap items-center justify-between gap-3 mt-4" aria-label="Paginação">
      <span className="text-ui text-fg-muted tabular-nums">
        Página <strong className="font-semibold text-fg">{page}</strong>
        {conhecida && ` de ${totalPages}`}
        {total !== undefined && ` · ${totalAproximado ? "mais de " : ""}${INTEIRO.format(total)} ${rotulo ?? "itens"}`}
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
        {haProxima ? (
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
