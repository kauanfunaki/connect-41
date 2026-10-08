import { notFound } from "next/navigation";
import { Card } from "@/components/ui/Card";
import { getPrisma } from "@/lib/prisma";
import { getAuthContext, canWrite } from "@/lib/auth/context";
import { scopedCompanyWhere } from "@/lib/auth/scope";
import { nomeExibicao } from "@/lib/companyName";
import { PageContainer } from "@/components/shared/PageContainer";
import { Breadcrumb } from "@/components/shared/Breadcrumb";
import { PageHeader } from "@/components/ui/PageHeader";
import { ClientDocumentForm } from "@/components/documentosCliente/ClientDocumentForm";
import { rotaDoEnvio, rotaDosEnvios } from "@/lib/envios/regras";
import { atualizarDocumento } from "../../actions";

export const dynamic = "force-dynamic";

export default async function EditarEnvioPage({
  params,
}: {
  params: Promise<{ docId: string }>;
}) {
  const { docId } = await params;
  const ctx = await getAuthContext();
  if (!ctx.tenantId || !canWrite(ctx.role)) notFound();

  const document = await getPrisma().clientDocument.findFirst({
    where: { id: docId, tenantId: ctx.tenantId, company: await scopedCompanyWhere(ctx) },
    include: {
      company: { select: { id: true, name: true, displayName: true } },
      recipients: { select: { sentAt: true, firstViewedAt: true } },
    },
  });
  if (!document) notFound();

  // A mesma trava da ação (`atualizarDocumento`): publicado já está no portal,
  // e o que o cliente viu não pode mudar depois.
  const travado = document.status !== "DRAFT" || document.recipients.some((r) => r.sentAt || r.firstViewedAt);

  return (
    <PageContainer>
      <Breadcrumb
        items={[
          { label: "Envios ao cliente", href: rotaDosEnvios() },
          { label: document.title, href: rotaDoEnvio(document.id), truncate: true },
          { label: "Editar" },
        ]}
      />

      <PageHeader title="Editar envio" subtitle={`Para ${nomeExibicao(document.company)}.`} />

      <div className="w-full max-w-[860px]">
        {travado ? (
          <Card className="p-6 text-fs-3 text-fg-muted">
            Este envio já foi publicado e não pode mais ser editado — o cliente precisa ver sempre o mesmo conteúdo que foi de fato recebido. Crie um novo envio se precisar alterar o conteúdo.
          </Card>
        ) : (
          <Card className="p-6">
            <ClientDocumentForm
              action={atualizarDocumento}
              companyId={document.company.id}
              documentId={document.id}
              cancelHref={rotaDoEnvio(document.id)}
              defaultValues={{ title: document.title, bodyHtml: document.bodyHtml, fileName: document.fileName, requiresSignature: document.requiresSignature }}
            />
          </Card>
        )}
      </div>
    </PageContainer>
  );
}
