import Link from "next/link";
import { getPrisma } from "@/lib/prisma";
import { getAuthContext } from "@/lib/auth/context";

const PENDING_EXAM_STATUSES = new Set(["SOLICITADO", "AGENDADO", "REALIZADO", "ASO_PENDENTE"]);

export default async function AdmissoesPage() {
  const ctx = await getAuthContext();
  const prisma = getPrisma();

  const people = await prisma.person.findMany({
    where: { tenantId: ctx.tenantId, type: "COLABORADOR", employmentStatus: "ADMISSAO_EM_ANDAMENTO" },
    orderBy: { admissionDate: "asc" },
    include: {
      currentCompany: { select: { name: true } },
      cargo: { select: { name: true } },
      exames: { select: { status: true } },
    },
  });

  const personIds = people.map((p) => p.id);
  const docCounts = personIds.length > 0
    ? await prisma.document.groupBy({
        by: ["entityId"],
        where: { tenantId: ctx.tenantId, entityType: "PERSON", entityId: { in: personIds }, category: "ADMISSAO" },
        _count: { _all: true },
      })
    : [];
  const docCountMap = new Map(docCounts.map((d) => [d.entityId, d._count._all]));

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <div className="mb-6">
        <h1 className="text-[16px] font-semibold text-fg tracking-[-0.01em]">Admissões em Andamento</h1>
        <p className="text-[13px] text-fg-muted mt-0.5">
          {people.length} colaborador{people.length !== 1 ? "es" : ""} em processo de admissão
        </p>
      </div>

      {people.length === 0 ? (
        <div className="bg-surface border border-border rounded-lg py-16 text-center text-[13px] text-fg-muted">
          Nenhuma admissão em andamento no momento.
        </div>
      ) : (
        <div className="bg-surface border border-border rounded-lg divide-y divide-border">
          {people.map((p) => {
            const pendingExams = p.exames.filter((e) => PENDING_EXAM_STATUSES.has(e.status)).length;
            const docCount = docCountMap.get(p.id) ?? 0;
            return (
              <Link
                key={p.id}
                href={`/pessoas/${p.id}`}
                className="flex items-center justify-between px-4 py-3 hover:bg-surface-2 transition-colors"
              >
                <div>
                  <p className="text-[13px] text-fg font-medium">{p.name}</p>
                  <p className="text-[12px] text-fg-muted">
                    {[p.currentCompany?.name, p.cargo?.name].filter(Boolean).join(" · ") || "Sem empresa/cargo definidos"}
                  </p>
                </div>
                <div className="flex items-center gap-4 text-[12px] text-fg-muted">
                  <span>
                    {p.exames.length === 0
                      ? "Nenhum exame"
                      : pendingExams > 0
                        ? `${pendingExams} exame${pendingExams !== 1 ? "s" : ""} pendente${pendingExams !== 1 ? "s" : ""}`
                        : "Exames concluídos"}
                  </span>
                  <span>{docCount} documento{docCount !== 1 ? "s" : ""} de admissão</span>
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
