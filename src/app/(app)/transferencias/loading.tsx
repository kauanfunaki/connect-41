import { PageContainer } from "@/components/shared/PageContainer";
import { SkeletonLine, SkeletonPageHeader, SkeletonTabs } from "@/components/shared/SkeletonParts";

// No formato da caixa de entrada (10/11/2026): cabeçalho com o "Nova
// transferência", as quatro abas, a barra do casco (busca, Filtros e a
// contagem) e a tabela de seis colunas. O esqueleto de antes desenhava abas e
// linhas que a tela de cartões não tinha.
export default function LoadingTransferencias() {
  return (
    <PageContainer>
      <div aria-busy>
        <span className="sr-only" role="status">
          Carregando as transferências…
        </span>
        <SkeletonPageHeader comAcao />
        <SkeletonTabs abas={4} />

        <div className="bg-surface border border-border rounded-lg shadow-xs overflow-hidden">
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2 min-h-[52px] px-4 py-2.5 border-b border-border">
            <SkeletonLine w="w-full max-w-md flex-1" h="h-8" />
            <SkeletonLine w="w-24" h="h-8" />
            <div className="ml-auto">
              <SkeletonLine w="w-28" h="h-3.5" />
            </div>
          </div>

          {/* Os cartões no celular, a tabela do `md` para cima — como a tela. */}
          <div className="md:hidden flex flex-col gap-2 p-3">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="border border-border rounded-lg px-3 py-2.5 space-y-2">
                <SkeletonLine w="w-48" h="h-3.5" />
                <SkeletonLine w="w-32" h="h-3" />
                <SkeletonLine w="w-40" h="h-5" />
              </div>
            ))}
          </div>
          <div className="hidden md:block">
            <div className="flex items-center gap-6 px-4 py-3 bg-[var(--c41-table-header-bg)] border-b border-border">
              {["w-20", "w-20", "w-20", "w-24", "w-20", "w-20"].map((w, i) => (
                <div key={i} className={i === 0 ? "flex-[2]" : "flex-1 flex justify-center"}>
                  <SkeletonLine w={w} h="h-3" />
                </div>
              ))}
            </div>
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="flex items-center gap-6 px-4 py-3.5 border-b border-border last:border-0">
                <div className="flex-[2]">
                  <SkeletonLine w={i % 2 === 0 ? "w-56" : "w-44"} h="h-3.5" />
                </div>
                <div className="flex-1 flex justify-center">
                  <SkeletonLine w="w-32" h="h-3.5" />
                </div>
                <div className="flex-1 flex justify-center">
                  <SkeletonLine w="w-40" h="h-6" />
                </div>
                <div className="flex-1 flex justify-center">
                  <SkeletonLine w="w-28" h="h-3.5" />
                </div>
                <div className="flex-1 flex justify-center">
                  <SkeletonLine w="w-14" h="h-5" />
                </div>
                <div className="flex-1 flex justify-center">
                  <SkeletonLine w="w-12" h="h-3.5" />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </PageContainer>
  );
}
