import { NextRequest, NextResponse } from "next/server";
import { getPrisma } from "@/lib/prisma";
import { getAuthContext } from "@/lib/auth/context";
import { podeAbrirPendencia, reguaDasPendencias } from "@/lib/financeiro/pendencias/acesso";
import { lerAnexo, respostaDoAnexo } from "@/lib/financeiro/pendencias/armazenamento";

// Download de anexo de pendência pela equipe. A régua é a da tela
// `/pendencias/[id]` (`podeAbrirPendencia`): pedidos ao cliente ligados no
// escritório e o setor DA PENDÊNCIA visível para quem pede — não mais o setor
// do módulo do BPO, que barrava o pedido feito pelo DP ou pelo Fiscal. O anexo
// é procurado com o `tenantId` no `where` — id de outro tenant responde 404,
// como id inexistente.
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await getAuthContext();
  if (!ctx.userId || !ctx.tenantId) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  const regua = await reguaDasPendencias(ctx.tenantId);
  if (!regua.ligados) return NextResponse.json({ error: "Sem permissão." }, { status: 403 });

  const { id } = await params;
  const anexo = await getPrisma().clientRequestAttachment.findFirst({
    where: { id, request: { tenantId: ctx.tenantId } },
    select: { fileName: true, fileUrl: true, mimeType: true, request: { select: { tenantId: true, sectorCode: true } } },
  });
  if (!anexo) return NextResponse.json({ error: "Anexo não encontrado." }, { status: 404 });
  if (!podeAbrirPendencia(ctx, regua, anexo.request)) return NextResponse.json({ error: "Sem permissão." }, { status: 403 });

  const conteudo = await lerAnexo(anexo.fileUrl);
  if (!conteudo) return NextResponse.json({ error: "Arquivo não encontrado no armazenamento." }, { status: 404 });
  return respostaDoAnexo(conteudo, anexo);
}
