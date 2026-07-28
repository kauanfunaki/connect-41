import { NextRequest, NextResponse } from "next/server";
import { mkdir, writeFile } from "fs/promises";
import path from "path";
import { getPrisma } from "@/lib/prisma";
import { getAuthContext, canActOnSector } from "@/lib/auth/context";

const SECTOR = "bpo";

const ALLOWED_TYPES: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};
const MAX_SIZE = 4 * 1024 * 1024;

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await getAuthContext();
  if (!ctx.tenantId || !canActOnSector(ctx, SECTOR)) {
    return NextResponse.json({ error: "Sem permissão." }, { status: 403 });
  }

  const { id } = await params;
  const prisma = getPrisma();
  const page = await prisma.manualPage.findFirst({ where: { id, tenantId: ctx.tenantId }, select: { id: true } });
  if (!page) return NextResponse.json({ error: "Página não encontrada." }, { status: 404 });

  const form = await req.formData();
  const file = form.get("cover");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "Arquivo não enviado." }, { status: 400 });
  }

  const ext = ALLOWED_TYPES[file.type];
  if (!ext) {
    return NextResponse.json({ error: "Formato não suportado. Use JPG, PNG ou WEBP." }, { status: 400 });
  }
  if (file.size > MAX_SIZE) {
    return NextResponse.json({ error: "Arquivo maior que 4MB." }, { status: 400 });
  }

  const dir = path.join(process.cwd(), "public", "uploads", "manual-covers");
  await mkdir(dir, { recursive: true });
  const filename = `${id}.${ext}`;
  const buffer = Buffer.from(await file.arrayBuffer());
  await writeFile(path.join(dir, filename), buffer);

  const coverImageUrl = `/api/manual-covers/${filename}?v=${Date.now()}`;
  await prisma.manualPage.update({ where: { id }, data: { coverImageUrl } });

  return NextResponse.json({ coverImageUrl });
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await getAuthContext();
  if (!ctx.tenantId || !canActOnSector(ctx, SECTOR)) {
    return NextResponse.json({ error: "Sem permissão." }, { status: 403 });
  }

  const { id } = await params;
  const prisma = getPrisma();
  const page = await prisma.manualPage.findFirst({ where: { id, tenantId: ctx.tenantId }, select: { id: true } });
  if (!page) return NextResponse.json({ error: "Página não encontrada." }, { status: 404 });

  await prisma.manualPage.update({ where: { id }, data: { coverImageUrl: null } });

  return NextResponse.json({ coverImageUrl: null });
}
