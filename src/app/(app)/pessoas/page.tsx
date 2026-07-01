import Link from "next/link";
import { getPrisma } from "@/lib/prisma";
import { PersonType } from "@/generated/prisma/enums";
import { getAuthContext, canWrite } from "@/lib/auth/context";
import { scopedPersonWhere } from "@/lib/auth/scope";

const TYPE_LABEL: Record<PersonType, string> = {
  CANDIDATO:   "Candidato",
  COLABORADOR: "Colaborador",
};

const TYPE_STYLE: Record<PersonType, string> = {
  CANDIDATO:   "bg-brand/10 text-brand border-brand/25",
  COLABORADOR: "bg-success/10 text-success border-success/25",
};

const FILTER_TABS: { value: PersonType; label: string }[] = [
  { value: "CANDIDATO",   label: "Candidatos" },
  { value: "COLABORADOR", label: "Colaboradores" },
];

const PER_PAGE = 20;

export default async function PessoasPage({
  searchParams,
}: {
  searchParams: Promise<{ search?: string; type?: string; page?: string }>;
}) {
  const { search, type, page } = await searchParams;
  const ctx = await getAuthContext();
  const canCreate = canWrite(ctx.role);

  const prisma = getPrisma();
  const pageNum = Math.max(1, parseInt(page ?? "1"));
  const typeFilter =
    type && Object.values(PersonType).includes(type as PersonType)
      ? (type as PersonType)
      : undefined;

  const where = {
    ...(await scopedPersonWhere(ctx)),
    ...(search ? { name: { contains: search } } : {}),
    ...(typeFilter ? { type: typeFilter } : {}),
  };

  const [people, total] = await Promise.all([
    prisma.person.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (pageNum - 1) * PER_PAGE,
      take: PER_PAGE,
      include: { currentCompany: { select: { id: true, name: true } } },
    }),
    prisma.person.count({ where }),
  ]);

  const totalPages = Math.ceil(total / PER_PAGE);

  function buildUrl(params: Record<string, string | undefined>) {
    const q = new URLSearchParams();
    const merged = { search, type, page, ...params };
    for (const [k, v] of Object.entries(merged)) {
      if (v) q.set(k, v);
    }
    return `/pessoas?${q.toString()}`;
  }

  return (
    <div className="p-6 max-w-6xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-[20px] font-semibold text-fg tracking-[-0.01em]">Pessoas</h1>
          <p className="text-[13px] text-fg-muted mt-0.5">
            {total} pessoa{total !== 1 ? "s" : ""} cadastrada{total !== 1 ? "s" : ""}
          </p>
        </div>
        {canCreate && (
          <Link
            href="/pessoas/nova"
            className="inline-flex items-center gap-1.5 h-9 px-4 rounded-md bg-brand text-on-brand text-[13px] font-medium hover:bg-brand-hover transition-colors"
          >
            + Nova Pessoa
          </Link>
        )}
      </div>

      {/* Filters */}
      <div className="flex items-center gap-3 mb-4">
        <form method="GET" action="/pessoas" className="flex-1 max-w-xs">
          {typeFilter && <input type="hidden" name="type" value={typeFilter} />}
          <input
            name="search"
            defaultValue={search ?? ""}
            placeholder="Buscar por nome…"
            className="w-full h-8 px-3 rounded-md border border-border bg-canvas text-[13px] text-fg placeholder:text-fg-muted outline-none focus:border-brand focus:ring-2 focus:ring-brand/20 transition-colors"
          />
        </form>

        <div className="flex items-center gap-1">
          {FILTER_TABS.map((tab) => {
            const isActive = tab.value === typeFilter;
            return (
              <Link
                key={tab.value}
                href={buildUrl({ type: tab.value, page: "1" })}
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
      <div className="bg-surface border border-border rounded-lg overflow-hidden">
        {people.length === 0 ? (
          <div className="py-16 text-center text-[13px] text-fg-muted">
            {search || typeFilter
              ? "Nenhuma pessoa encontrada com esses filtros."
              : "Nenhuma pessoa cadastrada ainda."}
          </div>
        ) : (
          <table className="w-full text-[13px]">
            <thead>
              <tr className="border-b border-border bg-surface-2">
                <th className="text-left px-4 py-2.5 font-medium text-fg-muted">Nome</th>
                <th className="text-left px-4 py-2.5 font-medium text-fg-muted">Tipo</th>
                <th className="text-left px-4 py-2.5 font-medium text-fg-muted">CPF</th>
                <th className="text-left px-4 py-2.5 font-medium text-fg-muted">E-mail</th>
                <th className="text-left px-4 py-2.5 font-medium text-fg-muted">Empresa</th>
                <th className="text-left px-4 py-2.5 font-medium text-fg-muted">Criada em</th>
                <th className="px-4 py-2.5" />
              </tr>
            </thead>
            <tbody>
              {people.map((p) => (
                <tr
                  key={p.id}
                  className="border-b border-border last:border-0 hover:bg-surface-2 transition-colors"
                >
                  <td className="px-4 py-2.5">
                    <Link
                      href={`/pessoas/${p.id}`}
                      className="font-medium text-fg hover:text-brand transition-colors"
                    >
                      {p.name}
                    </Link>
                  </td>
                  <td className="px-4 py-2.5">
                    <span
                      className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium border ${TYPE_STYLE[p.type]}`}
                    >
                      {TYPE_LABEL[p.type]}
                    </span>
                  </td>
                  <td className="px-4 py-2.5 text-fg-muted tnum">{p.cpf ?? "—"}</td>
                  <td className="px-4 py-2.5 text-fg-muted">{p.email ?? "—"}</td>
                  <td className="px-4 py-2.5 text-fg-muted">
                    {p.currentCompany ? (
                      <Link
                        href={`/empresas/${p.currentCompany.id}`}
                        className="hover:text-brand transition-colors"
                      >
                        {p.currentCompany.name}
                      </Link>
                    ) : (
                      "—"
                    )}
                  </td>
                  <td className="px-4 py-2.5 text-fg-muted tnum">
                    {p.createdAt.toLocaleDateString("pt-BR")}
                  </td>
                  <td className="px-4 py-2.5 text-right">
                    {canCreate && (
                      <Link
                        href={`/pessoas/${p.id}/editar`}
                        className="text-[12px] text-fg-muted hover:text-fg transition-colors"
                      >
                        Editar
                      </Link>
                    )}
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
