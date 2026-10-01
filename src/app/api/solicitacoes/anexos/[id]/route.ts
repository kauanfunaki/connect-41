import { NextRequest, NextResponse } from "next/server";
import { getPrisma } from "@/lib/prisma";
import { getAuthContext } from "@/lib/auth/context";
import { isModuleEnabled } from "@/lib/modules";
import { respostaDoAnexo } from "@/lib/financeiro/pendencias/armazenamento";
import { anexosDaSolicitacao } from "@/lib/solicitacoes/armazenamento";
import { podeVerSolicitacao } from "@/lib/solicitacoes/acesso";

// Download de anexo de solicitação pela equipe: só para quem enxerga o setor
// que atende (ou é o responsável) — a mesma régua da tela da solicitação.
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await getAuthContext();
  if (!ctx.tenantId) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  if (!(await isModuleEnabled(ctx.tenantId, "portal_solicitacoes"))) return NextResponse.json({ error: "Não encontrado." }, { status: 404 });

  const { id } = await params;
  const anexo = await getPrisma().serviceRequestAttachment.findFirst({
    where: { id, request: { tenantId: ctx.tenantId } },
    select: { fileName: true, fileUrl: true, mimeType: true, request: { select: { sectorCode: true, assigneeId: true } } },
  });
  if (!anexo || !podeVerSolicitacao(ctx, anexo.request)) return NextResponse.json({ error: "Anexo não encontrado." }, { status: 404 });

  const conteudo = await anexosDaSolicitacao.lerAnexo(anexo.fileUrl);
  if (!conteudo) return NextResponse.json({ error: "Arquivo não encontrado no armazenamento." }, { status: 404 });
  return respostaDoAnexo(conteudo, anexo);
}
