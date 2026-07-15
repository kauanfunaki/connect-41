import Link from "next/link";
import { notFound } from "next/navigation";
import { getPrisma } from "@/lib/prisma";
import { getAuthContext, canWrite } from "@/lib/auth/context";
import { scopedCompanyWhere } from "@/lib/auth/scope";
import { DeleteFieldButton } from "@/components/admin/DeleteFieldButton";
import { PageContainer } from "@/components/shared/PageContainer";
import { EmptyState } from "@/components/ui/EmptyState";
import { BackButton } from "@/components/shared/BackButton";
import { excluirTurno } from "./actions";

export default async function TurnosPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: companyId } = await params;
  const ctx = await getAuthContext();
  const canManage = canWrite(ctx.role);

  const prisma = getPrisma();
  const company = await prisma.company.findFirst({
    where: { id: companyId, ...(await scopedCompanyWhere(ctx)) },
    select: { id: true, name: true },
  });
  if (!company) notFound();

  const turnos = await prisma.workShift.findMany({
    where: { tenantId: ctx.tenantId, companyId },
    orderBy: { name: "asc" },
  });

  return (
    <PageContainer>
      <BackButton className="mb-3" />
      <div className="flex items-center gap-2 mb-6">
        <Link href="/empresas" className="text-[13px] text-fg-muted hover:text-fg transition-colors">Empresas</Link>
        <span className="text-fg-muted">/</span>
        <Link href={`/empresas/${companyId}`} className="text-[13px] text-fg-muted hover:text-fg transition-colors truncate max-w-[200px]">
          {company.name}
        </Link>
        <span className="text-fg-muted">/</span>
        <span className="text-[13px] text-fg">Turnos</span>
      </div>

      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-[16px] font-semibold text-fg tracking-[-0.01em]">Turnos</h1>
          <p className="text-[13px] text-fg-muted mt-0.5">
            {turnos.length} turno{turnos.length !== 1 ? "s" : ""} cadastrado{turnos.length !== 1 ? "s" : ""} nesta empresa
          </p>
        </div>
        {canManage && (
          <Link
            href={`/empresas/${companyId}/turnos/novo`}
            className="inline-flex items-center gap-1.5 h-9 px-4 rounded-md bg-brand text-on-brand text-[13px] font-medium hover:bg-brand-hover transition-colors"
          >
            + Novo Turno
          </Link>
        )}
      </div>

      {turnos.length === 0 ? (
        <div className="bg-surface border border-border rounded-lg">
          <EmptyState title="Nenhum turno cadastrado ainda." />
        </div>
      ) : (
        <div className="bg-surface border border-border rounded-lg divide-y divide-border">
          {turnos.map((t) => (
            <div key={t.id} className="flex items-center justify-between px-4 py-3">
              <div>
                <p className="text-[13px] text-fg font-medium">{t.name}</p>
                <p className="text-[12px] text-fg-muted">{t.startTime} — {t.endTime}</p>
              </div>
              {canManage && (
                <div className="flex items-center gap-3">
                  <Link
                    href={`/empresas/${companyId}/turnos/${t.id}/editar`}
                    className="text-[12px] text-fg-muted hover:text-fg transition-colors"
                  >
                    Editar
                  </Link>
                  <DeleteFieldButton action={excluirTurno.bind(null, t.id, companyId)} nome={t.name} />
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </PageContainer>
  );
}
