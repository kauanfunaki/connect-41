import { Breadcrumb } from "@/components/shared/Breadcrumb";
import { Card } from "@/components/ui/Card";
import { PageHeader } from "@/components/ui/PageHeader";
import { notFound } from "next/navigation";
import { Eye, Download, PenLine, Pencil } from "lucide-react";
import { getPrisma } from "@/lib/prisma";
import { getAuthContext, canWrite } from "@/lib/auth/context";
import { scopedCompanyWhere } from "@/lib/auth/scope";
import { PageContainer } from "@/components/shared/PageContainer";
import { BackButton } from "@/components/shared/BackButton";
import { DeleteButton } from "@/components/ui/DeleteButton";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { Selo } from "@/components/ui/Selo";
import { formatInstantDate, formatInstantDateTime, formatInstantDateTimeComSegundos } from "@/lib/format";
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
      <Breadcrumb
        items={[
          { label: "Cadastros", href: "/empresas" },
          { label: "Empresas", href: "/empresas" },
          { label: "Documentos para cliente", href: `/empresas/${companyId}/documentos-cliente`, truncate: true },
          { label: document.title, truncate: true },
        ]}
      />
      <BackButton className="mb-3" />

      {/* O PageHeader estava aninhado dentro de uma linha com os selos, e as
          ações eram "Editar" e "Excluir" em texto (30/09): agora é o cabeçalho
          padrão, com os selos junto do título e as ações em botão. */}
      {/* A situação (publicado/rascunho) é Selo e vai no `meta`, embaixo do
          título, como nas outras fichas de registro; "Requer assinatura" é
          categoria e segue no Badge (escolha 2A, 08/10/2026). */}
      <PageHeader
        title={document.title}
        subtitle={<>Criado por {document.createdBy.name} em {formatInstantDate(document.createdAt)}</>}
        meta={
          <>
            <Selo tom={document.status === "PUBLISHED" ? "sucesso" : "atencao"}>
              {document.status === "PUBLISHED" ? "Publicado" : "Rascunho"}
            </Selo>
            {document.requiresSignature && <Badge variant="info">Requer assinatura</Badge>}
          </>
        }
        action={
          canManage &&
          document.status === "DRAFT" && (
            <div className="flex flex-wrap items-center gap-2">
              <Button href={`/empresas/${companyId}/documentos-cliente/${document.id}/editar`} variant="secondary" size="sm">
                <Pencil size={14} />
                Editar
              </Button>
              {document.recipients.length === 0 && (
                <DeleteButton action={excluirDocumento.bind(null, document.id, companyId)} nome={document.title} />
              )}
              <PublishDocumentButton action={publicarDocumento.bind(null, document.id, companyId)} />
            </div>
          )
        }
      />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        <div className="lg:col-span-2 space-y-5">
          <div className="bg-surface border border-border rounded-lg shadow-[var(--c41-shadow-xs)] p-5">
            <h2 className="text-card-title font-semibold text-fg mb-4">Conteúdo</h2>
            <div
              className="text-fs-4 text-fg leading-relaxed [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:list-decimal [&_ol]:pl-5 [&_h2]:text-fs-6 [&_h2]:font-semibold"
              dangerouslySetInnerHTML={{ __html: document.bodyHtml }}
            />
            {document.fileName && (
              <p className="text-fs-2 text-fg-muted mt-4 border-t border-border pt-3">
                Anexo: {document.fileName}
              </p>
            )}
          </div>

          {canManage && document.status === "PUBLISHED" && (
            <Card className="p-5">
              <h2 className="text-card-title font-semibold text-fg mb-4">Enviar por e-mail</h2>
              <SendDocumentForm action={enviarDocumento} documentId={document.id} companyId={companyId} companyEmail={company.email} />
            </Card>
          )}
        </div>

        <div className="space-y-5">
          <div className="bg-surface border border-border rounded-lg shadow-[var(--c41-shadow-xs)] p-5">
            <h2 className="text-card-title font-semibold text-fg mb-1">Prova de recebimento</h2>
            <p className="text-fs-2 text-fg-muted mb-4">
              Cada abertura do link e download do anexo fica registrado com data/hora e IP.
            </p>

            {document.recipients.length === 0 ? (
              <p className="text-fs-3 text-fg-muted">Ainda não enviado a ninguém.</p>
            ) : (
              <div className="space-y-4">
                {document.recipients.map((r) => (
                  <div key={r.id} className="border border-border rounded-md p-3">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-fs-3 text-fg font-medium truncate">{r.email}</p>
                      {canManage && (
                        <ResendRecipientButton action={reenviarParaDestinatario.bind(null, r.id, companyId)} />
                      )}
                    </div>
                    <p className="text-fs-1 text-fg-muted mt-1">
                      enviado em {r.sentAt ? formatInstantDateTime(r.sentAt) : "—"}
                    </p>
                    {r.firstViewedAt ? (
                      <p className="text-fs-1 text-success-fg mt-0.5">
                        primeira visualização: {formatInstantDateTimeComSegundos(r.firstViewedAt)}
                      </p>
                    ) : (
                      <p className="text-fs-1 text-warning-fg mt-0.5">ainda não visualizado</p>
                    )}
                    {document.requiresSignature &&
                      (r.signedAt ? (
                        <p className="text-fs-1 text-success-fg mt-0.5 flex items-center gap-1.5">
                          <PenLine size={11} />
                          assinado por {r.signerName ?? "—"} em {formatInstantDateTimeComSegundos(r.signedAt)}
                        </p>
                      ) : (
                        <p className="text-fs-1 text-warning-fg mt-0.5">assinatura pendente</p>
                      ))}

                    {r.views.length > 0 && (
                      <div className="mt-2 pt-2 border-t border-border space-y-1">
                        {r.views.slice(0, 5).map((v) => (
                          <p key={v.id} className="text-fs-1 text-fg-muted flex items-center gap-1.5">
                            {v.action === "VIEWED" ? <Eye size={11} /> : v.action === "SIGNED" ? <PenLine size={11} /> : <Download size={11} />}
                            {formatInstantDateTimeComSegundos(v.viewedAt)} · {v.ipAddress}
                          </p>
                        ))}
                        {r.views.length > 5 && (
                          <p className="text-fs-1 text-fg-muted">+ {r.views.length - 5} evento(s) anterior(es)</p>
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
