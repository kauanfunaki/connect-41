import { PageContainer } from "@/components/shared/PageContainer";
import { SkeletonPageHeader } from "@/components/shared/SkeletonParts";

export default function LoadingPessoas() {
  return (
    <PageContainer>
      {/* Só o cabeçalho, nas medidas do PageHeader (10/11/2026): a fileira de
          abas Empresas/Pessoas saiu, e a tela é um item do grupo Cadastros. */}
      <SkeletonPageHeader comAcao />

      <div className="bg-surface border border-border rounded-lg shadow-[var(--c41-shadow-xs)] overflow-hidden">
        <div className="border-b border-border bg-table-header-bg h-11" />
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="flex items-center gap-6 px-4 py-3 border-b border-border last:border-0">
            <div className="c41-skeleton w-4 h-4 rounded" />
            <div className="c41-skeleton w-40 h-3.5" />
            <div className="c41-skeleton w-20 h-3.5" />
            <div className="c41-skeleton w-28 h-3.5" />
            <div className="c41-skeleton w-40 h-3.5 flex-1" />
          </div>
        ))}
      </div>
    </PageContainer>
  );
}
