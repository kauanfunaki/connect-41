import Link from "next/link";
import { UserSearch } from "lucide-react";
import { getPrisma } from "@/lib/prisma";
import { getAuthContext, canWrite } from "@/lib/auth/context";
import { CandidatosTable } from "@/components/candidatos/CandidatosTable";
import { PageContainer } from "@/components/shared/PageContainer";
import { Pagination } from "@/components/shared/Pagination";
import { DebouncedSearchInput } from "@/components/shared/DebouncedSearchInput";
import { FilterSelect } from "@/components/shared/FilterSelect";
import { FilterButton, FilterButtonSection } from "@/components/ui/FilterButton";
import { formatInstantDate } from "@/lib/format";
import { EmptyState } from "@/components/ui/EmptyState";
import { inativarCandidatosEmMassa } from "./actions";

const PER_PAGE = 20;

// Inativados em massa continuavam poluindo a lista (a coluna Status existia,
// o filtro não) — por isso o default é "ativos", com saída explícita.
const STATUS_FILTERS = [
  { value: "ativos", label: "Ativos" },
  { value: "inativos", label: "Inativos" },
  { value: "todos", label: "Todos" },
] as const;

export default async function CandidatosPage({
  searchParams,
}: {
  searchParams: Promise<{ search?: string; page?: string; tag?: string; status?: string }>;
}) {
  const { search, page, tag, status } = await searchParams;
  const ctx = await getAuthContext();
  const canCreate = canWrite(ctx.role);

  const prisma = getPrisma();
  const pageNum = Math.max(1, parseInt(page ?? "1"));

  const statusFilter = STATUS_FILTERS.some((s) => s.value === status) ? status! : "ativos";
  const activeWhere =
    statusFilter === "todos" ? {} : { active: statusFilter === "ativos" };

  // Busca agora cobre e-mail e CPF além do nome — o banco de talentos era
  // pesquisável só por nome, mas o recrutador chega pelo contato com frequência.
  const searchTerm = search?.trim();
  const searchWhere = searchTerm
    ? {
        OR: [
          { name: { contains: searchTerm } },
          { email: { contains: searchTerm } },
          { cpf: { contains: searchTerm.replace(/\D/g, "") || searchTerm } },
        ],
      }
    : {};

  const where = {
    tenantId: ctx.tenantId,
    type: "CANDIDATO" as const,
    ...activeWhere,
    ...searchWhere,
    ...(tag ? { tags: { some: { tagId: tag } } } : {}),
  };

  const [candidatos, total, allTags] = await Promise.all([
    prisma.person.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (pageNum - 1) * PER_PAGE,
      take: PER_PAGE,
      include: {
        _count: { select: { candidaturas: true } },
        tags: { include: { tag: { select: { id: true, name: true, color: true } } } },
      },
    }),
    prisma.person.count({ where }),
    prisma.tag.findMany({
      where: { tenantId: ctx.tenantId, sectorCode: "recrutamento" },
      orderBy: { name: "asc" },
      select: { id: true, name: true, color: true },
    }),
  ]);

  const totalPages = Math.ceil(total / PER_PAGE);
  const activeFilterCount = (tag ? 1 : 0) + (statusFilter !== "ativos" ? 1 : 0);

  function buildUrl(params: Record<string, string | undefined>) {
    const q = new URLSearchParams();
    const merged = { search, page, tag, status, ...params };
    for (const [k, v] of Object.entries(merged)) {
      if (v) q.set(k, v);
    }
    return `/candidatos?${q.toString()}`;
  }

  return (
    <PageContainer>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-[16px] font-semibold text-fg tracking-[-0.01em]">Candidatos</h1>
          <p className="text-[13px] text-fg-muted mt-0.5">
            {total} candidato{total !== 1 ? "s" : ""} no banco de talentos
          </p>
        </div>
        {canCreate && (
          <Link
            href="/candidatos/nova"
            className="inline-flex items-center gap-1.5 h-9 px-4 rounded-md bg-brand text-on-brand text-[13px] font-medium hover:bg-brand-hover transition-colors"
          >
            + Novo Candidato
          </Link>
        )}
      </div>

      <div className="flex items-center gap-3 mb-4 flex-wrap">
        <div className="w-full max-w-xs">
          <DebouncedSearchInput placeholder="Buscar por nome, e-mail ou CPF…" />
        </div>

        <FilterButton activeCount={activeFilterCount} width={240}>
          {({ close }) => (
            <div className="space-y-3">
              <FilterButtonSection label="Tag">
                <FilterSelect
                  paramName="tag"
                  value={tag ?? ""}
                  emptyLabel="Todas as tags"
                  options={allTags.map((t) => ({ id: t.id, name: t.name }))}
                  className="w-full"
                />
              </FilterButtonSection>

              <FilterButtonSection label="Situação">
                <div className="space-y-0.5" role="group" aria-label="Filtrar por situação">
                  {STATUS_FILTERS.map((s) => (
                    <Link
                      key={s.value}
                      href={buildUrl({ status: s.value, page: undefined })}
                      onClick={close}
                      aria-current={statusFilter === s.value ? "true" : undefined}
                      className={`block px-2.5 py-1.5 rounded-lg text-[13px] font-medium transition-colors ${
                        statusFilter === s.value ? "bg-brand-subtle text-brand" : "text-fg-secondary hover:bg-surface-hover hover:text-fg"
                      }`}
                    >
                      {s.label}
                    </Link>
                  ))}
                </div>
              </FilterButtonSection>
            </div>
          )}
        </FilterButton>
      </div>

      {candidatos.length === 0 ? (
        <div className="bg-surface border border-border rounded-lg">
          <EmptyState
            icon={<UserSearch />}
            title={
              searchTerm || tag || statusFilter !== "ativos"
                ? "Nenhum candidato encontrado com esses filtros."
                : "Nenhum candidato cadastrado ainda."
            }
          />
        </div>
      ) : (
        <CandidatosTable
          candidatos={candidatos.map((c) => ({
            id: c.id,
            name: c.name,
            active: c.active,
            cpf: c.cpf,
            email: c.email,
            candidaturasCount: c._count.candidaturas,
            createdAtLabel: formatInstantDate(c.createdAt),
            tags: c.tags.map((t) => ({ id: t.tag.id, name: t.tag.name, color: t.tag.color })),
          }))}
          canCreate={canCreate}
          inativarCandidatosEmMassa={inativarCandidatosEmMassa}
        />
      )}

      <Pagination page={pageNum} totalPages={totalPages} buildHref={(p) => buildUrl({ page: String(p) })} />
    </PageContainer>
  );
}
