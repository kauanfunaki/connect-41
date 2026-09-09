import { PageContainer } from "@/components/shared/PageContainer";
import { SkeletonPageHeader, SkeletonCardList } from "@/components/shared/SkeletonParts";

// Nível do segmento: cobre `/testes`, `/testes/[id]`, `/testes/templates` e as
// duas rotas de template. Todas abrem em lista de cards.
export default function LoadingTestes() {
  return (
    <PageContainer>
      <SkeletonPageHeader comAcao />
      <SkeletonCardList cards={4} linhas={2} />
    </PageContainer>
  );
}
