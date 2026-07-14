import { NextRequest, NextResponse } from "next/server";
import { readFile } from "fs/promises";
import path from "path";
import { getPrisma } from "@/lib/prisma";
import { recordClientDocumentView } from "@/lib/clientDocuments";
import { clientIp } from "@/lib/rateLimit";

const STORAGE_DIR = path.join(process.cwd(), "storage", "client-documents");

const CONTENT_TYPES: Record<string, string> = {
  jpg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
  pdf: "application/pdf",
};

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
  const ext = doc.fileUrl!.split(".").pop() ?? "";
  const filePath = path.join(STORAGE_DIR, doc.fileUrl!);

  try {
    const buffer = await readFile(filePath);
    await recordClientDocumentView({
      recipientId: recipient.id,
      action: "DOWNLOADED",
      ipAddress: clientIp(req),
      userAgent: req.headers.get("user-agent"),
      isFirstView: false,
    });
    return new NextResponse(buffer, {
      headers: {
        "Content-Type": CONTENT_TYPES[ext] ?? doc.mimeType ?? "application/octet-stream",
        "Content-Disposition": `attachment; filename="${encodeURIComponent(doc.fileName ?? "documento")}"`,
        "Cache-Control": "private, max-age=0, must-revalidate",
      },
    });
  } catch {
    return NextResponse.json({ error: "Arquivo não encontrado no armazenamento." }, { status: 404 });
  }
}
