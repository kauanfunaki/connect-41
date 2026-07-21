import Link from "next/link";
import { Users } from "lucide-react";
import { getPrisma } from "@/lib/prisma";
import { PersonType } from "@/generated/prisma/enums";
import { getAuthContext, canWrite } from "@/lib/auth/context";
import { scopedPersonWhere } from "@/lib/auth/scope";
import { PessoasTable } from "@/components/pessoas/PessoasTable";
import { CompanyFilterSelect } from "@/components/shared/CompanyFilterSelect";
import { PageContainer } from "@/components/shared/PageContainer";
import { EmptyState } from "@/components/ui/EmptyState";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { formatInstantDate } from "@/lib/format";
import { inativarPessoasEmMassa } from "./actions";

const PER_PAGE = 20;

export default async function PessoasPage({
  searchParams,
}: {
  searchParams: Promise<{ search?: string; companyId?: string; page?: string }>;
}) {
  const { search, companyId, page } = await searchParams;
  const ctx = await getAuthContext();
  const canCreate = canWrite(ctx.role);

  const prisma = getPrisma();
  const pageNum = Math.max(1, parseInt(page ?? "1"));

  const where = {
    ...(await scopedPersonWhere(ctx)),
    type: PersonType.COLABORADOR,
    ...(search ? { name: { contains: search } } : {}),
    ...(companyId ? { currentCompanyId: companyId } : {}),
  };

  const [people, total, companies] = await Promise.all([
    prisma.person.findMany({
      where,
      orderBy: { name: "asc" },
      skip: (pageNum - 1) * PER_PAGE,
      take: PER_PAGE,
      include: { currentCompany: { select: { id: true, name: true } } },
    }),
    prisma.person.count({ where }),
    prisma.company.findMany({
      where: { tenantId: ctx.tenantId, status: "ACTIVE" },
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
  ]);

  const totalPages = Math.ceil(total / PER_PAGE);

  function buildUrl(params: Record<string, string | undefined>) {
    const q = new URLSearchParams();
    const merged = { search, companyId, page, ...params };
    for (const [k, v] of Object.entries(merged)) {
      if (v) q.set(k, v);
    }
    return `/pessoas?${q.toString()}`;
  }

  return (
    <PageContainer>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-[16px] font-semibold text-fg tracking-[-0.01em]">Pessoas</h1>
          <p className="text-[13px] text-fg-muted mt-0.5">
            {total} colaborador{total !== 1 ? "es" : ""} cadastrado{total !== 1 ? "s" : ""}
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
          {companyId && <input type="hidden" name="companyId" value={companyId} />}
          <Input
            name="search"
            defaultValue={search ?? ""}
            placeholder="Buscar por nome…"
          />
        </form>

        <CompanyFilterSelect companies={companies} value={companyId ?? ""} />

        {companyId && (
          <Link href={buildUrl({ companyId: undefined, page: "1" })} className="text-[12px] text-fg-muted hover:text-fg">
            Limpar
          </Link>
        )}
      </div>

      {/* Table */}
      {people.length === 0 ? (
        <div className="bg-surface border border-border rounded-2xl">
          <EmptyState
            icon={<Users />}
            title={search || companyId ? "Nenhuma pessoa encontrada" : "Nenhuma pessoa cadastrada ainda"}
            description={
              search || companyId
                ? "Tente ajustar a busca ou os filtros."
                : "Comece cadastrando a primeira pessoa do tenant."
            }
            action={
              !search && !companyId && canCreate ? (
                <Link href="/pessoas/nova"><Button>+ Nova Pessoa</Button></Link>
              ) : undefined
            }
          />
        </div>
      ) : (
        <PessoasTable
          people={people.map((p) => ({
            id: p.id,
            name: p.name,
            active: p.active,
            cpf: p.cpf,
            email: p.email,
            photoUrl: p.photoUrl,
            companyName: p.currentCompany?.name ?? null,
            companyId: p.currentCompany?.id ?? null,
            createdAtLabel: formatInstantDate(p.createdAt),
          }))}
          canCreate={canCreate}
          inativarPessoasEmMassa={inativarPessoasEmMassa}
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
