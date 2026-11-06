import { PageContainer } from "@/components/shared/PageContainer";
import { SkeletonLine, SkeletonPageHeader } from "@/components/shared/SkeletonParts";

// O formato da lista de avaliações (cabeçalho com ação e as linhas), para nada
// pular quando a página chega — como o loading do Valora.
export default function LoadingPlanejamentoTributario() {
  return (
    <PageContainer>
      <SkeletonPageHeader comAcao />
      <div className="bg-surface border border-border rounded-lg shadow-[var(--c41-shadow-xs)] overflow-hidden">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="flex items-center gap-6 px-4 py-4 border-b border-border last:border-0">
            <SkeletonLine w="w-52" />
            <SkeletonLine w="w-32" />
            <SkeletonLine w="w-20" />
            <SkeletonLine w="w-12" />
            <SkeletonLine w="w-24" />
          </div>
        ))}
      </div>
    </PageContainer>
  );
}
