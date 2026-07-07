import Link from "next/link";
import { PageContainer } from "@/components/shared/PageContainer";
import { getPrisma } from "@/lib/prisma";
import { CompanyStatus } from "@/generated/prisma/enums";
import { getAuthContext, canWrite } from "@/lib/auth/context";
import { scopedCompanyWhere } from "@/lib/auth/scope";
import { EmpresasTable } from "@/components/empresas/EmpresasTable";
import { atualizarStatusEmMassa, excluirEmpresasEmMassa } from "./actions";

const STATUS_LABEL: Record<CompanyStatus, string> = {
  PROSPECT: "Prospecto",
  ACTIVE:   "Ativo",
  INACTIVE: "Inativo",
  CHURNED:  "Cancelado",
};

const STATUS_COLOR: Record<CompanyStatus, string> = {
  PROSPECT: "var(--c41-warning)",
  ACTIVE:   "var(--c41-success)",
  INACTIVE: "var(--c41-neutral-400)",
  CHURNED:  "var(--c41-danger)",
};

const FILTER_TABS: { value: CompanyStatus; label: string }[] = [
  { value: "ACTIVE",   label: "Ativo" },
  { value: "INACTIVE", label: "Inativo" },
  { value: "CHURNED",  label: "Cancelado" },
];

const PER_PAGE = 20;

export default async function EmpresasPage({
  searchParams,
}: {
  searchParams: Promise<{ search?: string; status?: string; page?: string }>;
}) {
  const { search, status, page } = await searchParams;
  const ctx = await getAuthContext();
  const canCreate = canWrite(ctx.role);
  const isSuperAdmin = ctx.role === "SUPER_ADMIN";

  const prisma = getPrisma();
  const pageNum = Math.max(1, parseInt(page ?? "1"));
  const statusFilter =
    status && Object.values(CompanyStatus).includes(status as CompanyStatus)
      ? (status as CompanyStatus)
      : undefined;

  const where = {
    ...(await scopedCompanyWhere(ctx)),
    ...(search ? { name: { contains: search } } : {}),
    ...(statusFilter ? { status: statusFilter } : {}),
  };

  const [companies, total] = await Promise.all([
    prisma.company.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (pageNum - 1) * PER_PAGE,
      take: PER_PAGE,
    }),
    prisma.company.count({ where }),
  ]);

  const totalPages = Math.ceil(total / PER_PAGE);

  function buildUrl(params: Record<string, string | undefined>) {
    const q = new URLSearchParams();
    const merged = { search, status, page, ...params };
    for (const [k, v] of Object.entries(merged)) {
      if (v) q.set(k, v);
    }
    return `/empresas?${q.toString()}`;
  }

  return (
    <PageContainer>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-[16px] font-semibold text-fg tracking-[-0.01em]">
            Empresas
          </h1>
          <p className="text-[13px] text-fg-muted mt-0.5">
            {total} empresa{total !== 1 ? "s" : ""} cadastrada{total !== 1 ? "s" : ""}
          </p>
        </div>
        {canCreate && (
          <Link
            href="/empresas/nova"
            className="inline-flex items-center gap-1.5 h-9 px-4 rounded-md bg-brand text-on-brand text-[13px] font-medium hover:bg-brand-hover transition-colors"
          >
            + Nova Empresa
          </Link>
        )}
      </div>

      {/* Filters */}
      <div className="flex items-center gap-3 mb-4">
        {/* Search */}
        <form method="GET" action="/empresas" className="flex-1 max-w-xs">
          {statusFilter && (
            <input type="hidden" name="status" value={statusFilter} />
          )}
          <input
            name="search"
            defaultValue={search ?? ""}
            placeholder="Buscar por nome…"
            className="w-full h-8 px-3 rounded-md border border-border bg-canvas text-[13px] text-fg placeholder:text-fg-muted outline-none focus:border-brand focus:ring-2 focus:ring-brand/20 transition-colors"
          />
        </form>

        {/* Status tabs */}
        <div className="flex items-center gap-1">
          {FILTER_TABS.map((tab) => {
            const isActive = tab.value === statusFilter;
            return (
              <Link
                key={tab.value}
                href={buildUrl({ status: tab.value, page: "1" })}
                className={`inline-flex items-center h-8 px-3 rounded-md text-[12px] font-medium transition-colors ${
                  isActive
                    ? "bg-surface-2 text-fg border border-border-strong"
                    : "text-fg-muted hover:text-fg hover:bg-surface-2"
                }`}
              >
                {tab.label}
              </Link>
            );
          })}
        </div>
      </div>

      {/* Table */}
      {companies.length === 0 ? (
        <div className="bg-surface border border-border rounded-lg py-16 text-center text-[13px] text-fg-muted">
          {search || statusFilter
            ? "Nenhuma empresa encontrada com esses filtros."
            : "Nenhuma empresa cadastrada ainda."}
        </div>
      ) : (
        <EmpresasTable
          companies={companies.map((c) => ({
            id: c.id,
            name: c.name,
            cnpj: c.cnpj,
            status: c.status,
            email: c.email,
            createdAtLabel: c.createdAt.toLocaleDateString("pt-BR"),
          }))}
          canCreate={canCreate}
          isSuperAdmin={isSuperAdmin}
          statusLabel={STATUS_LABEL}
          statusColor={STATUS_COLOR}
          atualizarStatusEmMassa={atualizarStatusEmMassa}
          excluirEmpresasEmMassa={excluirEmpresasEmMassa}
        />
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between mt-4">
          <span className="text-[12px] text-fg-muted">
            Página {pageNum} de {totalPages}
          </span>
          <div className="flex gap-1">
            {pageNum > 1 && (
              <Link
                href={buildUrl({ page: String(pageNum - 1) })}
                className="h-8 px-3 rounded-md text-[12px] text-fg-muted hover:bg-surface-2 hover:text-fg transition-colors flex items-center"
              >
                ← Anterior
              </Link>
            )}
            {pageNum < totalPages && (
              <Link
                href={buildUrl({ page: String(pageNum + 1) })}
                className="h-8 px-3 rounded-md text-[12px] text-fg-muted hover:bg-surface-2 hover:text-fg transition-colors flex items-center"
              >
                Próxima →
              </Link>
            )}
          </div>
        </div>
      )}
    </PageContainer>
  );
}
