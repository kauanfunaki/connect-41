import { NextRequest, NextResponse } from "next/server";
import { mkdir, writeFile } from "fs/promises";
import path from "path";
import { revalidatePath } from "next/cache";
import { getPrisma } from "@/lib/prisma";
import { getAuthContext, isFullWrite } from "@/lib/auth/context";

const ALLOWED_TYPES: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};
const MAX_SIZE = 2 * 1024 * 1024;

// Quem troca o logo: o suporte (SUPER_ADMIN), em qualquer escritório; e,
// desde 21/10/2026, o administrador do próprio escritório — o logo entrou na
// Aparência do portal (Administração › Empresa), que é tela dele.
function podeTrocarLogo(ctx: Awaited<ReturnType<typeof getAuthContext>>, id: string): boolean {
  return ctx.role === "SUPER_ADMIN" || (isFullWrite(ctx.role) && !!ctx.tenantId && ctx.tenantId === id);
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await getAuthContext();
  const { id } = await params;
  if (!podeTrocarLogo(ctx, id)) {
    return NextResponse.json({ error: "Sem permissão." }, { status: 403 });
  }

  const prisma = getPrisma();
  const tenant = await prisma.tenant.findUnique({ where: { id }, select: { id: true } });
  if (!tenant) return NextResponse.json({ error: "Workspace não encontrado." }, { status: 404 });

  const form = await req.formData();
  const file = form.get("logo");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "Arquivo não enviado." }, { status: 400 });
  }

  const ext = ALLOWED_TYPES[file.type];
  if (!ext) {
    return NextResponse.json({ error: "Formato não suportado. Use JPG, PNG ou WEBP." }, { status: 400 });
  }
  if (file.size > MAX_SIZE) {
    return NextResponse.json({ error: "Arquivo maior que 2MB." }, { status: 400 });
  }

  const dir = path.join(process.cwd(), "public", "uploads", "workspaces");
  await mkdir(dir, { recursive: true });
  const filename = `${id}.${ext}`;
  const buffer = Buffer.from(await file.arrayBuffer());
  await writeFile(path.join(dir, filename), buffer);

  const logoUrl = `/api/workspace-logos/${filename}?v=${Date.now()}`;
  await prisma.tenant.update({ where: { id }, data: { logoUrl } });
  revalidatePath("/", "layout");

  return NextResponse.json({ logoUrl });
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await getAuthContext();
  const { id } = await params;
  if (!podeTrocarLogo(ctx, id)) {
    return NextResponse.json({ error: "Sem permissão." }, { status: 403 });
  }

  const prisma = getPrisma();
  await prisma.tenant.update({ where: { id }, data: { logoUrl: null } });
  revalidatePath("/", "layout");

  return NextResponse.json({ logoUrl: null });
}
