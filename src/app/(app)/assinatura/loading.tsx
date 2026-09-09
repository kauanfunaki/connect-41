import { PageContainer } from "@/components/shared/PageContainer";
import { SkeletonPageHeader, SkeletonBlocks } from "@/components/shared/SkeletonParts";

// `variant="narrow"` acompanha a página: assinatura é leitura de um contrato,
// não listagem, e a largura estreita é o que evita a linha longa demais.
export default function LoadingAssinatura() {
  return (
    <PageContainer variant="narrow">
      <SkeletonPageHeader />
      <SkeletonBlocks blocos={3} linhas={3} />
    </PageContainer>
  );
}
