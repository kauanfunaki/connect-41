import { PageContainer } from "@/components/shared/PageContainer";

// Skeleton exibido enquanto a ficha da empresa (várias queries) carrega —
// mesmo PageContainer (wide) da página real, senão a troca skeleton ->
// conteúdo pula de largura.
export default function LoadingEmpresa() {
  return (
    <PageContainer>
      <div className="animate-pulse">
        <div className="h-4 w-24 bg-surface-2 rounded mb-5" />

        <div className="flex items-center gap-3 mb-6">
          <div className="h-12 w-12 bg-surface-2 rounded-lg" />
          <div className="space-y-2">
            <div className="h-5 w-56 bg-surface-2 rounded" />
            <div className="h-3.5 w-40 bg-surface-2 rounded" />
          </div>
        </div>

        <div className="flex items-center gap-4 mb-6 border-b border-border pb-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="h-3.5 w-20 bg-surface-2 rounded" />
          ))}
        </div>

        {[0, 1, 2].map((i) => (
          <div key={i} className="bg-surface border border-border rounded-lg p-5 mb-4">
            <div className="h-4 w-32 bg-surface-2 rounded mb-4" />
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-3">
              {[0, 1, 2, 3].map((j) => (
                <div key={j}>
                  <div className="h-2.5 w-20 bg-surface-2 rounded mb-2" />
                  <div className="h-3.5 w-36 bg-surface-2 rounded" />
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </PageContainer>
  );
}
