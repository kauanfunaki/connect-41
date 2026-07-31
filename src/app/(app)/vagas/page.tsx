import Link from "next/link";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { PageHeader } from "@/components/ui/PageHeader";
import { Briefcase } from "lucide-react";
import { getPrisma } from "@/lib/prisma";
import { VagaStatus } from "@/generated/prisma/enums";
import { getAuthContext, canManageSector } from "@/lib/auth/context";
import { scopedVagaWhere } from "@/lib/auth/scope";
import { getSectorMaps } from "@/lib/sectors";
import { CompanyFilterSelect } from "@/components/shared/CompanyFilterSelect";
import { PageContainer } from "@/components/shared/PageContainer";
import { Pagination } from "@/components/shared/Pagination";
import { EmptyState } from "@/components/ui/EmptyState";
import { VAGA_STATUS_LABEL, VAGA_STATUS_STYLE, VAGA_STATUS_ORDER } from "@/lib/vagaStatus";

const PER_PAGE = 30;

export default async function VagasPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; sectorCode?: string; companyId?: string; page?: string }>;
}) {
  const { status, sectorCode, companyId, page } = await searchParams;
  const ctx = await getAuthContext();
  const { labels: sectorLabels } = await getSectorMaps(ctx.tenantId);

  const statusFilter =
    status && Object.values(VagaStatus).includes(status as VagaStatus)
      ? (status as VagaStatus)
      : undefined;

  const pageNum = Math.max(1, parseInt(page ?? "1"));
  const prisma = getPrisma();
  const where = {
    ...scopedVagaWhere(ctx),
    ...(statusFilter ? { status: statusFilter } : {}),
    ...(sectorCode ? { sectorCode } : {}),
    ...(companyId ? { companyId } : {}),
  };

  const [vagas, total, companies] = await Promise.all([
    prisma.vaga.findMany({
      where,
      orderBy: { openedAt: "desc" },
      skip: (pageNum - 1) * PER_PAGE,
      take: PER_PAGE,
      include: {
        company: { select: { id: true, name: true } },
        _count: { select: { candidaturas: true } },
      },
    }),
    prisma.vaga.count({ where }),
    prisma.company.findMany({
      where: { tenantId: ctx.tenantId, status: "ACTIVE" },
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
  ]);
  const totalPages = Math.ceil(total / PER_PAGE);

  function buildUrl(overrides: Record<string, string | undefined>) {
    const q = new URLSearchParams();
    const merged = { status, sectorCode, companyId, page, ...overrides };
    for (const [k, v] of Object.entries(merged)) if (v) q.set(k, v);
    return `/vagas?${q.toString()}`;
  }

  const canCreateAny = vagas.length === 0
    ? true // ainda não dá pra saber o setor; o form em /vagas/novo faz a checagem real
    : vagas.some((v) => canManageSector(ctx, v.sectorCode));

  return (
    <PageContainer>
      <PageHeader
        title="Vagas"
        subtitle={<>{total} vaga{total !== 1 ? "s" : ""}</>}
        action={<>{canCreateAny && (
          <Button
            href="/vagas/novo"
            variant="primary" className="font-medium"
          >
            + Nova Vaga
          </Button>
        )}</>}
      />
      <div className="flex items-center gap-3 mb-4 flex-wrap">
        {/* "Todas" é um chip de verdade e fica ativo quando não há filtro — antes
            nenhum chip aparecia selecionado nesse estado, e a única saída era um
            link "Limpar" que só existia depois de filtrar. */}
        <div className="flex items-center gap-1 flex-wrap" role="group" aria-label="Filtrar por status">
          <Link
            href={buildUrl({ status: undefined, page: undefined })}
            aria-current={!statusFilter ? "true" : undefined}
            className={`inline-flex items-center h-8 px-3 rounded-md text-[12px] font-medium transition-colors ${
              !statusFilter
                ? "bg-surface-2 text-fg border border-border-strong"
                : "text-fg-muted hover:text-fg hover:bg-surface-2"
            }`}
          >
            Todas
          </Link>
          {VAGA_STATUS_ORDER.map((s) => (
            <Link
              key={s}
              href={buildUrl({ status: s, page: undefined })}
              aria-current={statusFilter === s ? "true" : undefined}
              className={`inline-flex items-center h-8 px-3 rounded-md text-[12px] font-medium transition-colors ${
                statusFilter === s
                  ? "bg-surface-2 text-fg border border-border-strong"
                  : "text-fg-muted hover:text-fg hover:bg-surface-2"
              }`}
            >
              {VAGA_STATUS_LABEL[s]}
            </Link>
          ))}
        </div>

        <CompanyFilterSelect companies={companies} value={companyId ?? ""} />
      </div>

      {vagas.length === 0 ? (
        <Card>
          <EmptyState
            icon={<Briefcase />}
            title="Nenhuma vaga encontrada"
            description="Ajuste os filtros ou cadastre a primeira vaga do setor."
            action={
              canCreateAny && (
                <Button
                  href="/vagas/novo"
                  variant="primary" className="font-medium"
                >
                  + Nova Vaga
                </Button>
              )
            }
          />
        </Card>
      ) : (
        <div className="bg-surface border border-border rounded-lg divide-y divide-border">
          {vagas.map((v) => (
            <Link
              key={v.id}
              href={`/vagas/${v.id}`}
              className="flex items-center justify-between px-4 py-3 hover:bg-surface-2 transition-colors"
            >
              <div>
                <div className="flex items-center gap-2 mb-0.5">
                  <p className="text-[13px] text-fg font-medium">{v.title}</p>
                  <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium border ${VAGA_STATUS_STYLE[v.status]}`}>
                    {VAGA_STATUS_LABEL[v.status]}
                  </span>
                </div>
                <p className="text-[12px] text-fg-muted">
                  {v.company.name} · {sectorLabels[v.sectorCode] ?? v.sectorCode} · {v._count.candidaturas} candidato{v._count.candidaturas !== 1 ? "s" : ""}
                </p>
              </div>
              <span className="text-[12px] text-fg-muted">{v.quantity} vaga{v.quantity !== 1 ? "s" : ""}</span>
            </Link>
          ))}
        </div>
      )}

      <Pagination page={pageNum} totalPages={totalPages} buildHref={(p) => buildUrl({ page: String(p) })} />
    </PageContainer>
  );
}
