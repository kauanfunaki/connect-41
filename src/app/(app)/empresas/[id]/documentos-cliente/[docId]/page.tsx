import Link from "next/link";
import { notFound } from "next/navigation";
import { Eye, Download } from "lucide-react";
import { getPrisma } from "@/lib/prisma";
import { getAuthContext, canWrite } from "@/lib/auth/context";
import { scopedCompanyWhere } from "@/lib/auth/scope";
import { PageContainer } from "@/components/shared/PageContainer";
import { BackButton } from "@/components/shared/BackButton";
import { DeleteFieldButton } from "@/components/admin/DeleteFieldButton";
import { Badge } from "@/components/ui/Badge";
import { formatInstantDate, formatInstantDateTime } from "@/lib/format";
import { PublishDocumentButton } from "@/components/documentosCliente/PublishDocumentButton";
import { ResendRecipientButton } from "@/components/documentosCliente/ResendRecipientButton";
import { SendDocumentForm } from "@/components/documentosCliente/SendDocumentForm";
import { publicarDocumento, excluirDocumento, enviarDocumento, reenviarParaDestinatario } from "../actions";

export default async function DocumentoClienteDetailPage({
  params,
}: {
  params: Promise<{ id: string; docId: string }>;
}) {
  const { id: companyId, docId } = await params;
  const ctx = await getAuthContext();
  const canManage = canWrite(ctx.role);

  const prisma = getPrisma();
  const company = await prisma.company.findFirst({
    where: { id: companyId, ...(await scopedCompanyWhere(ctx)) },
    select: { id: true, name: true, email: true },
  });
  if (!company) notFound();

  const document = await prisma.clientDocument.findFirst({
    where: { id: docId, tenantId: ctx.tenantId, companyId },
    include: {
      createdBy: { select: { name: true } },
      recipients: {
        orderBy: { createdAt: "asc" },
        include: { views: { orderBy: { viewedAt: "desc" } } },
      },
    },
  });
  if (!document) notFound();

  return (
    <PageContainer>
      <BackButton className="mb-3" />
      <div className="flex items-center gap-2 mb-6">
        <Link href="/empresas" className="text-[13px] text-fg-muted hover:text-fg transition-colors">Empresas</Link>
        <span className="text-fg-muted">/</span>
        <Link href={`/empresas/${companyId}/documentos-cliente`} className="text-[13px] text-fg-muted hover:text-fg transition-colors truncate max-w-[200px]">
          Documentos para Cliente
        </Link>
        <span className="text-fg-muted">/</span>
        <span className="text-[13px] text-fg truncate max-w-[200px]">{document.title}</span>
      </div>

      <div className="flex items-start justify-between gap-4 mb-6">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <h1 className="text-[16px] font-semibold text-fg tracking-[-0.01em]">{document.title}</h1>
            <Badge variant={document.status === "PUBLISHED" ? "success" : "warning"}>
              {document.status === "PUBLISHED" ? "Publicado" : "Rascunho"}
            </Badge>
          </div>
          <p className="text-[13px] text-fg-muted">
            criado por {document.createdBy.name} em {formatInstantDate(document.createdAt)}
          </p>
        </div>
        {canManage && (
          <div className="flex items-center gap-3 flex-shrink-0">
            {document.status === "DRAFT" && (
              <>
                <Link href={`/empresas/${companyId}/documentos-cliente/${document.id}/editar`} className="text-[13px] text-fg-muted hover:text-fg transition-colors">
                  Editar
                </Link>
                {document.recipients.length === 0 && (
                  <DeleteFieldButton action={excluirDocumento.bind(null, document.id, companyId)} nome={document.title} />
                )}
                <PublishDocumentButton action={publicarDocumento.bind(null, document.id, companyId)} />
              </>
            )}
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        <div className="lg:col-span-2 space-y-5">
          <div className="bg-surface border border-border rounded-lg p-6">
            <h2 className="text-[14px] font-semibold text-fg mb-3">Conteúdo</h2>
            <div
              className="text-[14px] text-fg leading-relaxed [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:list-decimal [&_ol]:pl-5 [&_h2]:text-[16px] [&_h2]:font-semibold"
              dangerouslySetInnerHTML={{ __html: document.bodyHtml }}
            />
            {document.fileName && (
              <p className="text-[12px] text-fg-muted mt-4 border-t border-border pt-3">
                Anexo: {document.fileName}
              </p>
            )}
          </div>

          {canManage && document.status === "PUBLISHED" && (
            <div className="bg-surface border border-border rounded-lg p-6">
              <h2 className="text-[14px] font-semibold text-fg mb-4">Enviar por e-mail</h2>
              <SendDocumentForm action={enviarDocumento} documentId={document.id} companyId={companyId} companyEmail={company.email} />
            </div>
          )}
        </div>

        <div className="space-y-5">
          <div className="bg-surface border border-border rounded-lg p-5">
            <h2 className="text-[14px] font-semibold text-fg mb-1">Prova de recebimento</h2>
            <p className="text-[12px] text-fg-muted mb-4">
              Cada abertura do link e download do anexo fica registrado com data/hora e IP.
            </p>

            {document.recipients.length === 0 ? (
              <p className="text-[13px] text-fg-muted">Ainda não enviado a ninguém.</p>
            ) : (
              <div className="space-y-4">
                {document.recipients.map((r) => (
                  <div key={r.id} className="border border-border rounded-md p-3">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-[13px] text-fg font-medium truncate">{r.email}</p>
                      {canManage && (
                        <ResendRecipientButton action={reenviarParaDestinatario.bind(null, r.id, companyId)} />
                      )}
                    </div>
                    <p className="text-[11px] text-fg-muted mt-1">
                      enviado em {r.sentAt ? formatInstantDateTime(r.sentAt) : "—"}
                    </p>
                    {r.firstViewedAt ? (
                      <p className="text-[11px] text-success mt-0.5">
                        primeira visualização: {formatInstantDateTime(r.firstViewedAt)}
                      </p>
                    ) : (
                      <p className="text-[11px] text-warning mt-0.5">ainda não visualizado</p>
                    )}

                    {r.views.length > 0 && (
                      <div className="mt-2 pt-2 border-t border-border space-y-1">
                        {r.views.slice(0, 5).map((v) => (
                          <p key={v.id} className="text-[11px] text-fg-muted flex items-center gap-1.5">
                            {v.action === "VIEWED" ? <Eye size={11} /> : <Download size={11} />}
                            {formatInstantDateTime(v.viewedAt)} · {v.ipAddress}
                          </p>
                        ))}
                        {r.views.length > 5 && (
                          <p className="text-[11px] text-fg-muted">+ {r.views.length - 5} evento(s) anterior(es)</p>
                        )}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </PageContainer>
  );
}
