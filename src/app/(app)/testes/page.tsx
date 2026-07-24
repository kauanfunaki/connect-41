import Link from "next/link";
import { ClipboardList } from "lucide-react";
import { getPrisma } from "@/lib/prisma";
import { getAuthContext, canWrite, canActOnSector } from "@/lib/auth/context";
import { scopedAssessmentLinkWhere, scopedPersonWhere } from "@/lib/auth/scope";
import { PageContainer } from "@/components/shared/PageContainer";
import { Pagination } from "@/components/shared/Pagination";
import { EmptyState } from "@/components/ui/EmptyState";
import { NovoTesteForm } from "@/components/teste/NovoTesteForm";
import { formatInstantDate } from "@/lib/format";
import type { AssessmentLinkStatus } from "@/generated/prisma/enums";

const PER_PAGE = 30;
const SECTOR = "recrutamento";

const STATUS_LABEL: Record<AssessmentLinkStatus, string> = {
  PENDENTE: "Pendente",
  RESPONDIDO: "Respondido",
};

const STATUS_STYLE: Record<AssessmentLinkStatus, string> = {
  PENDENTE: "bg-warning/10 text-warning border-warning/25",
  RESPONDIDO: "bg-success/10 text-success border-success/25",
};

export default async function TestesPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; page?: string }>;
}) {
  const { status, page } = await searchParams;
  const ctx = await getAuthContext();

  const statusFilter =
    status && (["PENDENTE", "RESPONDIDO"] as string[]).includes(status) ? (status as AssessmentLinkStatus) : undefined;

  const pageNum = Math.max(1, parseInt(page ?? "1"));
  const prisma = getPrisma();
  const where = {
    ...scopedAssessmentLinkWhere(ctx),
    ...(statusFilter ? { status: statusFilter } : {}),
  };

  const canCreate = canWrite(ctx.role) && canActOnSector(ctx, SECTOR);

  const [links, total, candidatos] = await Promise.all([
    prisma.assessmentLink.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (pageNum - 1) * PER_PAGE,
      take: PER_PAGE,
      include: {
        person: { select: { id: true, name: true } },
        candidatura: { select: { id: true, vaga: { select: { id: true, title: true } } } },
      },
    }),
    prisma.assessmentLink.count({ where }),
    canCreate
      ? prisma.person.findMany({
          where: { type: "CANDIDATO", ...(await scopedPersonWhere(ctx)) },
          orderBy: { name: "asc" },
          select: { id: true, name: true },
        })
      : Promise.resolve([]),
  ]);
  const totalPages = Math.ceil(total / PER_PAGE);

  function buildUrl(overrides: Record<string, string | undefined>) {
    const q = new URLSearchParams();
    const merged = { status, page, ...overrides };
    for (const [k, v] of Object.entries(merged)) if (v) q.set(k, v);
    return `/testes?${q.toString()}`;
  }

  return (
    <PageContainer>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-[16px] font-semibold text-fg tracking-[-0.01em]">Testes</h1>
          <p className="text-[13px] text-fg-muted mt-0.5">
            {total} teste{total !== 1 ? "s" : ""}
          </p>
        </div>
      </div>

      {canCreate && <NovoTesteForm candidatos={candidatos} />}

      <div className="flex items-center gap-1 mb-4">
        {(["PENDENTE", "RESPONDIDO"] as AssessmentLinkStatus[]).map((s) => (
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
          <Link href={buildUrl({ status: undefined, page: undefined })} className="text-[12px] text-fg-muted hover:text-fg ml-1">
            Limpar
          </Link>
        )}
      </div>

      {links.length === 0 ? (
        <div className="bg-surface border border-border rounded-lg">
          <EmptyState
            icon={<ClipboardList />}
            title="Nenhum teste encontrado"
            description="Ajuste os filtros ou envie o primeiro teste DISC pra um candidato acima."
          />
        </div>
      ) : (
        <div className="bg-surface border border-border rounded-lg divide-y divide-border">
          {links.map((l) => (
            <Link key={l.id} href={`/testes/${l.id}`} className="flex items-center justify-between px-4 py-3 hover:bg-surface-2 transition-colors">
              <div>
                <div className="flex items-center gap-2 mb-0.5">
                  <p className="text-[13px] text-fg font-medium">{l.person.name}</p>
                  <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium border ${STATUS_STYLE[l.status]}`}>
                    {STATUS_LABEL[l.status]}
                  </span>
                  {l.primaryProfile && (
                    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium border bg-brand/10 text-brand border-brand/25">
                      Perfil {l.primaryProfile}
                      {l.secondaryProfile ?? ""}
                    </span>
                  )}
                </div>
                <p className="text-[12px] text-fg-muted">
                  DISC{l.candidatura ? ` · ${l.candidatura.vaga.title}` : ""} · enviado em {formatInstantDate(l.createdAt)}
                </p>
              </div>
            </Link>
          ))}
        </div>
      )}

      <Pagination page={pageNum} totalPages={totalPages} buildHref={(p) => buildUrl({ page: String(p) })} />
    </PageContainer>
  );
}
