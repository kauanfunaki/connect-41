import { NextRequest, NextResponse } from "next/server";
import { getPrisma } from "@/lib/prisma";
import { getPortalSession } from "@/lib/auth/portal";
import { getEnabledModuleCodes } from "@/lib/modules";
import { respostaDoAnexo } from "@/lib/financeiro/pendencias/armazenamento";
import { anexosDoComunicado } from "@/lib/comunicados/avisos";

// Anexo de comunicado pelo cliente: só se o comunicado foi para o grupo dele.
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const sessao = await getPortalSession();
  if (!sessao) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  if (!(await getEnabledModuleCodes(sessao.tenantId)).has("portal_solicitacoes")) return NextResponse.json({ error: "Não encontrado." }, { status: 404 });

  const { id } = await params;
  const anexo = await getPrisma().clientAnnouncementAttachment.findFirst({
    where: { id, announcement: { tenantId: sessao.tenantId, groups: { some: { clientGroupId: sessao.clientGroupId } } } },
    select: { fileName: true, fileUrl: true, mimeType: true },
  });
  if (!anexo) return NextResponse.json({ error: "Anexo não encontrado." }, { status: 404 });
  const conteudo = await anexosDoComunicado.lerAnexo(anexo.fileUrl);
  if (!conteudo) return NextResponse.json({ error: "Arquivo não encontrado no armazenamento." }, { status: 404 });
  return respostaDoAnexo(conteudo, anexo);
}
