import { PageContainer } from "@/components/shared/PageContainer";
import { SkeletonBlocks, SkeletonMetrics, SkeletonPageHeader, SkeletonTabs } from "@/components/shared/SkeletonParts";

// No formato da aba Painel: título, abas, os 4 números e os três blocos (o
// gráfico, a tabela por pessoa e a saúde do fluxo). A aba GitHub tem o carregamento dela por cima.
export default function CarregandoProdutividade() {
  return (
    <PageContainer>
      <div aria-busy>
        <span className="sr-only" role="status">
          Carregando a produtividade…
        </span>
        <SkeletonPageHeader comAcao />
        <SkeletonTabs abas={3} />
        <SkeletonMetrics />
        <SkeletonBlocks blocos={3} />
      </div>
    </PageContainer>
  );
}
