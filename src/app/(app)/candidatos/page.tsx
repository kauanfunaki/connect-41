import Link from "next/link";
import { UserSearch } from "lucide-react";
import { getPrisma } from "@/lib/prisma";
import { getAuthContext, canWrite } from "@/lib/auth/context";
import { CandidatosTable } from "@/components/candidatos/CandidatosTable";
import { PageContainer } from "@/components/shared/PageContainer";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { formatInstantDate } from "@/lib/format";
import { EmptyState } from "@/components/ui/EmptyState";
import { inativarCandidatosEmMassa } from "./actions";

const PER_PAGE = 20;

export default async function CandidatosPage({
  searchParams,
}: {
  searchParams: Promise<{ search?: string; page?: string; tag?: string }>;
}) {
  const { search, page, tag } = await searchParams;
  const ctx = await getAuthContext();
  const canCreate = canWrite(ctx.role);

  const prisma = getPrisma();
  const pageNum = Math.max(1, parseInt(page ?? "1"));

  const where = {
    tenantId: ctx.tenantId,
    type: "CANDIDATO" as const,
    ...(search ? { name: { contains: search } } : {}),
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

  function buildUrl(params: Record<string, string | undefined>) {
    const q = new URLSearchParams();
    const merged = { search, page, tag, ...params };
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

      <div className="flex items-center gap-3 mb-4">
        <form method="GET" action="/candidatos" className="flex items-center gap-2 flex-wrap">
          <Input
            name="search"
            defaultValue={search ?? ""}
            placeholder="Buscar por nome…"
            className="w-full max-w-xs"
          />
          <Select name="tag" defaultValue={tag ?? ""} className="w-44">
            <option value="">Todas as tags</option>
            {allTags.map((t) => (
              <option key={t.id} value={t.id}>{t.name}</option>
            ))}
          </Select>
          <button
            type="submit"
            className="h-9 px-4 rounded-md border border-border-strong bg-surface-hover text-fg text-[13px] font-medium hover:border-brand transition-colors"
          >
            Filtrar
          </button>
        </form>
      </div>

      {candidatos.length === 0 ? (
        <div className="bg-surface border border-border rounded-lg">
          <EmptyState
            icon={<UserSearch />}
            title={search ? "Nenhum candidato encontrado com esse filtro." : "Nenhum candidato cadastrado ainda."}
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
