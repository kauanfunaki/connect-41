import { Card } from "@/components/ui/Card";

/**
 * O item de lista que abre o detalhe, no portal (07/10/2026): Solicitações,
 * Comunicados, Processos, Exigências e os cartões de Pendências no celular.
 *
 * Eram quatro desenhos para a mesma coisa — o cartão inteiro como link em
 * Solicitações e Comunicados, só o título clicável em Processos e em
 * Pendências, e tamanhos de 12, 12,5, 13, 14 e 15px. No celular o alvo ia de
 * "o cartão" a "uma linha de texto". Agora o cartão inteiro é o alvo, com o
 * hover do `Card` com `href`; título em `text-card-title` e o apoio em
 * `text-ui`, os papéis da escala.
 */
export function CartaoDeLista({
  href,
  titulo,
  sobretitulo,
  corpo,
  apoio,
  selos,
  destaque = false,
}: {
  href: string;
  titulo: React.ReactNode;
  /** A linha em caixa alta acima do título: o número da solicitação, o órgão da exigência. */
  sobretitulo?: React.ReactNode;
  /** Texto do item, entre o título e o apoio (a descrição da exigência). */
  corpo?: React.ReactNode;
  /** As linhas de apoio: empresa, datas, prazo. Cada filho direto vira uma linha. */
  apoio?: React.ReactNode;
  /** Selos à direita no computador; descem para baixo do texto no celular. */
  selos?: React.ReactNode;
  /** Item novo, ainda não aberto (comunicado não lido): o fundo e a borda da marca. */
  destaque?: boolean;
}) {
  return (
    // `!` no destaque: as cores dele trocam as do próprio Card (`bg-surface
    // border-border`), e entre duas classes do mesmo tipo quem ganha é a ordem
    // do CSS, não a do atributo.
    <Card href={href} className={`p-4 ${destaque ? "border-brand/40! bg-brand-subtle!" : ""}`}>
      <span className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
        <span className="min-w-0 flex-1 basis-64">
          {sobretitulo && <span className="block c41-rotulo tabular-nums">{sobretitulo}</span>}
          <span className={`block text-card-title font-semibold text-fg break-words ${sobretitulo ? "mt-0.5" : ""}`}>{titulo}</span>
          {corpo && <span className="mt-1 block text-ui text-fg whitespace-pre-line break-words">{corpo}</span>}
          {apoio && <span className="mt-1 flex flex-col gap-0.5 text-ui text-fg-muted break-words">{apoio}</span>}
        </span>
        {selos && <span className="flex flex-wrap items-center gap-1.5">{selos}</span>}
      </span>
    </Card>
  );
}
