import Link from "next/link";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { notFound } from "next/navigation";
import { FileText } from "lucide-react";
import { getPrisma } from "@/lib/prisma";
import { getAuthContext, canWrite } from "@/lib/auth/context";
import { scopedCompanyWhere } from "@/lib/auth/scope";
import { PageContainer } from "@/components/shared/PageContainer";
import { Breadcrumb } from "@/components/shared/Breadcrumb";
import { PageHeader } from "@/components/ui/PageHeader";
import { BackButton } from "@/components/shared/BackButton";
import { Badge } from "@/components/ui/Badge";
import { formatInstantDate } from "@/lib/format";
import { EmptyState } from "@/components/ui/EmptyState";

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

  const novoHref = `/empresas/${companyId}/documentos-cliente/novo`;

  return (
    <PageContainer>
      <Breadcrumb
        items={[
          { label: "Cadastros", href: "/empresas" },
          { label: "Empresas", href: "/empresas" },
          { label: company.name, href: `/empresas/${companyId}`, truncate: true },
          { label: "Documentos para Cliente" },
        ]}
      />
      <BackButton className="mb-3" />

      <PageHeader
        title="Documentos para Cliente"
        subtitle={`${documentos.length} documento${documentos.length !== 1 ? "s" : ""} — envio por e-mail com prova de recebimento`}
        action={
          canManage && (
            <Button
              href={novoHref}
              variant="primary" className="font-medium"
            >
              + Novo Documento
            </Button>
          )
        }
      />

      {documentos.length === 0 ? (
        <Card>
          <EmptyState
            icon={<FileText />}
            title="Nenhum documento criado"
            description="Crie um documento para enviar ao cliente por e-mail com prova de recebimento — guias, comunicados ou orientações."
            action={
              canManage && (
                <Button
                  href={novoHref}
                  variant="primary" className="font-medium"
                >
                  + Criar documento
                </Button>
              )
            }
          />
        </Card>
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
