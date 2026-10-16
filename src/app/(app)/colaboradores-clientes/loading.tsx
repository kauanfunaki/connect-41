import { PageContainer } from "@/components/shared/PageContainer";

// O esqueleto no desenho da tela de uma empresa por vez (14/10/2026): o
// cabeçalho, a fileira da empresa com a busca, os cinco números e a tabela.
export default function LoadingColaboradoresClientes() {
  return (
    <PageContainer>
      <div className="flex items-end justify-between mb-7">
        <div className="space-y-2">
          <div className="c41-skeleton w-7 h-[3px] mb-3" />
          <div className="c41-skeleton w-64 h-7" />
          <div className="c41-skeleton w-96 max-w-full h-3.5" />
        </div>
        <div className="c41-skeleton w-36 h-9 rounded-md" />
      </div>

      <div className="flex flex-wrap items-center gap-3 mb-5">
        <div className="c41-skeleton w-14 h-3" />
        <div className="c41-skeleton w-80 max-w-full h-8 rounded-md" />
        <div className="c41-skeleton w-72 max-w-full h-8 rounded-md" />
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-3 sm:gap-4 mb-5">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="bg-surface border border-border rounded-lg p-4 space-y-3">
            <div className="c41-skeleton w-24 h-3" />
            <div className="c41-skeleton w-12 h-7" />
          </div>
        ))}
      </div>

      <div className="bg-surface border border-border rounded-lg shadow-[var(--c41-shadow-xs)] overflow-hidden">
        <div className="border-b border-border h-[52px]" />
        <div className="border-b border-border bg-table-header-bg h-11" />
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="flex items-center gap-6 px-4 py-3 border-b border-border last:border-0">
            <div className="c41-skeleton w-4 h-4 rounded-sm" />
            <div className="c41-skeleton w-40 h-3.5" />
            <div className="c41-skeleton w-28 h-3.5" />
            <div className="c41-skeleton w-24 h-5 rounded-full" />
            <div className="c41-skeleton w-20 h-3.5" />
            <div className="c41-skeleton w-28 h-3.5 flex-1" />
          </div>
        ))}
      </div>
    </PageContainer>
  );
}
