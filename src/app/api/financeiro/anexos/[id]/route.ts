import { NextRequest, NextResponse } from "next/server";
import { getPrisma } from "@/lib/prisma";
import { getAuthContext } from "@/lib/auth/context";
import { podeVerOTipo } from "@/lib/financeiro/acessoDaConta";
import { armazenamentoDosAnexos } from "@/lib/financeiro/anexos";
import { respostaDoAnexo } from "@/lib/financeiro/pendencias/armazenamento";

// Download do anexo de um lançamento (lote H2, 19/10). Quem baixa é quem vê a
// conta — o setor de Contas a pagar, Contas a receber ou Lançamentos. O anexo é
// procurado com o `tenantId` no `where`: id de outro escritório responde 404,
// como id inexistente.
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await getAuthContext();
  if (!ctx.userId || !ctx.tenantId) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

  const { id } = await params;
  const anexo = await getPrisma().financeEntryAttachment.findFirst({
    where: { id, tenantId: ctx.tenantId },
    select: { fileName: true, fileUrl: true, mimeType: true, entry: { select: { kind: true } } },
  });
  if (!anexo) return NextResponse.json({ error: "Anexo não encontrado." }, { status: 404 });
  if (!(await podeVerOTipo(ctx, anexo.entry.kind))) return NextResponse.json({ error: "Sem permissão." }, { status: 403 });

  const conteudo = await armazenamentoDosAnexos.lerAnexo(anexo.fileUrl);
  if (!conteudo) return NextResponse.json({ error: "Arquivo não encontrado no armazenamento." }, { status: 404 });
  return respostaDoAnexo(conteudo, anexo);
}
