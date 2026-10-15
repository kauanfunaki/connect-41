import { headers } from "next/headers";
import { getPrisma } from "@/lib/prisma";
import { hit, clientIp } from "@/lib/rateLimit";
import { sanitizeDocumentHtml, recordClientDocumentView } from "@/lib/clientDocuments";
import { SignatureForm } from "@/components/documentosCliente/SignatureForm";
import { formatInstantDateTimeComSegundos } from "@/lib/format";
import { Download, Link2Off } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Aviso } from "@/components/ui/Aviso";
import { TelaDeAvisoPublica } from "@/components/publico/TelaDeAvisoPublica";
import { CabecalhoPublico } from "@/components/publico/CabecalhoPublico";

export const metadata = { title: "Documento" };

// O aviso único das telas públicas (15/10/2026), o mesmo da tela de erro desta
// rota (error.tsx) e do 404 — era uma cópia à mão da moldura.
function InvalidLink() {
  return (
    <TelaDeAvisoPublica
      icone={<Link2Off />}
      titulo="Link inválido ou expirado"
      texto="Este link de documento não existe mais ou foi digitado incorretamente. Entre em contato com quem enviou o documento para receber um novo link."
    />
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
      clientDocument: { include: { company: { select: { name: true } }, tenant: { select: { name: true, logoUrl: true } } } },
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
        {/* O topo das telas públicas, com o logo do escritório, como os links de
            admissão e de teste (15/10/2026): era um título montado à mão, com a
            empresa em cima. */}
        <CabecalhoPublico
          logo={doc.tenant.logoUrl ? { src: doc.tenant.logoUrl, alt: doc.tenant.name } : null}
          titulo={doc.title}
          subtitulo={doc.company.name}
        />

        {/* Texto de leitura como no portal (/portal/envios/[id], 15/10/2026):
            15px e no máximo 72 caracteres por linha — eram 14px e ~90. */}
        <div className="bg-surface border border-border rounded-lg shadow-[var(--c41-shadow-xs)] p-4 sm:p-6">
          <div
            className="max-w-[72ch] text-body text-fg leading-relaxed break-words [&_a]:text-brand [&_a]:underline [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:list-decimal [&_ol]:pl-5 [&_h1]:text-fs-7 [&_h1]:font-semibold [&_h2]:text-fs-6 [&_h2]:font-semibold [&_h3]:text-fs-4 [&_h3]:font-semibold"
            dangerouslySetInnerHTML={{ __html: bodyHtml }}
          />
        </div>

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
              <p className="text-fs-2 text-fg-muted mt-1">
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
