import { SkeletonCardList, SkeletonLine, SkeletonMetrics } from "@/components/shared/SkeletonParts";

// Sem loading.tsx, a aba anterior ficava parada até a consulta acabar — e o
// painel junta processos, cards, pendências e transferências (auditoria
// DRG-33, 07/10/2026). O cabeçalho e as abas são do layout e continuam à
// vista; o esqueleto é só o miolo: o filtro, os números e a lista.
export default function LoadingGestao() {
  return (
    <div className="flex flex-col gap-6">
      <SkeletonLine w="w-24" h="h-8" />
      <SkeletonMetrics cartoes={4} />
      <SkeletonCardList cards={4} linhas={2} />
    </div>
  );
}
