import { PageContainer } from "@/components/shared/PageContainer";
import { SkeletonPageHeader } from "@/components/shared/SkeletonParts";

// No formato da tela (05/11/2026): os 4 números e os 4 gráficos ocupam o lugar
// que vão ocupar, para a tela não pular quando os dados chegam. Era o
// esqueleto de listagem, de linhas de tabela.
export default function LoadingIndicadoresRh() {
  return (
    <PageContainer>
      <SkeletonPageHeader />
      <div className="grid grid-cols-2 xl:grid-cols-4 gap-3 sm:gap-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="bg-surface border border-border rounded-lg p-4 space-y-3">
            <div className="c41-skeleton w-24 h-3" />
            <div className="c41-skeleton w-16 h-7" />
            <div className="c41-skeleton w-28 h-3" />
          </div>
        ))}
      </div>
      <div className="mt-8 mb-4 flex justify-between gap-4">
        <div className="c41-skeleton w-56 h-4" />
        <div className="c41-skeleton w-40 h-8" />
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-5">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="bg-surface border border-border rounded-lg p-5 space-y-4">
            <div className="c41-skeleton w-20 h-3" />
            <div className="c41-skeleton w-56 h-5" />
            <div className="c41-skeleton w-full h-48" />
          </div>
        ))}
      </div>
    </PageContainer>
  );
}
