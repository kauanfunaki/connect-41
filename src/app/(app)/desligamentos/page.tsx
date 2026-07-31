import Link from "next/link";
import { Card } from "@/components/ui/Card";
import { PageHeader } from "@/components/ui/PageHeader";
import { UserMinus } from "lucide-react";
import { getPrisma } from "@/lib/prisma";
import { getAuthContext } from "@/lib/auth/context";
import { PageContainer } from "@/components/shared/PageContainer";
import { TerminationStatus } from "@/generated/prisma/enums";
import { formatInstantDate } from "@/lib/format";
import { EmptyState } from "@/components/ui/EmptyState";

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
      <PageHeader
        title="Desligamentos em Andamento"
        subtitle={<>{terminations.length} desligamento{terminations.length !== 1 ? "s" : ""} em processo</>}
      />

      {terminations.length === 0 ? (
        <Card>
          <EmptyState icon={<UserMinus />} title="Nenhum desligamento em andamento" description="Desligamentos iniciados na ficha de cada pessoa aparecem aqui enquanto estiverem em andamento." />
        </Card>
      ) : (
        <Card className="divide-y divide-border">
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
        </Card>
      )}
    </PageContainer>
  );
}
