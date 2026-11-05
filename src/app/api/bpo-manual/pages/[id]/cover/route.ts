import { NextRequest, NextResponse } from "next/server";
import { mkdir, writeFile } from "fs/promises";
import path from "path";
import { getPrisma } from "@/lib/prisma";
import { getAuthContext, canActOnSector, podeExcluir, SO_ADMIN_EXCLUI, type AuthContext } from "@/lib/auth/context";

// A capa de uma página do manual. Desde 05/11/2026 (Apoio de todo setor) a
// permissão é a do setor do documento da página, e não a do setor da tela.

const ALLOWED_TYPES: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};
const MAX_SIZE = 4 * 1024 * 1024;

/** A página, se é deste escritório e a pessoa pode agir no setor do documento dela. */
async function paginaPermitida(ctx: AuthContext, id: string) {
  if (!ctx.tenantId) return null;
  const page = await getPrisma().manualPage.findFirst({ where: { id, tenantId: ctx.tenantId }, select: { id: true, document: { select: { sectorCode: true } } } });
  if (!page) return { erro: NextResponse.json({ error: "Página não encontrada." }, { status: 404 }) };
  if (!canActOnSector(ctx, page.document.sectorCode)) return { erro: NextResponse.json({ error: "Sem permissão." }, { status: 403 }) };
  return { page };
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await getAuthContext();
  if (!ctx.tenantId) return NextResponse.json({ error: "Sem permissão." }, { status: 403 });

  const { id } = await params;
  const achada = await paginaPermitida(ctx, id);
  if (!achada) return NextResponse.json({ error: "Sem permissão." }, { status: 403 });
  if ("erro" in achada) return achada.erro;

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
  await getPrisma().manualPage.update({ where: { id }, data: { coverImageUrl } });

  return NextResponse.json({ coverImageUrl });
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await getAuthContext();
  if (!ctx.tenantId) return NextResponse.json({ error: "Sem permissão." }, { status: 403 });
  // Remover a capa: só o administrador (13/10/2026). Trocar segue com quem escreve.
  if (!podeExcluir(ctx)) return NextResponse.json({ error: SO_ADMIN_EXCLUI }, { status: 403 });

  const { id } = await params;
  const achada = await paginaPermitida(ctx, id);
  if (!achada) return NextResponse.json({ error: "Sem permissão." }, { status: 403 });
  if ("erro" in achada) return achada.erro;

  await getPrisma().manualPage.update({ where: { id }, data: { coverImageUrl: null } });

  return NextResponse.json({ coverImageUrl: null });
}
