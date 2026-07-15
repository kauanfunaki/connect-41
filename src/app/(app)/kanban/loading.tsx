import { PageContainer } from "@/components/shared/PageContainer";

export default function LoadingKanban() {
  return (
    <PageContainer>
      <div className="flex items-center justify-between mb-6">
        <div className="space-y-2">
          <div className="c41-skeleton w-24 h-6" />
          <div className="c41-skeleton w-40 h-3.5" />
        </div>
        <div className="c41-skeleton w-32 h-9 rounded-[10px]" />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="bg-surface border border-border rounded-2xl p-4 space-y-2">
            <div className="c41-skeleton w-2/3 h-4" />
            <div className="c41-skeleton w-1/2 h-3" />
          </div>
        ))}
      </div>
    </PageContainer>
  );
}
