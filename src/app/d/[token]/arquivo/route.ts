import { NextRequest, NextResponse } from "next/server";
import { getPrisma } from "@/lib/prisma";
import { lerArquivoDoDocumento, recordClientDocumentView, respostaDoArquivoDoDocumento } from "@/lib/clientDocuments";
import { clientIp } from "@/lib/rateLimit";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params;
  const prisma = getPrisma();
  const recipient = await prisma.clientDocumentRecipient.findUnique({
    where: { token },
    include: { clientDocument: true },
  });

  if (!recipient || recipient.clientDocument.status !== "PUBLISHED" || !recipient.clientDocument.fileUrl) {
    return NextResponse.json({ error: "Arquivo não encontrado." }, { status: 404 });
  }

  const doc = recipient.clientDocument;
  const conteudo = await lerArquivoDoDocumento(doc.fileUrl!);
  if (!conteudo) return NextResponse.json({ error: "Arquivo não encontrado no armazenamento." }, { status: 404 });

  await recordClientDocumentView({
    recipientId: recipient.id,
    action: "DOWNLOADED",
    ipAddress: clientIp(req),
    userAgent: req.headers.get("user-agent"),
    isFirstView: false,
  });
  return respostaDoArquivoDoDocumento(conteudo, { fileUrl: doc.fileUrl!, fileName: doc.fileName, mimeType: doc.mimeType });
}
