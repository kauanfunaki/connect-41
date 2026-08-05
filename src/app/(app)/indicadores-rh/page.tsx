import Link from "next/link";
import { ArrowRight, Palmtree, GraduationCap, ClipboardList, Scale } from "lucide-react";
import { getAuthContext } from "@/lib/auth/context";
import { PageHeader } from "@/components/ui/PageHeader";
import { getIndicadoresRH } from "@/lib/indicadoresRH";
import { canViewSensitiveField } from "@/lib/auth/sensitiveFields";
import { PageContainer } from "@/components/shared/PageContainer";
import { ExportIndicadoresButtons } from "@/components/indicadoresRH/ExportIndicadoresButtons";

// Os cards acima são o retrato agregado; estes relatórios são a lista
// acionável ("quem está vencido", "o que falta") que o painel não dá.
const RELATORIOS = [
  {
    href: "/indicadores-rh/ferias",
    label: "Férias",
    description: "Vencidas, a vencer e programadas, por colaborador",
    icon: <Palmtree size={18} />,
    sensitive: false,
  },
  {
    href: "/indicadores-rh/treinamentos",
    label: "Treinamentos",
    description: "Realizados, vencidos e a vencer, com validade calculada",
    icon: <GraduationCap size={18} />,
    sensitive: false,
  },
  {
    href: "/indicadores-rh/pendencias",
    label: "Pendências",
    description: "Documentos, admissões e exames em aberto",
    icon: <ClipboardList size={18} />,
    sensitive: false,
  },
  {
    href: "/indicadores-rh/distorcoes-salariais",
    label: "Distorções salariais",
    description: "Quem está fora da faixa do próprio cargo",
    icon: <Scale size={18} />,
    sensitive: true,
  },
];

export default async function IndicadoresRhPage() {
  const ctx = await getAuthContext();
  const [cards, canViewSalary] = await Promise.all([
    getIndicadoresRH(ctx),
    canViewSensitiveField(ctx, "SALARIO"),
  ]);
  const relatorios = RELATORIOS.filter((r) => !r.sensitive || canViewSalary);

  return (
    <PageContainer>
      <div className="flex items-start justify-between gap-4 mb-6">
        <div>
      <PageHeader title="Indicadores de RH" />
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

      <div className="mt-8">
        <h2 className="text-[13px] font-semibold text-fg mb-3">Relatórios</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {relatorios.map((r) => (
            <Link
              key={r.href}
              href={r.href}
              className="group bg-surface border border-border rounded-lg p-4 hover:border-border-strong hover:bg-surface-hover transition-colors"
            >
              <span className="inline-flex w-9 h-9 rounded-lg items-center justify-center bg-brand/10 text-brand mb-3">
                {r.icon}
              </span>
              <div className="flex items-center justify-between gap-2">
                <p className="text-[13px] font-semibold text-fg">{r.label}</p>
                <ArrowRight
                  size={14}
                  className="text-fg-muted flex-shrink-0 -translate-x-1 opacity-0 group-hover:translate-x-0 group-hover:opacity-100 transition-all"
                />
              </div>
              <p className="text-[12px] text-fg-muted mt-1 leading-relaxed">{r.description}</p>
            </Link>
          ))}
        </div>
      </div>
    </PageContainer>
  );
}
