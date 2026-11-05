import { SkeletonFilterBar, SkeletonLine, SkeletonPageHeader, SkeletonTabs } from "@/components/shared/SkeletonParts";

// As telas fiscais esperam o motor ou o banco local antes de desenhar (26/10/2026).
// O esqueleto de lista, sem o `PageContainer` do `ListPageSkeleton`: o layout
// fiscal já põe o seu.
export default function LoadingFiscal() {
  return <>
    <SkeletonTabs abas={3} />
    <SkeletonPageHeader />
    <SkeletonFilterBar />
    <div className="bg-surface border border-border rounded-lg shadow-xs overflow-hidden">
      {Array.from({ length: 5 }).map((_, i) => <div key={i} className="flex items-center gap-6 px-4 py-4 border-b border-border last:border-0"><SkeletonLine w="w-44" /><SkeletonLine w="w-28" /><SkeletonLine w="w-40 flex-1" /><SkeletonLine w="w-20" /></div>)}
    </div>
  </>;
}
