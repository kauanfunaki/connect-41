import Link from "next/link";
import { notFound } from "next/navigation";
import { getPrisma } from "@/lib/prisma";
import { getAuthContext, canWrite } from "@/lib/auth/context";
import { scopedCompanyWhere } from "@/lib/auth/scope";
import { PageContainer } from "@/components/shared/PageContainer";
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
    <PageContainer variant="narrow">
      <BackButton className="mb-3" />
      <div className="flex items-center gap-2 mb-6">
        <Link href="/empresas" className="text-[13px] text-fg-muted hover:text-fg transition-colors">Empresas</Link>
        <span className="text-fg-muted">/</span>
        <Link href={`/empresas/${companyId}/documentos-cliente`} className="text-[13px] text-fg-muted hover:text-fg transition-colors truncate max-w-[200px]">
          Documentos para Cliente
        </Link>
        <span className="text-fg-muted">/</span>
        <span className="text-[13px] text-fg">Editar</span>
      </div>

      <h1 className="text-[16px] font-semibold text-fg tracking-[-0.01em] mb-1">Editar Documento</h1>

      {alreadySent ? (
        <div className="bg-surface border border-border rounded-lg p-6 text-[13px] text-fg-muted">
          Este documento já foi enviado a pelo menos um destinatário e não pode mais ser editado — o link de visualização precisa sempre mostrar o mesmo conteúdo que foi de fato recebido. Crie um novo documento se precisar alterar o conteúdo.
        </div>
      ) : (
        <div className="bg-surface border border-border rounded-lg p-6">
          <ClientDocumentForm
            action={atualizarDocumento}
            companyId={company.id}
            documentId={document.id}
            defaultValues={{ title: document.title, bodyHtml: document.bodyHtml, fileName: document.fileName }}
          />
        </div>
      )}
    </PageContainer>
  );
}
