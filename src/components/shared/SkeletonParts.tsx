// Peças de esqueleto de carregamento, para compor por rota.
//
// ─── Por que peças e não um componente por página ────────────────────────────
//
// O `ListPageSkeleton` cobre o formato listagem — título, subtítulo e uma
// tabela — e resolve a maioria das rotas com um import de uma linha. Sobraram
// 16 rotas que ele não serve, e a razão é sempre a mesma: elas têm barra de
// abas, faixa de métrica, filtros ou cards soltos em vez de linhas de tabela.
//
// Escrever um esqueleto sob medida para cada uma seria 16 arquivos que se
// parecem e divergem. Estas peças existem para que cada `loading.tsx` seja uma
// composição curta e legível, e para que o formato de uma rota nova saia de
// pronto em vez de ser inventado de novo.
//
// A classe `c41-skeleton` é a mesma que o `ListPageSkeleton` usa — a animação
// vive no CSS global e não é redefinida aqui.

/** Uma barra cinza. `w`/`h` são classes do Tailwind, para caber no design system. */
export function SkeletonLine({ w = "w-40", h = "h-3.5" }: { w?: string; h?: string }) {
  return <div className={`c41-skeleton ${w} ${h}`} />;
}

/**
 * Título + subtítulo, e opcionalmente o botão que mora à direita do cabeçalho.
 *
 * `acao` é largura de botão, não de texto: a página real tem um controle ali, e
 * um esqueleto que o ignora faz o conteúdo pular na hora que chega.
 */
export function SkeletonPageHeader({ comAcao = false }: { comAcao?: boolean }) {
  return (
    <div className="flex items-start justify-between gap-3 mb-5">
      <div className="space-y-2">
        <SkeletonLine w="w-44" h="h-6" />
        <SkeletonLine w="w-80" h="h-3.5" />
      </div>
      {comAcao && <SkeletonLine w="w-40" h="h-8" />}
    </div>
  );
}

/**
 * Barra de abas com a mesma borda inferior da real.
 *
 * A borda é desenhada mesmo no esqueleto porque ela é estrutura, não conteúdo:
 * sem ela o bloco inteiro sobe alguns pixels quando a página chega.
 */
export function SkeletonTabs({ abas = 2 }: { abas?: number }) {
  return (
    <div className="flex items-center gap-1 mb-5 border-b border-border">
      {Array.from({ length: abas }).map((_, i) => (
        <div key={i} className="h-9 px-3 flex items-center">
          <SkeletonLine w={i === 0 ? "w-28" : "w-24"} h="h-3.5" />
        </div>
      ))}
    </div>
  );
}

/** Faixa de métricas — os cartões de número que abrem algumas telas. */
export function SkeletonMetrics({ cartoes = 4 }: { cartoes?: number }) {
  return (
    <div className="grid gap-3 mb-5" style={{ gridTemplateColumns: `repeat(auto-fit, minmax(11rem, 1fr))` }}>
      {Array.from({ length: cartoes }).map((_, i) => (
        <div key={i} className="bg-surface border border-border rounded-lg px-4 py-3 space-y-2">
          <SkeletonLine w="w-24" h="h-3" />
          <SkeletonLine w="w-16" h="h-6" />
        </div>
      ))}
    </div>
  );
}

/** Busca + botão de filtros, no formato da `ConversasFilterBar` e similares. */
export function SkeletonFilterBar() {
  return (
    <div className="flex items-center gap-2 mb-4">
      <SkeletonLine w="w-full max-w-xs" h="h-9" />
      <SkeletonLine w="w-24" h="h-9" />
    </div>
  );
}

/**
 * Cards soltos, com respiro entre eles.
 *
 * Diferente do `ListPageSkeleton`, que desenha uma tabela com borda única: aqui
 * cada item tem borda própria, que é o formato de `/conversas`, `/bpo-senhas` e
 * companhia. Trocar um pelo outro faz o layout saltar na troca.
 */
export function SkeletonCardList({ cards = 4, linhas = 2 }: { cards?: number; linhas?: number }) {
  return (
    <div className="space-y-3">
      {Array.from({ length: cards }).map((_, i) => (
        <div key={i} className="bg-surface border border-border rounded-lg px-4 py-3 space-y-2.5">
          <div className="flex items-center justify-between gap-2">
            <SkeletonLine w="w-52" h="h-3.5" />
            <SkeletonLine w="w-20" h="h-3.5" />
          </div>
          {Array.from({ length: linhas - 1 }).map((_, j) => (
            <SkeletonLine key={j} w="w-72" h="h-3" />
          ))}
        </div>
      ))}
    </div>
  );
}
