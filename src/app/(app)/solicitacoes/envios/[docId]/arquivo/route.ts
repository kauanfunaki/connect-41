import { NextResponse } from "next/server";
import { getPrisma } from "@/lib/prisma";
import { getAuthContext } from "@/lib/auth/context";
import { scopedCompanyWhere } from "@/lib/auth/scope";
import { lerArquivoDoDocumento, respostaDoArquivoDoDocumento } from "@/lib/clientDocuments";

/**
 * O anexo do envio para a equipe baixar (08/10/2026) — antes só o cliente
 * baixava, pelo link do e-mail (`/d/[token]/arquivo`) ou pelo portal. Mesma
 * régua de acesso da tela do envio: o escritório da sessão e as empresas que a
 * pessoa enxerga. O download da equipe não entra na prova de recebimento do
 * cliente, então não grava visualização.
 */
export async function GET(_req: Request, { params }: { params: Promise<{ docId: string }> }) {
  const { docId } = await params;
  const ctx = await getAuthContext();
  if (!ctx.tenantId) return NextResponse.json({ error: "Arquivo não encontrado." }, { status: 404 });

  const documento = await getPrisma().clientDocument.findFirst({
    where: { id: docId, tenantId: ctx.tenantId, company: await scopedCompanyWhere(ctx) },
    select: { fileUrl: true, fileName: true, mimeType: true },
  });
  if (!documento?.fileUrl) return NextResponse.json({ error: "Arquivo não encontrado." }, { status: 404 });

  const conteudo = await lerArquivoDoDocumento(documento.fileUrl);
  if (!conteudo) return NextResponse.json({ error: "Arquivo não encontrado no armazenamento." }, { status: 404 });
  return respostaDoArquivoDoDocumento(conteudo, { fileUrl: documento.fileUrl, fileName: documento.fileName, mimeType: documento.mimeType });
}
