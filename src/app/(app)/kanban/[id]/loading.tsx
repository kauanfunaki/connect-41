import { PageContainer } from "@/components/shared/PageContainer";

// Skeleton próprio do board — evita herdar o loading.tsx de /kanban (grade de
// Listas), que não bate com o layout do board e causava um flash visual.
export default function LoadingKanbanBoard() {
  return (
    <PageContainer className="h-full flex flex-col">
      <div className="flex items-center gap-2 mb-1">
        <div className="c41-skeleton w-16 h-3.5" />
        <span className="text-fg-muted">/</span>
        <div className="c41-skeleton w-20 h-3.5" />
        <span className="text-fg-muted">/</span>
        <div className="c41-skeleton w-24 h-3.5" />
      </div>

      <div className="flex items-center justify-between mb-6 mt-1">
        <div className="space-y-2">
          <div className="c41-skeleton w-40 h-6" />
          <div className="c41-skeleton w-28 h-3.5" />
        </div>
        <div className="c41-skeleton w-32 h-9 rounded-[10px]" />
      </div>

      <div className="flex-1 min-h-0 bg-surface border border-border rounded-2xl p-2 space-y-2">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="flex items-center gap-2 px-2 py-2">
            <div className="c41-skeleton w-[7px] h-[7px] rounded-full" />
            <div className="c41-skeleton h-4 flex-1 max-w-xs" />
          </div>
        ))}
      </div>
    </PageContainer>
  );
}
