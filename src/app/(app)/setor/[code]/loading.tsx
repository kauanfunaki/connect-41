import { PageContainer } from "@/components/shared/PageContainer";
import { SkeletonBack, SkeletonPageHeader, SkeletonTiles } from "@/components/shared/SkeletonParts";

// No nível de `[code]`, então cobre também `[moduleCode]`, `espacos/[spaceId]`
// e `pastas/[folderId]` — quatro rotas com um arquivo. As três filhas abrem
// com o mesmo cabeçalho; o que muda é o conteúdo, e ladrilho é a aproximação
// mais honesta para todas.
export default function LoadingSetor() {
  return (
    <PageContainer>
      <div className="mb-3">
        <SkeletonBack />
      </div>
      <SkeletonPageHeader />
      <SkeletonTiles tiles={6} />
    </PageContainer>
  );
}
