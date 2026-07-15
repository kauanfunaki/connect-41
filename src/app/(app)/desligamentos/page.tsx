import Link from "next/link";
import { getPrisma } from "@/lib/prisma";
import { getAuthContext } from "@/lib/auth/context";
import { PageContainer } from "@/components/shared/PageContainer";
import { TerminationStatus } from "@/generated/prisma/enums";
import { formatInstantDate } from "@/lib/format";

const STATUS_LABEL: Record<TerminationStatus, string> = {
  SOLICITADO:            "Solicitado",
  EM_CALCULO:            "Em cálculo",
  DOCUMENTACAO_PENDENTE: "Documentação pendente",
  ASSINATURA_PENDENTE:   "Assinatura pendente",
  FINALIZADO:            "Finalizado",
  CANCELADO:             "Cancelado",
};

export default async function DesligamentosPage() {
  const ctx = await getAuthContext();
  const prisma = getPrisma();

  const terminations = await prisma.termination.findMany({
    where: { tenantId: ctx.tenantId, status: { notIn: ["FINALIZADO", "CANCELADO"] } },
    orderBy: { requestedAt: "asc" },
    include: { person: { select: { id: true, name: true } } },
  });

  return (
    <PageContainer>
      <div className="mb-6">
        <h1 className="text-[16px] font-semibold text-fg tracking-[-0.01em]">Desligamentos em Andamento</h1>
        <p className="text-[13px] text-fg-muted mt-0.5">
          {terminations.length} desligamento{terminations.length !== 1 ? "s" : ""} em processo
        </p>
      </div>

      {terminations.length === 0 ? (
        <div className="bg-surface border border-border rounded-lg py-16 text-center text-[13px] text-fg-muted">
          Nenhum desligamento em andamento.
        </div>
      ) : (
        <div className="bg-surface border border-border rounded-lg divide-y divide-border">
          {terminations.map((t) => (
            <Link
              key={t.id}
              href={`/pessoas/${t.person.id}`}
              className="flex items-center justify-between px-4 py-3 hover:bg-surface-2 transition-colors"
            >
              <p className="text-[13px] text-fg">{t.person.name}</p>
              <span className="text-[12px] text-fg-muted">
                {STATUS_LABEL[t.status]} · solicitado em {formatInstantDate(t.requestedAt)}
              </span>
            </Link>
          ))}
        </div>
      )}
    </PageContainer>
  );
}
