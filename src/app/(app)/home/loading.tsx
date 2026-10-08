// Skeleton exibido enquanto o dashboard (várias queries agregadas) carrega —
// mesmo padrão de src/app/(app)/pessoas/[id]/loading.tsx. Na ordem da Home
// desde 08/10 (escolha 7A): faixa de destaques, painéis, Indicadores, colunas.
export default function LoadingHome() {
  return (
    <div className="p-6 max-w-[1440px] mx-auto animate-pulse">
      <div className="flex items-start justify-between gap-4 mb-6">
        <div>
          <div className="h-5 w-40 bg-surface-2 rounded mb-2" />
          <div className="h-3.5 w-64 bg-surface-2 rounded" />
        </div>
        <div className="h-3.5 w-28 bg-surface-2 rounded" />
      </div>

      {/* A faixa de destaques: até três cartões, na altura deles (FaixaCarregando). */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3 mb-4">
        {[0, 1, 2].map((i) => (
          <div key={i} className="h-[118px] rounded-lg bg-surface-2 sm:[&:nth-child(3)]:col-span-2 xl:[&:nth-child(3)]:col-span-1" />
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-4">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="bg-surface border border-border rounded-lg shadow-[var(--c41-shadow-xs)] p-5 h-[180px]">
            <div className="h-4 w-40 bg-surface-2 rounded mb-4" />
            <div className="h-24 bg-surface-2 rounded" />
          </div>
        ))}
      </div>

      {/* Os Indicadores, abaixo dos painéis. */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="bg-surface border border-border rounded-lg shadow-[var(--c41-shadow-xs)] px-4 py-3.5 h-[84px]">
            <div className="h-3 w-24 bg-surface-2 rounded mb-3" />
            <div className="h-6 w-12 bg-surface-2 rounded" />
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {[0, 1].map((i) => (
          <div key={i} className="bg-surface border border-border rounded-lg shadow-[var(--c41-shadow-xs)] p-5 h-[160px]">
            <div className="h-4 w-32 bg-surface-2 rounded mb-4" />
            <div className="h-3 w-full bg-surface-2 rounded mb-2.5" />
            <div className="h-3 w-full bg-surface-2 rounded mb-2.5" />
            <div className="h-3 w-2/3 bg-surface-2 rounded" />
          </div>
        ))}
      </div>
    </div>
  );
}
