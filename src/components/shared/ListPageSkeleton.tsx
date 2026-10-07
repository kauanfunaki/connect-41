import { PageContainer } from "@/components/shared/PageContainer";
import { SkeletonPageHeader } from "@/components/shared/SkeletonParts";

// Skeleton genérico de página de listagem (título + subtítulo + linhas) —
// usado pelos loading.tsx das rotas principais pra navegação nunca ficar em
// tela branca. Rotas com layout muito próprio (Home, Kanban) mantêm skeletons
// específicos; este cobre o formato listagem, que é o da maioria.
//
// O cabeçalho é o `SkeletonPageHeader`, nas medidas do PageHeader (07/10/2026).
export function ListPageSkeleton({ rows = 5 }: { rows?: number }) {
  return (
    <PageContainer>
      <SkeletonPageHeader />

      <div className="bg-surface border border-border rounded-lg shadow-xs overflow-hidden">
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
