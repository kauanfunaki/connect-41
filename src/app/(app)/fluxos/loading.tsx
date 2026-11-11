import { PageContainer } from "@/components/shared/PageContainer";
import { SkeletonPageHeader, SkeletonWorkspace } from "@/components/shared/SkeletonParts";

// O esqueleto repete a estrutura da página (cabeçalho e a área de trabalho em
// `flex-1 min-h-0`), como o dos manuais: sem ela, o painel encolhe para a
// altura do conteúdo e o layout salta quando o fluxo chega (10/11/2026).
export default function LoadingFluxos() {
  return (
    <PageContainer className="h-full flex flex-col">
      <div className="flex-shrink-0">
        <SkeletonPageHeader />
      </div>
      <div className="flex-1 min-h-0">
        <SkeletonWorkspace />
      </div>
    </PageContainer>
  );
}
