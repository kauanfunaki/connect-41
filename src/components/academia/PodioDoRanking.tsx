import { Crown } from "lucide-react";
import { AvatarImage } from "@/components/shared/AvatarImage";
import { Selo } from "@/components/ui/Selo";

/** Um lugar do pódio: quem, e o número já em texto ("62 PPM", "87,5%"). */
export type LugarNoPodio = {
  posicao: number;
  userId: string;
  nome: string;
  fotoUrl: string | null;
  setor: string | null;
  eu: boolean;
  valor: string;
  /** A linha de apoio embaixo do número ("96% de precisão", "4 de 4 testes"). */
  detalhe?: string;
};

// O 2º à esquerda, o 1º no meio e mais alto, o 3º à direita. A ordem do HTML
// continua 1º, 2º, 3º (é a que o leitor de tela lê); só a grade troca o lugar.
const LUGAR: Record<number, { coluna: string; degrau: string; avatar: number }> = {
  1: { coluna: "col-start-2", degrau: "h-14 sm:h-20 bg-brand-subtle text-brand", avatar: 56 },
  2: { coluna: "col-start-1", degrau: "h-10 sm:h-14 bg-surface-2 text-fg-secondary", avatar: 44 },
  3: { coluna: "col-start-3", degrau: "h-7 sm:h-10 bg-surface-2 text-fg-secondary", avatar: 44 },
};

/**
 * O pódio do ranking (melhoria-823, 25/11/2026, pedido do Kauan): o top 3 em
 * destaque acima da tabela, que segue com as 10 primeiras linhas. Os filtros
 * chamavam mais atenção que quem estava ganhando.
 */
export function PodioDoRanking({ lugares, titulo }: { lugares: LugarNoPodio[]; titulo: string }) {
  const tres = lugares.filter((l) => l.posicao >= 1 && l.posicao <= 3);
  if (tres.length === 0) return null;
  return (
    <section aria-label={titulo} className="mb-4 rounded-lg border border-border bg-surface px-3 pt-3 shadow-xs sm:px-4">
      <p className="mb-2 text-center text-helper font-medium text-fg-muted">{titulo}</p>
      <ol className="mx-auto grid max-w-2xl grid-cols-3 items-end gap-2 sm:gap-4">
        {tres.map((l) => {
          const lugar = LUGAR[l.posicao];
          return (
            <li key={l.userId} className={`row-start-1 flex min-w-0 flex-col items-center text-center ${lugar.coluna}`} aria-current={l.eu ? "true" : undefined}>
              <span className="sr-only">{l.posicao}º lugar: </span>
              {l.posicao === 1 && <Crown size={18} aria-hidden className="mb-1 text-warning-fg" />}
              <AvatarImage src={l.fotoUrl} name={l.nome} size={lugar.avatar} fontSize={l.posicao === 1 ? 18 : 15} />
              <span className="mt-1.5 flex w-full min-w-0 items-center justify-center gap-1">
                <span className={`truncate text-ui ${l.eu ? "font-semibold" : "font-medium"} text-fg`}>{l.nome}</span>
                {l.eu && <Selo tom="marca">Você</Selo>}
              </span>
              {l.setor && <span className="w-full truncate text-helper text-fg-muted">{l.setor}</span>}
              <span className={`mt-1 font-semibold tabular-nums text-fg ${l.posicao === 1 ? "text-body" : "text-ui"}`}>{l.valor}</span>
              {l.detalhe && <span className="w-full truncate text-helper text-fg-muted">{l.detalhe}</span>}
              <span aria-hidden className={`mt-2 flex w-full items-start justify-center rounded-t-md pt-1.5 text-body font-bold tabular-nums ${lugar.degrau}`}>
                {l.posicao}º
              </span>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
