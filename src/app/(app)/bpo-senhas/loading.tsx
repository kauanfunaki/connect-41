import { PageContainer } from "@/components/shared/PageContainer";
import { SkeletonPageHeader, SkeletonCardList } from "@/components/shared/SkeletonParts";

// Sem o esqueleto do "Voltar", que a página deixou de ter (08/10/2026).
export default function LoadingBpoSenhas() {
  return (
    <PageContainer>
      <SkeletonPageHeader />
      <SkeletonCardList cards={5} linhas={2} />
    </PageContainer>
  );
}
