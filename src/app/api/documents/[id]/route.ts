import { NextRequest, NextResponse } from "next/server";
import { readFile } from "fs/promises";
import path from "path";
import { getPrisma } from "@/lib/prisma";
import { getAuthContext } from "@/lib/auth/context";
import { canViewSensitiveField } from "@/lib/auth/sensitiveFields";

const STORAGE_DIR = path.join(process.cwd(), "storage", "documents");

const CONTENT_TYPES: Record<string, string> = {
  jpg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
  pdf: "application/pdf",
};

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const ctx = await getAuthContext();
  if (!ctx.userId || !ctx.tenantId) {
    return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  }

  const { id } = await params;
  const prisma = getPrisma();
  const document = await prisma.document.findFirst({ where: { id, tenantId: ctx.tenantId } });
  if (!document) {
    return NextResponse.json({ error: "Documento não encontrado." }, { status: 404 });
  }

  if (document.sensitive) {
    const allowed = await canViewSensitiveField(ctx, "DOCUMENTOS_PESSOAIS");
    if (!allowed) {
      return NextResponse.json({ error: "Sem permissão para ver este documento." }, { status: 403 });
    }
  }

  // fileUrl é sempre "<tenantId>/<uuid>.<ext>" gravado por nós no upload — nunca
  // vem de input do usuário, então não há risco de path traversal aqui.
  const ext = document.fileUrl.split(".").pop() ?? "";
  const filePath = path.join(STORAGE_DIR, document.fileUrl);

  try {
    const buffer = await readFile(filePath);
    return new NextResponse(buffer, {
      headers: {
        "Content-Type": CONTENT_TYPES[ext] ?? document.mimeType,
        "Content-Disposition": `attachment; filename="${encodeURIComponent(document.fileName)}"`,
        "Cache-Control": "private, max-age=0, must-revalidate",
      },
    });
  } catch {
    return NextResponse.json({ error: "Arquivo não encontrado no armazenamento." }, { status: 404 });
  }
}
