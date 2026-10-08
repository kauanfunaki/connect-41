import { PageContainer } from "@/components/shared/PageContainer";
import { SkeletonBack, SkeletonPageHeader, SkeletonBlocks } from "@/components/shared/SkeletonParts";

// A ficha tem o próprio esqueleto (08/10/2026): sem ele, valeria o da lista,
// e a pendência aberta aparecia primeiro como uma fila.
export default function LoadingPendencia() {
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
