import Link from "next/link";
import { notFound } from "next/navigation";
import { Eye, Download, PenLine, Pencil } from "lucide-react";
import { getPrisma } from "@/lib/prisma";
import { getAuthContext, canWrite } from "@/lib/auth/context";
import { scopedCompanyWhere } from "@/lib/auth/scope";
import { isModuleEnabled } from "@/lib/modules";
import { nomeExibicao } from "@/lib/companyName";
import { formatInstantDate, formatInstantDateTime, formatInstantDateTimeComSegundos } from "@/lib/format";
import { Breadcrumb } from "@/components/shared/Breadcrumb";
import { PageContainer } from "@/components/shared/PageContainer";
import { Card } from "@/components/ui/Card";
import { PageHeader } from "@/components/ui/PageHeader";
import { DeleteButton } from "@/components/ui/DeleteButton";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { ConfirmActionButton } from "@/components/ui/ConfirmActionButton";
import { ResendRecipientButton } from "@/components/documentosCliente/ResendRecipientButton";
import { SendDocumentForm } from "@/components/documentosCliente/SendDocumentForm";
import { SeloDoEnvio } from "@/components/documentosCliente/SeloDoEnvio";
import { emailDoDestinatario, rotaDeEditarOEnvio, rotaDosEnvios, situacaoDoEnvio } from "@/lib/envios/regras";
import { emailsComPortal, pessoasNoPortal } from "@/lib/envios/consultas";
import { publicarDocumento, excluirDocumento, enviarDocumento, reenviarParaDestinatario } from "../actions";

export const dynamic = "force-dynamic";

/**
 * Um envio ao cliente: o conteúdo, como ele chega ao cliente (portal e
 * e-mail) e a prova de cada destinatário. Até 08/10/2026 morava em
 * /empresas/{id}/documentos-cliente/{docId}, que agora redireciona para cá.
 */
export default async function EnvioPage({
  params,
}: {
  params: Promise<{ docId: string }>;
}) {
  const { docId } = await params;
  const ctx = await getAuthContext();
  if (!ctx.tenantId) notFound();
  const canManage = canWrite(ctx.role);

  const prisma = getPrisma();
  const document = await prisma.clientDocument.findFirst({
    where: { id: docId, tenantId: ctx.tenantId, company: await scopedCompanyWhere(ctx) },
    include: {
      company: { select: { id: true, name: true, displayName: true, email: true, clientGroupId: true } },
      createdBy: { select: { name: true } },
      recipients: {
        orderBy: { createdAt: "asc" },
        include: { views: { orderBy: { viewedAt: "desc" } } },
      },
    },
  });
  if (!document) notFound();

  const company = document.company;
  const companyId = company.id;
  const empresaNome = nomeExibicao(company);
  const [canalLigado, noPortal, comPortal] = await Promise.all([
    isModuleEnabled(ctx.tenantId, "portal_solicitacoes"),
    pessoasNoPortal(ctx.tenantId, company.clientGroupId),
    emailsComPortal(ctx.tenantId, company.clientGroupId, document.recipients.map((r) => r.email)),
  ]);
  const publicado = document.status === "PUBLISHED";

  // Como o cliente recebe: o portal (se o canal está ligado e a empresa tem
  // gente com acesso) e o e-mail, que segue para quem não tem portal.
  const pessoas = `${noPortal} ${noPortal === 1 ? "pessoa" : "pessoas"} do cliente`;
  const comoChega = !canalLigado
    ? "O portal não mostra envios neste escritório (o canal do portal está desligado): o cliente recebe pelo link do e-mail."
    : noPortal === 0
      ? "Esta empresa não tem ninguém com acesso ao portal: o cliente recebe pelo link do e-mail."
      : publicado
        ? `Publicado no portal: ${pessoas} veem este envio. Quem não tem portal recebe pelo link do e-mail.`
        : `Ao publicar, ${pessoas} passam a ver este envio no portal. Quem não tem portal recebe pelo link do e-mail.`;

  return (
    <PageContainer>
      <Breadcrumb
        items={[
          { label: "Envios ao cliente", href: rotaDosEnvios() },
          { label: empresaNome, href: rotaDosEnvios(companyId), truncate: true },
          { label: document.title, truncate: true },
        ]}
      />

      {/* A situação é Selo e vai no `meta`, embaixo do título, como nas outras
          fichas de registro; "Pede aceite" é categoria e segue no Badge
          (escolha 2A, 08/10/2026). */}
      <PageHeader
        title={document.title}
        subtitle={
          <>
            Para{" "}
            <Link href={`/empresas/${companyId}`} className="text-brand hover:underline">
              {empresaNome}
            </Link>{" "}
            · criado por {document.createdBy.name} em {formatInstantDate(document.createdAt)}
          </>
        }
        meta={
          <>
            <SeloDoEnvio situacao={situacaoDoEnvio(document)} />
            {document.requiresSignature && <Badge variant="info">Pede aceite</Badge>}
          </>
        }
        action={
          canManage &&
          document.status === "DRAFT" && (
            <div className="flex flex-wrap items-center gap-2">
              <Button href={rotaDeEditarOEnvio(document.id)} variant="secondary" size="sm">
                <Pencil size={14} />
                Editar
              </Button>
              {document.recipients.length === 0 && (
                <DeleteButton action={excluirDocumento.bind(null, document.id, companyId)} nome={document.title} />
              )}
              {/* Com confirmação desde 08/10/2026: publicar deixou de ser um passo
                  interno — o envio aparece na hora no portal do cliente. */}
              <ConfirmActionButton
                action={publicarDocumento.bind(null, document.id, companyId)}
                label="Publicar"
                title="Publicar este envio?"
                description={`${
                  canalLigado && noPortal > 0
                    ? `Ele aparece na hora no portal para ${pessoas}${document.requiresSignature ? ", e o aceite pendente entra no Início delas" : ""}.`
                    : "Depois de publicar, mande por e-mail a quem precisa receber."
                } Publicado, o conteúdo não pode mais ser editado.`}
                confirmLabel="Publicar"
                successMessage="Envio publicado."
                variant="primary"
              />
            </div>
          )
        }
      />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        <div className="lg:col-span-2 space-y-5">
          <Card className="p-5">
            <h2 className="text-section font-semibold text-fg mb-4">Conteúdo</h2>
            <div
              className="text-fs-4 text-fg leading-relaxed [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:list-decimal [&_ol]:pl-5 [&_h2]:text-fs-6 [&_h2]:font-semibold"
              dangerouslySetInnerHTML={{ __html: document.bodyHtml }}
            />
            {document.fileName && (
              <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-fs-2 text-fg-muted mt-4 border-t border-border pt-3">
                <span className="min-w-0 truncate">Anexo: {document.fileName}</span>
                {/* A equipe também baixa o anexo (08/10/2026); não conta como abertura do cliente. */}
                <Button href={`/solicitacoes/envios/${document.id}/arquivo`} download variant="secondary" size="sm">
                  <Download size={13} /> Baixar
                </Button>
              </p>
            )}
          </Card>

          {canManage && publicado && (
            <Card className="p-5">
              <h2 className="text-section font-semibold text-fg mb-1">Enviar por e-mail</h2>
              <p className="text-fs-2 text-fg-muted mb-4">
                Cada e-mail leva um link próprio para a página do documento, com a mesma prova de leitura e aceite do portal.
              </p>
              <SendDocumentForm action={enviarDocumento} documentId={document.id} companyId={companyId} companyEmail={company.email} />
            </Card>
          )}
        </div>

        <div className="space-y-5">
          <Card className="p-5">
            <h2 className="text-section font-semibold text-fg mb-1">Prova de recebimento</h2>
            <p className="text-fs-2 text-fg-muted">
              Cada abertura — pelo portal ou pelo link do e-mail — e cada download do anexo ficam registrados com data/hora e IP.
            </p>
            <p className="text-fs-2 text-fg-secondary mt-2 mb-4">{comoChega}</p>

            {document.recipients.length === 0 ? (
              <p className="text-fs-3 text-fg-muted">{publicado ? "Ninguém abriu ainda." : "Ainda não publicado."}</p>
            ) : (
              <div className="space-y-4">
                {document.recipients.map((r) => {
                  const viaPortal = !r.sentAt && comPortal.has(emailDoDestinatario(r.email));
                  return (
                    <div key={r.id} className="border border-border rounded-md p-3">
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-fs-3 text-fg font-medium truncate">{r.email}</p>
                        {canManage && (
                          <ResendRecipientButton action={reenviarParaDestinatario.bind(null, r.id, companyId)} />
                        )}
                      </div>
                      <p className="text-fs-1 text-fg-muted mt-1">
                        {r.sentAt
                          ? `enviado por e-mail em ${formatInstantDateTime(r.sentAt)}`
                          : viaPortal
                            ? "abriu pelo portal (sem e-mail)"
                            : "o e-mail não saiu — use Reenviar"}
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
                            aceite de {r.signerName ?? "—"} em {formatInstantDateTimeComSegundos(r.signedAt)}
                          </p>
                        ) : (
                          <p className="text-fs-1 text-warning-fg mt-0.5">sem aceite</p>
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
                  );
                })}
              </div>
            )}
          </Card>
        </div>
      </div>
    </PageContainer>
  );
}
