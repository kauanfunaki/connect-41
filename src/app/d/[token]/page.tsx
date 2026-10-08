import { headers } from "next/headers";
import { getPrisma } from "@/lib/prisma";
import { hit, clientIp } from "@/lib/rateLimit";
import { sanitizeDocumentHtml, recordClientDocumentView } from "@/lib/clientDocuments";
import { SignatureForm } from "@/components/documentosCliente/SignatureForm";
import { formatInstantDateTimeComSegundos } from "@/lib/format";
import { Download, Link2Off } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Aviso } from "@/components/ui/Aviso";

export const metadata = { title: "Documento" };

// Mesma moldura da tela de erro desta rota (error.tsx) e do 404: ícone, título
// e texto empilhados no centro.
function InvalidLink() {
  return (
    <div className="min-h-screen flex items-center justify-center p-6">
      <div className="max-w-md text-center flex flex-col items-center gap-3">
        <span className="w-10 h-10 rounded-lg bg-surface-hover text-fg-muted flex items-center justify-center">
          <Link2Off size={18} />
        </span>
        <h1 className="text-[18px] font-semibold text-fg">Link inválido ou expirado</h1>
        <p className="text-[13px] text-fg-muted">
          Este link de documento não existe mais ou foi digitado incorretamente. Entre em contato com quem enviou o documento para receber um novo link.
        </p>
      </div>
    </div>
  );
}

export default async function ClientDocumentViewPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const h = await headers();
  const ip = clientIp({ headers: h });

  const prisma = getPrisma();
  const recipient = await prisma.clientDocumentRecipient.findUnique({
    where: { token },
    include: {
      clientDocument: { include: { company: { select: { name: true } } } },
    },
  });

  if (!recipient || recipient.clientDocument.status !== "PUBLISHED") {
    // Rate-limita tentativas com token inexistente/errado para dificultar
    // enumeração — não se aplica a links válidos (visualizações legítimas
    // nunca são bloqueadas).
    hit(`docview-miss:${ip}`, 20, 10 * 60_000);
    return <InvalidLink />;
  }

  const userAgent = h.get("user-agent");
  await recordClientDocumentView({
    recipientId: recipient.id,
    action: "VIEWED",
    ipAddress: ip,
    userAgent,
    isFirstView: !recipient.firstViewedAt,
  });

  const doc = recipient.clientDocument;
  const bodyHtml = sanitizeDocumentHtml(doc.bodyHtml);

  return (
    <div className="min-h-screen py-10 px-4">
      <div className="max-w-2xl mx-auto">
        <p className="text-[12px] text-fg-muted mb-1">{doc.company.name}</p>
        <h1 className="text-[20px] font-semibold text-fg tracking-[-0.01em] mb-6">{doc.title}</h1>

        <div
          className="bg-surface border border-border rounded-lg shadow-[var(--c41-shadow-xs)] p-4 sm:p-6 text-[14px] text-fg leading-relaxed [&_a]:text-brand [&_a]:underline [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:list-decimal [&_ol]:pl-5 [&_h1]:text-[18px] [&_h1]:font-semibold [&_h2]:text-[16px] [&_h2]:font-semibold [&_h3]:text-[14px] [&_h3]:font-semibold"
          dangerouslySetInnerHTML={{ __html: bodyHtml }}
        />

        {/* `nativo` (um `<a>` simples), e não o Button com href puro: este
            vira <Link>, e o prefetch dele chamaria a rota do arquivo (que
            registra DOWNLOADED) sem ninguém ter clicado. Tamanho `lg`, o do
            "Assinar documento" logo abaixo. */}
        {doc.fileUrl && (
          <Button href={`/d/${token}/arquivo`} nativo size="lg" className="max-w-full mt-5">
            <Download size={16} className="flex-shrink-0" />
            <span className="truncate">Baixar anexo{doc.fileName ? `: ${doc.fileName}` : ""}</span>
          </Button>
        )}

        {doc.requiresSignature &&
          (recipient.signedAt ? (
            <Aviso tom="sucesso" className="mt-5">
              <p className="font-semibold">Documento assinado</p>
              <p className="text-[12px] text-fg-muted mt-1">
                Assinado por {recipient.signerName ?? "—"} em {formatInstantDateTimeComSegundos(recipient.signedAt)}.
              </p>
            </Aviso>
          ) : (
            <SignatureForm token={token} documentTitle={doc.title} />
          ))}
      </div>
    </div>
  );
}
