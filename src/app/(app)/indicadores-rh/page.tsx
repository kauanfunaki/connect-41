import { getAuthContext } from "@/lib/auth/context";
import { getIndicadoresRH } from "@/lib/indicadoresRH";
import { PageContainer } from "@/components/shared/PageContainer";
import { ExportIndicadoresButtons } from "@/components/indicadoresRH/ExportIndicadoresButtons";

export default async function IndicadoresRhPage() {
  const ctx = await getAuthContext();
  const cards = await getIndicadoresRH(ctx);

  return (
    <PageContainer>
      <div className="flex items-start justify-between gap-4 mb-6">
        <div>
          <h1 className="text-[16px] font-semibold text-fg tracking-[-0.01em]">Indicadores de RH</h1>
          <p className="text-[13px] text-fg-muted mt-0.5">
            Consequência dos dados operacionais lançados nos módulos de RH/DP e Recrutamento.
          </p>
        </div>
        <ExportIndicadoresButtons />
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
        {cards.map((c) => (
          <div key={c.label} className="bg-surface border border-border rounded-lg p-4">
            <p className="text-[11px] text-fg-muted uppercase tracking-wide mb-1">{c.label}</p>
            <p className="text-[20px] font-semibold text-fg tnum">{c.value}</p>
            {c.hint && <p className="text-[11px] text-fg-muted mt-0.5">{c.hint}</p>}
          </div>
        ))}
      </div>
    </PageContainer>
  );
}
