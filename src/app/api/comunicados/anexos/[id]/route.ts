import { NextRequest, NextResponse } from "next/server";
import { getPrisma } from "@/lib/prisma";
import { getAuthContext, canViewSector } from "@/lib/auth/context";
import { respostaDoAnexo } from "@/lib/financeiro/pendencias/armazenamento";
import { anexosDoComunicado } from "@/lib/comunicados/avisos";

// Anexo de comunicado pela equipe: só para quem enxerga o setor que comunicou.
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await getAuthContext();
  if (!ctx.tenantId) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  const { id } = await params;
  const anexo = await getPrisma().clientAnnouncementAttachment.findFirst({
    where: { id, announcement: { tenantId: ctx.tenantId } },
    select: { fileName: true, fileUrl: true, mimeType: true, announcement: { select: { sectorCode: true } } },
  });
  if (!anexo || !canViewSector(ctx, anexo.announcement.sectorCode)) return NextResponse.json({ error: "Anexo não encontrado." }, { status: 404 });
  const conteudo = await anexosDoComunicado.lerAnexo(anexo.fileUrl);
  if (!conteudo) return NextResponse.json({ error: "Arquivo não encontrado no armazenamento." }, { status: 404 });
  return respostaDoAnexo(conteudo, anexo);
}
