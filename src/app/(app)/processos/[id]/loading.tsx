import { PageContainer } from "@/components/shared/PageContainer";
import { SkeletonBack, SkeletonPageHeader, SkeletonBlocks } from "@/components/shared/SkeletonParts";

// Mesma moldura da página real, senão a troca skeleton -> conteúdo pula de largura.
// As duas colunas do `xl` também (08/10/2026): o roteiro à esquerda e a coluna
// de apoio à direita, na mesma grade da página.
export default function LoadingProcesso() {
  return (
    <PageContainer>
      <SkeletonBack />
      <SkeletonPageHeader />
      <div className="flex flex-col gap-4 xl:grid xl:grid-cols-[minmax(0,1fr)_25rem] xl:items-start xl:gap-5 2xl:grid-cols-[minmax(0,1fr)_28rem]">
        <SkeletonBlocks blocos={1} linhas={6} />
        <SkeletonBlocks blocos={2} linhas={3} />
      </div>
    </PageContainer>
  );
}
