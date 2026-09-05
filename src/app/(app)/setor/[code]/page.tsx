import Link from "next/link";
import { Card } from "@/components/ui/Card";
import { PageHeader } from "@/components/ui/PageHeader";
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
  BookOpen,
  ClipboardList,
} from "lucide-react";
import { getAuthContext, canViewSector, canManageSector } from "@/lib/auth/context";
import { getTenantModuleStates } from "@/lib/modules";
import { getSectorMaps, sectorLabel } from "@/lib/sectors";
import { getPrisma } from "@/lib/prisma";
import { PageContainer } from "@/components/shared/PageContainer";
import { EmptyState } from "@/components/ui/EmptyState";
import { NewSpaceButton } from "@/components/kanban/NewSpaceButton";
import { DeleteEntityMenu } from "@/components/kanban/DeleteEntityMenu";
import { criarEspaco, excluirEspaco } from "@/app/(app)/kanban/spaces-actions";

// Ícone por módulo — identidade visual dos cards do hub setorial.
const MODULE_ICONS: Record<string, React.ReactNode> = {
  recrutamento_vagas: <Briefcase size={20} />,
  recrutamento_candidatos: <UserSearch size={20} />,
  recrutamento_testes: <ClipboardList size={20} />,
  dp_colaboradores: <Users size={20} />,
  dp_afastamentos: <Stethoscope size={20} />,
  dp_horas_extras: <Clock size={20} />,
  dp_escalas: <CalendarClock size={20} />,
  dp_treinamentos: <GraduationCap size={20} />,
  dp_avaliacoes: <Star size={20} />,
  gestao_cargos_salarios: <IdCard size={20} />,
  gestao_indicadores_rh: <BarChart3 size={20} />,
  bpo_manual: <BookOpen size={20} />,
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

  const modules = allModules.filter((m) => m.sectorCode === code && m.enabled);
  const sectorColor = sectorColors[code] ?? "#586577";
  const canCreateSpace = canManageSector(ctx, code);

  return (
    <PageContainer>
      <PageHeader
        title={sectorLabel(sectorLabels, code)}
        subtitle="Módulos disponíveis para este setor."
      />

      {modules.length === 0 ? (
        <Card>
          <EmptyState
            icon={<LayoutGrid size={20} />}
            title="Nenhum módulo ativo para este setor"
            description="Módulos são ativados pelo administrador em Configurações."
          />
        </Card>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {modules.map((m) => (
            <Link
              key={m.code}
              href={`/setor/${code}/${m.code}`}
              className="group bg-surface border border-border rounded-lg p-5 hover:border-border-strong hover:bg-surface-hover hover:shadow-[var(--c41-shadow-sm)] transition-all"
            >
              <span
                className="inline-flex w-10 h-10 rounded-lg items-center justify-center mb-4"
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
          <Card>
            <EmptyState
              icon={<LayoutGrid />}
              title="Nenhum espaço criado ainda"
              description="Um espaço agrupa pastas e listas (kanbans) deste setor."
            />
          </Card>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {spaces.map((s, i) => (
              // O menu "…" é irmão do <Link>, não filho: <button> dentro de <a>
              // é inválido e o clique navegaria junto.
              <div
                key={s.id}
                style={{ animationDelay: `${Math.min(i, 8) * 35}ms` }}
                className="reveal-in relative"
              >
                <Link
                  href={`/setor/${code}/espacos/${s.id}`}
                  className="block bg-surface border border-border rounded-lg p-4 hover:border-border-strong hover:-translate-y-0.5 transition-[border-color,transform]"
                >
                  <div className="flex items-center gap-2 mb-1 pr-6">
                    <span className="w-[7px] h-[7px] rounded-full flex-shrink-0" style={{ background: s.color }} />
                    <p className="text-[13px] font-medium text-fg">{s.name}</p>
                  </div>
                  <p className="text-[12px] text-fg-muted">
                    {s._count.folders} {s._count.folders === 1 ? "pasta" : "pastas"} · {s._count.pipelines} {s._count.pipelines === 1 ? "lista" : "listas"}
                  </p>
                </Link>
                {canCreateSpace && (
                  <div className="absolute top-2.5 right-2.5">
                    <DeleteEntityMenu kind="espaço" name={s.name} action={excluirEspaco.bind(null, s.id)} />
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </PageContainer>
  );
}
