import { PageContainer } from "@/components/shared/PageContainer";
import { SkeletonBlocks, SkeletonLine, SkeletonPageHeader } from "@/components/shared/SkeletonParts";

// A ficha do candidato carregando, no desenho dela (14/10/2026): cabeçalho e as
// duas colunas — o processo à esquerda, a pessoa à direita. Sem este arquivo
// valia o da lista de candidatos, uma tabela que não tem nada a ver com a ficha.
export default function LoadingCandidato() {
  return (
    <PageContainer>
      <div className="mb-4">
        <SkeletonLine w="w-48" h="h-3.5" />
      </div>
      <SkeletonPageHeader comAcao />
      <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
        <SkeletonBlocks blocos={3} linhas={3} />
        <SkeletonBlocks blocos={2} linhas={4} />
      </div>
    </PageContainer>
  );
}
