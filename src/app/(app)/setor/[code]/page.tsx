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
import { getAuthContext, canViewSector, canManageSector } from "@/lib/auth/context";
import { getTenantModuleStates } from "@/lib/modules";
import { getSectorMaps, sectorLabel } from "@/lib/sectors";
import { getPrisma } from "@/lib/prisma";
import { hasDedicatedRoute } from "@/lib/kanbanPaths";
import { PageContainer } from "@/components/shared/PageContainer";
import { EmptyState } from "@/components/ui/EmptyState";
import { NewSpaceButton } from "@/components/kanban/NewSpaceButton";
import { criarEspaco } from "@/app/(app)/kanban/spaces-actions";

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

  const prisma = getPrisma();
  const [allModules, { labels: sectorLabels, colors: sectorColors }, spaces] = await Promise.all([
    getTenantModuleStates(ctx.tenantId),
    getSectorMaps(ctx.tenantId),
    prisma.space.findMany({
      where: { tenantId: ctx.tenantId, sectorCode: code },
      orderBy: { order: "asc" },
      include: { _count: { select: { pipelines: true, folders: true } } },
    }),
  ]);

  // Setores com módulo dedicado (ex. BPO) usam as próprias rotas de
  // Espaço/Pasta (com o basePath correto pras Listas); os demais usam a
  // rota genérica de setor.
  const spacesBasePath = hasDedicatedRoute(code) ? "/bpo-financeiro" : `/setor/${code}`;

  const modules = allModules.filter((m) => m.sectorCode === code && m.enabled);
  const sectorColor = sectorColors[code] ?? "#586577";
  const canCreateSpace = canManageSector(ctx, code);

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
        <div className="bg-surface border border-border rounded-lg">
          <EmptyState
            icon={<LayoutGrid size={20} />}
            title="Nenhum módulo ativo para este setor"
            description="Módulos são ativados pelo administrador em Configurações."
          />
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

      <div className="mt-8">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-[13px] font-semibold text-fg">Espaços</h2>
          {canCreateSpace && <NewSpaceButton action={criarEspaco.bind(null, code)} />}
        </div>
        {spaces.length === 0 ? (
          <p className="text-[13px] text-fg-muted">
            Nenhum espaço criado ainda — um espaço agrupa pastas e listas (kanbans) deste setor.
          </p>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {spaces.map((s, i) => (
              <Link
                key={s.id}
                href={`${spacesBasePath}/espacos/${s.id}`}
                style={{ animationDelay: `${Math.min(i, 8) * 35}ms` }}
                className="reveal-in bg-surface border border-border rounded-lg p-4 hover:border-border-strong hover:-translate-y-0.5 transition-[border-color,transform]"
              >
                <div className="flex items-center gap-2 mb-1">
                  <span className="w-[7px] h-[7px] rounded-full flex-shrink-0" style={{ background: s.color }} />
                  <p className="text-[13px] font-medium text-fg">{s.name}</p>
                </div>
                <p className="text-[12px] text-fg-muted">
                  {s._count.folders} {s._count.folders === 1 ? "pasta" : "pastas"} · {s._count.pipelines} {s._count.pipelines === 1 ? "lista" : "listas"}
                </p>
              </Link>
            ))}
          </div>
        )}
      </div>
    </PageContainer>
  );
}
