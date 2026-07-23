import { notFound } from "next/navigation";
import { getPrisma } from "@/lib/prisma";
import { getAuthContext, canWrite } from "@/lib/auth/context";
import { scopedCompanyWhere } from "@/lib/auth/scope";
import { PageContainer } from "@/components/shared/PageContainer";
import { Breadcrumb } from "@/components/shared/Breadcrumb";
import { PageHeader } from "@/components/ui/PageHeader";
import { BackButton } from "@/components/shared/BackButton";
import { ClientDocumentForm } from "@/components/documentosCliente/ClientDocumentForm";
import { atualizarDocumento } from "../../actions";

export default async function EditarDocumentoClientePage({
  params,
}: {
  params: Promise<{ id: string; docId: string }>;
}) {
  const { id: companyId, docId } = await params;
  const ctx = await getAuthContext();
  if (!canWrite(ctx.role)) notFound();

  const prisma = getPrisma();
  const company = await prisma.company.findFirst({
    where: { id: companyId, ...(await scopedCompanyWhere(ctx)) },
    select: { id: true, name: true },
  });
  if (!company) notFound();

  const document = await prisma.clientDocument.findFirst({
    where: { id: docId, tenantId: ctx.tenantId, companyId },
    include: { recipients: { select: { sentAt: true } } },
  });
  if (!document) notFound();

  const alreadySent = document.recipients.some((r) => r.sentAt);

  return (
    <PageContainer>
      <Breadcrumb
        items={[
          { label: "Cadastros", href: "/empresas" },
          { label: "Empresas", href: "/empresas" },
          { label: "Documentos para Cliente", href: `/empresas/${companyId}/documentos-cliente`, truncate: true },
          { label: "Editar" },
        ]}
      />
      <BackButton className="mb-3" />

      <PageHeader title="Editar Documento" />

      <div className="w-full max-w-[860px]">
        {alreadySent ? (
          <div className="bg-surface border border-border rounded-2xl p-6 text-[13px] text-fg-muted">
            Este documento já foi enviado a pelo menos um destinatário e não pode mais ser editado — o link de visualização precisa sempre mostrar o mesmo conteúdo que foi de fato recebido. Crie um novo documento se precisar alterar o conteúdo.
          </div>
        ) : (
          <div className="bg-surface border border-border rounded-2xl p-6">
            <ClientDocumentForm
              action={atualizarDocumento}
              companyId={company.id}
              documentId={document.id}
              cancelHref={`/empresas/${companyId}/documentos-cliente`}
              defaultValues={{ title: document.title, bodyHtml: document.bodyHtml, fileName: document.fileName, requiresSignature: document.requiresSignature }}
            />
          </div>
        )}
      </div>
    </PageContainer>
  );
}
