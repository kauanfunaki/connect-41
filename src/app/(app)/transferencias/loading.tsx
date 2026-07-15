import { PageContainer } from "@/components/shared/PageContainer";

export default function LoadingTransferencias() {
  return (
    <PageContainer>
      <div className="mb-6 space-y-2">
        <div className="c41-skeleton w-40 h-6" />
        <div className="c41-skeleton w-64 h-3.5" />
      </div>

      <div className="flex items-center gap-4 mb-4 border-b border-border pb-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="c41-skeleton w-24 h-3.5" />
        ))}
      </div>

      <div className="bg-surface border border-border rounded-2xl overflow-hidden">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="flex items-center gap-6 px-4 py-4 border-b border-border last:border-0">
            <div className="c41-skeleton w-40 h-3.5" />
            <div className="c41-skeleton w-28 h-3.5" />
            <div className="c41-skeleton w-40 h-3.5 flex-1" />
          </div>
        ))}
      </div>
    </PageContainer>
  );
}
