import Link from "next/link";
import { notFound } from "next/navigation";
import {
  ArrowRight,
  Briefcase,
  UserSearch,
  Users,
  Stethoscope,
  Clock,
  CalendarClock,
  GraduationCap,
  Star,
  BarChart3,
  IdCard,
  LayoutGrid,
} from "lucide-react";
import { getAuthContext, canViewSector } from "@/lib/auth/context";
import { getTenantModuleStates } from "@/lib/modules";
import { getSectorMaps, sectorLabel } from "@/lib/sectors";
import { PageContainer } from "@/components/shared/PageContainer";

// Ícone por módulo — identidade visual dos cards do hub setorial.
const MODULE_ICONS: Record<string, React.ReactNode> = {
  recrutamento_vagas: <Briefcase size={20} />,
  recrutamento_candidatos: <UserSearch size={20} />,
  dprh_colaboradores: <Users size={20} />,
  dprh_afastamentos: <Stethoscope size={20} />,
  dprh_horas_extras: <Clock size={20} />,
  dprh_escalas: <CalendarClock size={20} />,
  dprh_treinamentos: <GraduationCap size={20} />,
  dprh_avaliacoes: <Star size={20} />,
  gestao_cargos_salarios: <IdCard size={20} />,
  gestao_indicadores_rh: <BarChart3 size={20} />,
};

export default async function SectorHubPage({
  params,
}: {
  params: Promise<{ code: string }>;
}) {
  const { code } = await params;
  const ctx = await getAuthContext();

  if (!canViewSector(ctx, code)) notFound();

  const [allModules, { labels: sectorLabels, colors: sectorColors }] = await Promise.all([
    getTenantModuleStates(ctx.tenantId),
    getSectorMaps(ctx.tenantId),
  ]);

  const modules = allModules.filter((m) => m.sectorCode === code && m.enabled);
  const sectorColor = sectorColors[code] ?? "#586577";

  return (
    <PageContainer>
      <div className="mb-6">
        <h1 className="text-[16px] font-semibold text-fg tracking-[-0.01em]">
          {sectorLabel(sectorLabels, code)}
        </h1>
        <p className="text-[13px] text-fg-muted mt-0.5">
          Módulos disponíveis para este setor.
        </p>
      </div>

      {modules.length === 0 ? (
        <div className="bg-surface border border-border rounded-lg py-16 text-center text-[13px] text-fg-muted">
          Nenhum módulo ativo para este setor ainda.
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {modules.map((m) => (
            <Link
              key={m.code}
              href={`/setor/${code}/${m.code}`}
              className="group bg-surface border border-border rounded-2xl p-5 hover:border-border-strong hover:bg-surface-hover hover:shadow-[var(--c41-shadow-sm)] transition-all"
            >
              <span
                className="inline-flex w-10 h-10 rounded-xl items-center justify-center mb-4"
                style={{ background: `${sectorColor}1A`, color: sectorColor }}
              >
                {MODULE_ICONS[m.code] ?? <LayoutGrid size={20} />}
              </span>

              <div className="flex items-center justify-between gap-2">
                <p className="text-[14px] font-semibold text-fg">{m.label}</p>
                <ArrowRight
                  size={15}
                  className="text-fg-muted flex-shrink-0 -translate-x-1 opacity-0 group-hover:translate-x-0 group-hover:opacity-100 transition-all"
                />
              </div>
              <p className="text-[12.5px] text-fg-muted mt-1 leading-relaxed">{m.description}</p>
            </Link>
          ))}
        </div>
      )}
    </PageContainer>
  );
}
