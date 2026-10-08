import { PageContainer } from "@/components/shared/PageContainer";
import { SkeletonPageHeader, SkeletonWorkspace } from "@/components/shared/SkeletonParts";

// A página real é `h-full flex flex-col` com o workspace em `flex-1 min-h-0`.
// O esqueleto repete essa estrutura porque, sem ela, o painel encolhe para a
// altura do conteúdo e o layout salta quando o editor chega. Sem o esqueleto
// do "Voltar", que a página deixou de ter (08/10/2026).
export default function LoadingBpoManual() {
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
