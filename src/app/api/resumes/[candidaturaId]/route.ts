import { NextRequest, NextResponse } from "next/server";
import { readFile } from "fs/promises";
import path from "path";
import { getPrisma } from "@/lib/prisma";
import { getAuthContext } from "@/lib/auth/context";

const STORAGE_DIR = path.join(process.cwd(), "storage", "resumes");

// Serve o currículo enviado pelo portal público. Currículo não é grupo
// sensível (diferente de ASO/atestado) — qualquer usuário autenticado do
// tenant pode ver, igual a um Document categoria CURRICULO sem flag sensitive.
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ candidaturaId: string }> }
) {
  const ctx = await getAuthContext();
  if (!ctx.userId || !ctx.tenantId) {
    return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  }

  const { candidaturaId } = await params;
  const prisma = getPrisma();
  const candidatura = await prisma.candidatura.findFirst({
    where: { id: candidaturaId, tenantId: ctx.tenantId },
    select: { resumeUrl: true, person: { select: { name: true } } },
  });
  if (!candidatura?.resumeUrl) {
    return NextResponse.json({ error: "Currículo não encontrado." }, { status: 404 });
  }

  // resumeUrl é sempre "<tenantId>/<uuid>.pdf" gravado pela rota de apply —
  // nunca vem de input do candidato, sem risco de path traversal.
  const filePath = path.join(STORAGE_DIR, candidatura.resumeUrl);
  try {
    const buffer = await readFile(filePath);
    return new NextResponse(buffer, {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${encodeURIComponent(`curriculo-${candidatura.person.name}.pdf`)}"`,
        "Cache-Control": "private, max-age=0, must-revalidate",
      },
    });
  } catch {
    return NextResponse.json({ error: "Arquivo não encontrado no armazenamento." }, { status: 404 });
  }
}
