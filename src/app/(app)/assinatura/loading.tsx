import { PageContainer } from "@/components/shared/PageContainer";
import { SkeletonPageHeader, SkeletonBlocks } from "@/components/shared/SkeletonParts";

// Mesma moldura da página real, senão a troca skeleton -> conteúdo pula de
// largura.
export default function LoadingAssinatura() {
  return (
    <PageContainer>
      <SkeletonPageHeader />
      <SkeletonBlocks blocos={3} linhas={3} />
    </PageContainer>
  );
}
