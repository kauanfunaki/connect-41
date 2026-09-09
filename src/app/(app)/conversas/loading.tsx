import { PageContainer } from "@/components/shared/PageContainer";
import {
  SkeletonPageHeader,
  SkeletonTabs,
  SkeletonLine,
  SkeletonFilterBar,
  SkeletonCardList,
} from "@/components/shared/SkeletonParts";

// Espelha o formato de /conversas: cabeçalho com ação à direita, duas abas
// (Atendimentos · Avaliação), a linha de contagem, a barra de filtros e os
// cards de contato.
//
// É a rota mais pesada de carregar do app — lê o cache do Chatwoot e agrega
// avaliação por atendente —, então é onde a ausência de esqueleto mais
// aparecia: a navegação ficava em tela branca.
export default function LoadingConversas() {
  return (
    <PageContainer>
      <SkeletonPageHeader comAcao />
      <SkeletonTabs abas={2} />
      <div className="mb-3">
        <SkeletonLine w="w-56" h="h-3" />
      </div>
      <SkeletonFilterBar />
      <SkeletonCardList cards={5} linhas={2} />
    </PageContainer>
  );
}
