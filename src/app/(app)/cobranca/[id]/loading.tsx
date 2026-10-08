import { PageContainer } from "@/components/shared/PageContainer";
import { SkeletonBack, SkeletonPageHeader, SkeletonBlocks } from "@/components/shared/SkeletonParts";

// A ficha tem o próprio esqueleto (08/10/2026): sem ele, valeria o da fila,
// e o título aberto aparecia primeiro como uma lista.
export default function LoadingTituloEmCobranca() {
  return (
    <PageContainer>
      <div className="mb-3">
        <SkeletonBack />
      </div>
      <SkeletonPageHeader />
      <SkeletonBlocks blocos={3} linhas={3} />
    </PageContainer>
  );
}
