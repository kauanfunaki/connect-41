import { headers } from "next/headers";
import Link from "next/link";
import { getPrisma } from "@/lib/prisma";
import { CompanyStatus } from "@/generated/prisma/enums";

const STATUS_LABEL: Record<CompanyStatus, string> = {
  PROSPECT: "Prospecto",
  ACTIVE: "Ativo",
  INACTIVE: "Inativo",
  CHURNED: "Cancelado",
};

const STATUS_STYLE: Record<CompanyStatus, string> = {
  PROSPECT: "bg-warning/10 text-warning border-warning/25",
  ACTIVE:   "bg-success/10 text-success border-success/25",
  INACTIVE: "bg-surface-2 text-fg-muted border-border",
  CHURNED:  "bg-danger/10 text-danger border-danger/25",
};

const PER_PAGE = 20;

export default async function EmpresasPage({
  searchParams,
}: {
  searchParams: Promise<{ search?: string; status?: string; page?: string }>;
}) {
  const { search, status, page } = await searchParams;
  const h = await headers();
  const tenantId = h.get("x-tenant-id")!;

  const prisma = getPrisma();
  const pageNum = Math.max(1, parseInt(page ?? "1"));
  const statusFilter =
    status && Object.values(CompanyStatus).includes(status as CompanyStatus)
      ? (status as CompanyStatus)
      : undefined;

  const where = {
    tenantId,
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
    <div className="p-6 max-w-6xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-[20px] font-semibold text-fg tracking-[-0.01em]">
            Empresas
          </h1>
          <p className="text-[13px] text-fg-muted mt-0.5">
            {total} empresa{total !== 1 ? "s" : ""} cadastrada{total !== 1 ? "s" : ""}
          </p>
        </div>
        <Link
          href="/empresas/nova"
          className="inline-flex items-center gap-1.5 h-9 px-4 rounded-md bg-brand text-on-brand text-[13px] font-medium hover:bg-brand-hover transition-colors"
        >
          + Nova Empresa
        </Link>
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
          {([undefined, ...Object.values(CompanyStatus)] as (CompanyStatus | undefined)[]).map(
            (s) => {
              const isActive = s === statusFilter;
              return (
                <Link
                  key={s ?? "all"}
                  href={buildUrl({ status: s, page: "1" })}
                  className={`inline-flex items-center h-8 px-3 rounded-md text-[12px] font-medium transition-colors ${
                    isActive
                      ? "bg-surface-2 text-fg border border-border-strong"
                      : "text-fg-muted hover:text-fg hover:bg-surface-2"
                  }`}
                >
                  {s ? STATUS_LABEL[s] : "Todos"}
                </Link>
              );
            }
          )}
        </div>
      </div>

      {/* Table */}
      <div className="bg-surface border border-border rounded-lg overflow-hidden">
        {companies.length === 0 ? (
          <div className="py-16 text-center text-[13px] text-fg-muted">
            {search || statusFilter
              ? "Nenhuma empresa encontrada com esses filtros."
              : "Nenhuma empresa cadastrada ainda."}
          </div>
        ) : (
          <table className="w-full text-[13px]">
            <thead>
              <tr className="border-b border-border bg-surface-2">
                <th className="text-left px-4 py-2.5 font-medium text-fg-muted">Nome</th>
                <th className="text-left px-4 py-2.5 font-medium text-fg-muted">CNPJ</th>
                <th className="text-left px-4 py-2.5 font-medium text-fg-muted">Status</th>
                <th className="text-left px-4 py-2.5 font-medium text-fg-muted">E-mail</th>
                <th className="text-left px-4 py-2.5 font-medium text-fg-muted">Criada em</th>
              </tr>
            </thead>
            <tbody>
              {companies.map((c) => (
                <tr
                  key={c.id}
                  className="border-b border-border last:border-0 hover:bg-surface-2 transition-colors"
                >
                  <td className="px-4 py-2.5">
                    <Link
                      href={`/empresas/${c.id}`}
                      className="font-medium text-fg hover:text-brand transition-colors"
                    >
                      {c.name}
                    </Link>
                  </td>
                  <td className="px-4 py-2.5 text-fg-muted tnum">
                    {c.cnpj ?? "—"}
                  </td>
                  <td className="px-4 py-2.5">
                    <span
                      className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium border ${STATUS_STYLE[c.status]}`}
                    >
                      {STATUS_LABEL[c.status]}
                    </span>
                  </td>
                  <td className="px-4 py-2.5 text-fg-muted">{c.email ?? "—"}</td>
                  <td className="px-4 py-2.5 text-fg-muted tnum">
                    {c.createdAt.toLocaleDateString("pt-BR")}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

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
    </div>
  );
}
