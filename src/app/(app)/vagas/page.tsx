import Link from "next/link";
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

const PER_PAGE = 30;

const STATUS_LABEL: Record<VagaStatus, string> = {
  ABERTA:       "Aberta",
  EM_ANDAMENTO: "Em andamento",
  ENCERRADA:    "Encerrada",
  CANCELADA:    "Cancelada",
};

const STATUS_STYLE: Record<VagaStatus, string> = {
  ABERTA:       "bg-brand/10 text-brand border-brand/25",
  EM_ANDAMENTO: "bg-warning/10 text-warning border-warning/25",
  ENCERRADA:    "bg-success/10 text-success border-success/25",
  CANCELADA:    "bg-surface-2 text-fg-muted border-border",
};

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
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-[16px] font-semibold text-fg tracking-[-0.01em]">Vagas</h1>
          <p className="text-[13px] text-fg-muted mt-0.5">
            {total} vaga{total !== 1 ? "s" : ""}
          </p>
        </div>
        {canCreateAny && (
          <Link
            href="/vagas/novo"
            className="inline-flex items-center gap-1.5 h-9 px-4 rounded-md bg-brand text-on-brand text-[13px] font-medium hover:bg-brand-hover transition-colors"
          >
            + Nova Vaga
          </Link>
        )}
      </div>

      <div className="flex items-center gap-3 mb-4">
        <div className="flex items-center gap-1">
          {(["ABERTA", "EM_ANDAMENTO", "ENCERRADA", "CANCELADA"] as VagaStatus[]).map((s) => (
            <Link
              key={s}
              href={buildUrl({ status: s, page: undefined })}
              className={`inline-flex items-center h-8 px-3 rounded-md text-[12px] font-medium transition-colors ${
                statusFilter === s
                  ? "bg-surface-2 text-fg border border-border-strong"
                  : "text-fg-muted hover:text-fg hover:bg-surface-2"
              }`}
            >
              {STATUS_LABEL[s]}
            </Link>
          ))}
          {statusFilter && (
            <Link
              href={buildUrl({ status: undefined, page: undefined })}
              className="text-[12px] text-fg-muted hover:text-fg ml-1"
            >
              Limpar
            </Link>
          )}
        </div>

        <CompanyFilterSelect companies={companies} value={companyId ?? ""} />
      </div>

      {vagas.length === 0 ? (
        <div className="bg-surface border border-border rounded-lg">
          <EmptyState
            icon={<Briefcase />}
            title="Nenhuma vaga encontrada"
            description="Ajuste os filtros ou cadastre a primeira vaga do setor."
            action={
              canCreateAny && (
                <Link
                  href="/vagas/novo"
                  className="inline-flex items-center gap-1.5 h-9 px-4 rounded-md bg-brand text-on-brand text-[13px] font-medium hover:bg-brand-hover transition-colors"
                >
                  + Nova Vaga
                </Link>
              )
            }
          />
        </div>
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
                  <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium border ${STATUS_STYLE[v.status]}`}>
                    {STATUS_LABEL[v.status]}
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
