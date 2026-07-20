import { PageContainer } from "@/components/shared/PageContainer";

// Skeleton genérico de página de listagem (título + subtítulo + linhas) —
// usado pelos loading.tsx das rotas principais pra navegação nunca ficar em
// tela branca. Rotas com layout muito próprio (Home, Kanban) mantêm skeletons
// específicos; este cobre o formato listagem, que é o da maioria.
export function ListPageSkeleton({ rows = 5 }: { rows?: number }) {
  return (
    <PageContainer>
      <div className="mb-6 space-y-2">
        <div className="c41-skeleton w-44 h-6" />
        <div className="c41-skeleton w-72 h-3.5" />
      </div>

      <div className="bg-surface border border-border rounded-2xl overflow-hidden">
        {Array.from({ length: rows }).map((_, i) => (
          <div key={i} className="flex items-center gap-6 px-4 py-4 border-b border-border last:border-0">
            <div className="c41-skeleton w-44 h-3.5" />
            <div className="c41-skeleton w-28 h-3.5" />
            <div className="c41-skeleton w-40 h-3.5 flex-1" />
            <div className="c41-skeleton w-20 h-3.5" />
          </div>
        ))}
      </div>
    </PageContainer>
  );
}
