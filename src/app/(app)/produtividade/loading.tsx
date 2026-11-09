import { PageContainer } from "@/components/shared/PageContainer";
import { SkeletonCardList, SkeletonPageHeader, SkeletonTabs } from "@/components/shared/SkeletonParts";

// No formato da aba Pessoas, a de entrada desde 09/11/2026: título, as duas
// abas e um cartão por desenvolvedor. A aba GitHub tem o carregamento dela por cima.
export default function CarregandoProdutividade() {
  return (
    <PageContainer>
      <div aria-busy>
        <span className="sr-only" role="status">
          Carregando a produtividade…
        </span>
        <SkeletonPageHeader comAcao />
        <SkeletonTabs abas={2} />
        <SkeletonCardList cards={3} />
      </div>
    </PageContainer>
  );
}
