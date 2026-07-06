import { NextRequest, NextResponse } from "next/server";
import { mkdir, writeFile } from "fs/promises";
import path from "path";
import { randomUUID } from "crypto";
import { getPrisma } from "@/lib/prisma";
import { getAuthContext, canAct } from "@/lib/auth/context";
import { DocumentCategory, DocumentEntityType } from "@/generated/prisma/enums";

// Fora de `public/` de propósito: documento sensível não pode ser servido
// estaticamente sem passar pela checagem de permissão em [id]/route.ts.
const STORAGE_DIR = path.join(process.cwd(), "storage", "documents");

const ALLOWED_TYPES: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "application/pdf": "pdf",
};
const MAX_SIZE = 10 * 1024 * 1024;

export async function POST(req: NextRequest) {
  const ctx = await getAuthContext();
  if (!ctx.userId || !ctx.tenantId) {
    return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  }
  if (!canAct(ctx.role)) {
    return NextResponse.json({ error: "Sem permissão para anexar documentos." }, { status: 403 });
  }

  const form = await req.formData();
  const file = form.get("file");
  const entityType = form.get("entityType") as string;
  const entityId = (form.get("entityId") as string)?.trim();
  const category = form.get("category") as string;
  const sensitive = form.get("sensitive") === "true";

  if (!(file instanceof File)) {
    return NextResponse.json({ error: "Arquivo não enviado." }, { status: 400 });
  }
  if (!Object.values(DocumentEntityType).includes(entityType as DocumentEntityType)) {
    return NextResponse.json({ error: "Tipo de entidade inválido." }, { status: 400 });
  }
  if (!entityId) {
    return NextResponse.json({ error: "entityId é obrigatório." }, { status: 400 });
  }
  if (!Object.values(DocumentCategory).includes(category as DocumentCategory)) {
    return NextResponse.json({ error: "Categoria de documento inválida." }, { status: 400 });
  }

  const ext = ALLOWED_TYPES[file.type];
  if (!ext) {
    return NextResponse.json({ error: "Formato não suportado. Use JPG, PNG, WEBP ou PDF." }, { status: 400 });
  }
  if (file.size > MAX_SIZE) {
    return NextResponse.json({ error: "Arquivo maior que 10MB." }, { status: 400 });
  }

  const id = randomUUID();
  const storedFileName = `${id}.${ext}`;
  const dir = path.join(STORAGE_DIR, ctx.tenantId);
  await mkdir(dir, { recursive: true });
  const buffer = Buffer.from(await file.arrayBuffer());
  await writeFile(path.join(dir, storedFileName), buffer);

  const prisma = getPrisma();
  const document = await prisma.document.create({
    data: {
      id,
      tenantId: ctx.tenantId,
      entityType: entityType as DocumentEntityType,
      entityId,
      category: category as DocumentCategory,
      fileName: file.name,
      fileUrl: `${ctx.tenantId}/${storedFileName}`,
      mimeType: file.type,
      fileSize: file.size,
      sensitive,
      uploadedById: ctx.userId,
    },
  });

  return NextResponse.json({ id: document.id, fileName: document.fileName, category: document.category, sensitive: document.sensitive });
}
