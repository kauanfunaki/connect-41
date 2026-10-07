import { PageContainer } from "@/components/shared/PageContainer";
import { SkeletonLine, SkeletonMetrics, SkeletonPageHeader } from "@/components/shared/SkeletonParts";

// Sem loading.tsx, a tela anterior ficava parada até a consulta acabar
// (auditoria DRG-33, 07/10/2026). Cabeçalho com ações, os quatro números e a
// lista — o formato da página, para nada pular quando ela chega.
export default function LoadingValora() {
  return (
    <PageContainer>
      <SkeletonPageHeader comAcao />
      <SkeletonMetrics cartoes={4} />
      <div className="bg-surface border border-border rounded-lg shadow-[var(--c41-shadow-xs)] overflow-hidden">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="flex items-center gap-6 px-4 py-4 border-b border-border last:border-0">
            <SkeletonLine w="w-44" />
            <SkeletonLine w="w-24" />
            <SkeletonLine w="w-20" />
            <SkeletonLine w="w-20" />
            <SkeletonLine w="w-16" />
          </div>
        ))}
      </div>
    </PageContainer>
  );
}
