import { PageContainer } from "@/components/shared/PageContainer";
import { SkeletonBack, SkeletonPageHeader, SkeletonBlocks } from "@/components/shared/SkeletonParts";

// Mesma moldura da página real, senão a troca skeleton -> conteúdo pula de largura.
export default function LoadingProcesso() {
  return (
    <PageContainer>
      <SkeletonBack />
      <SkeletonPageHeader />
      <SkeletonBlocks />
    </PageContainer>
  );
}
