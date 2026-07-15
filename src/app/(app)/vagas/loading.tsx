import { PageContainer } from "@/components/shared/PageContainer";

export default function LoadingVagas() {
  return (
    <PageContainer>
      <div className="flex items-center justify-between mb-6">
        <div className="space-y-2">
          <div className="c41-skeleton w-24 h-6" />
          <div className="c41-skeleton w-40 h-3.5" />
        </div>
        <div className="c41-skeleton w-32 h-9 rounded-[10px]" />
      </div>

      <div className="bg-surface border border-border rounded-2xl overflow-hidden">
        <div className="border-b border-border bg-table-header-bg h-11" />
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="flex items-center gap-6 px-4 py-3 border-b border-border last:border-0">
            <div className="c41-skeleton w-40 h-3.5" />
            <div className="c41-skeleton w-24 h-3.5" />
            <div className="c41-skeleton w-28 h-3.5" />
            <div className="c41-skeleton w-40 h-3.5 flex-1" />
          </div>
        ))}
      </div>
    </PageContainer>
  );
}
