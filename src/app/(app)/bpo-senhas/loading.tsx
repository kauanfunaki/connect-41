import { PageContainer } from "@/components/shared/PageContainer";
import { SkeletonBack, SkeletonPageHeader, SkeletonCardList } from "@/components/shared/SkeletonParts";

export default function LoadingBpoSenhas() {
  return (
    <PageContainer>
      <div className="mb-3">
        <SkeletonBack />
      </div>
      <SkeletonPageHeader />
      <SkeletonCardList cards={5} linhas={2} />
    </PageContainer>
  );
}
