import { PageContainer } from "@/components/shared/PageContainer";
import { SkeletonPageHeader, SkeletonLine, SkeletonBlocks } from "@/components/shared/SkeletonParts";

// Configurações é uma pilha de seções, cada uma com título próprio acima do
// painel — por isso o título entra entre os blocos, e não só no topo.
export default function LoadingConfiguracoes() {
  return (
    <PageContainer>
      <SkeletonPageHeader />
      {Array.from({ length: 3 }).map((_, i) => (
        <div key={i} className="mb-8 space-y-3">
          <SkeletonLine w="w-40" h="h-4" />
          <SkeletonBlocks blocos={1} linhas={3} />
        </div>
      ))}
    </PageContainer>
  );
}
