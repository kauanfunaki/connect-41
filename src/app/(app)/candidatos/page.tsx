import { Button } from "@/components/ui/Button";
import { PageHeader } from "@/components/ui/PageHeader";
import { UserSearch } from "lucide-react";
import { getPrisma } from "@/lib/prisma";
import { getAuthContext, canWrite } from "@/lib/auth/context";
import { CandidatosTable } from "@/components/candidatos/CandidatosTable";
import { PageContainer } from "@/components/shared/PageContainer";
import { Pagination } from "@/components/shared/Pagination";
import { DebouncedSearchInput } from "@/components/shared/DebouncedSearchInput";
import { CandidatosFilterButton } from "@/components/candidatos/CandidatosFilterButton";
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
      <PageHeader
        title="Candidatos"
        subtitle={<>{total} candidato{total !== 1 ? "s" : ""} no banco de talentos</>}
        action={<>{canCreate && (
          <Button
            href="/candidatos/nova"
            variant="primary" className="font-medium"
          >
            + Novo Candidato
          </Button>
        )}</>}
      />
      <div className="flex items-center gap-3 mb-4 flex-wrap">
        <div className="w-full max-w-xs">
          <DebouncedSearchInput placeholder="Buscar por nome, e-mail ou CPF…" />
        </div>

        <CandidatosFilterButton
          search={search}
          page={page}
          tag={tag}
          statusFilter={statusFilter}
          tags={allTags}
          statusFilters={STATUS_FILTERS}
          activeCount={activeFilterCount}
        />
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
