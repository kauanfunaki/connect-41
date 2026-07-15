import Link from "next/link";
import { notFound } from "next/navigation";
import { getPrisma } from "@/lib/prisma";
import { getAuthContext, canWrite } from "@/lib/auth/context";
import { scopedCompanyWhere } from "@/lib/auth/scope";
import { PageContainer } from "@/components/shared/PageContainer";
import { BackButton } from "@/components/shared/BackButton";
import { Badge } from "@/components/ui/Badge";
import { formatInstantDate } from "@/lib/format";

export default async function DocumentosClientePage({
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

  const documentos = await prisma.clientDocument.findMany({
    where: { tenantId: ctx.tenantId, companyId },
    orderBy: { createdAt: "desc" },
    include: { recipients: { select: { firstViewedAt: true } } },
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
        <span className="text-[13px] text-fg">Documentos para Cliente</span>
      </div>

      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-[16px] font-semibold text-fg tracking-[-0.01em]">Documentos para Cliente</h1>
          <p className="text-[13px] text-fg-muted mt-0.5">
            {documentos.length} documento{documentos.length !== 1 ? "s" : ""} — envio por e-mail com prova de recebimento
          </p>
        </div>
        {canManage && (
          <Link
            href={`/empresas/${companyId}/documentos-cliente/novo`}
            className="inline-flex items-center gap-1.5 h-9 px-4 rounded-md bg-brand text-on-brand text-[13px] font-medium hover:bg-brand-hover transition-colors"
          >
            + Novo Documento
          </Link>
        )}
      </div>

      {documentos.length === 0 ? (
        <div className="bg-surface border border-border rounded-lg py-16 text-center text-[13px] text-fg-muted">
          Nenhum documento criado ainda.
        </div>
      ) : (
        <div className="bg-surface border border-border rounded-lg divide-y divide-border">
          {documentos.map((d) => {
            const viewedCount = d.recipients.filter((r) => r.firstViewedAt).length;
            return (
              <Link
                key={d.id}
                href={`/empresas/${companyId}/documentos-cliente/${d.id}`}
                className="flex items-center justify-between px-4 py-3 hover:bg-surface-hover transition-colors"
              >
                <div>
                  <p className="text-[13px] text-fg font-medium">{d.title}</p>
                  <p className="text-[12px] text-fg-muted mt-0.5">
                    criado em {formatInstantDate(d.createdAt)}
                    {d.recipients.length > 0 && ` · ${d.recipients.length} destinatário${d.recipients.length !== 1 ? "s" : ""} (${viewedCount} visualizou${viewedCount !== 1 ? "ram" : ""})`}
                  </p>
                </div>
                <Badge variant={d.status === "PUBLISHED" ? "success" : "warning"}>
                  {d.status === "PUBLISHED" ? "Publicado" : "Rascunho"}
                </Badge>
              </Link>
            );
          })}
        </div>
      )}
    </PageContainer>
  );
}
