import { NextRequest, NextResponse } from "next/server";
import { getAuthContext } from "@/lib/auth/context";
import { anexoParaVer, armazenamentoTech } from "@/lib/tech-interno/anexos";
import { respostaDoArquivoDoDrive } from "@/lib/drive/resposta";

export const runtime = "nodejs";

// Abrir (`?ver=1`, só PDF e imagem) ou baixar um anexo do Controle interno.
// Fora do módulo, ou de outro escritório, responde 404 sem dizer qual dos casos.
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await getAuthContext();
  if (!ctx.userId || !ctx.tenantId) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  const { id } = await params;
  const anexo = await anexoParaVer(ctx, id);
  if (!anexo) return NextResponse.json({ error: "Anexo não encontrado." }, { status: 404 });
  const conteudo = await armazenamentoTech.lerAnexo(anexo.fileUrl);
  if (!conteudo) return NextResponse.json({ error: "Anexo não encontrado no armazenamento." }, { status: 404 });
  return respostaDoArquivoDoDrive(conteudo, { name: anexo.fileName, mimeType: anexo.mimeType }, req.nextUrl.searchParams.get("ver") === "1");
}
