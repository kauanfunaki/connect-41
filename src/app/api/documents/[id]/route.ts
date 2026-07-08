import { NextRequest, NextResponse } from "next/server";
import { readFile } from "fs/promises";
import path from "path";
import { getPrisma } from "@/lib/prisma";
import { getAuthContext } from "@/lib/auth/context";
import { canViewSensitiveField } from "@/lib/auth/sensitiveFields";
import type { DocumentCategory, SensitiveFieldGroup } from "@/generated/prisma/enums";

const STORAGE_DIR = path.join(process.cwd(), "storage", "documents");

// Documentos médicos (ASO/atestado) são protegidos pelo grupo DADOS_MEDICOS
// mesmo que a flag `sensitive` não tenha sido marcada no upload — dado de saúde
// é sensível por natureza (LGPD). Os demais caem em DOCUMENTOS_PESSOAIS.
const MEDICAL_CATEGORIES: DocumentCategory[] = ["ASO", "ATESTADO"];

function requiredGroupFor(
  category: DocumentCategory,
  sensitiveFlag: boolean
): SensitiveFieldGroup | null {
  if (MEDICAL_CATEGORIES.includes(category)) return "DADOS_MEDICOS";
  if (sensitiveFlag) return "DOCUMENTOS_PESSOAIS";
  return null; // documento não sensível — liberado para qualquer usuário do tenant
}

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

  const requiredGroup = requiredGroupFor(document.category, document.sensitive);
  if (requiredGroup) {
    const allowed = await canViewSensitiveField(ctx, requiredGroup);
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
