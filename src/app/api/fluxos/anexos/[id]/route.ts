import { readFile } from "node:fs/promises";
import { NextResponse, type NextRequest } from "next/server";
import { getPrisma } from "@/lib/prisma";
import { getAuthContext } from "@/lib/auth/context";
import { isModuleEnabled } from "@/lib/modules";
import { disposicaoDoAnexo } from "@/lib/fluxos/arquivos";
import { MODULO_FLUXOS, podeVerOsFluxos } from "@/lib/fluxos/regras";
import { caminhoDoAnexo } from "@/lib/fluxos/servidor";

export const runtime = "nodejs";

/**
 * Serve um arquivo anexado a um fluxo (10/11/2026): só para quem vê o
 * Repositório de fluxos do setor do fluxo, com o módulo ligado. O caminho no
 * disco sai do banco (um uuid conferido pelo formato), e a pasta é a do
 * escritório de quem pede — nada da URL vira caminho.
 *
 * `?baixar=1` baixa; sem ele, imagem e PDF abrem no navegador (a prévia), e o
 * .drawio baixa sempre. `nosniff` em todos (o tipo é o conferido pelos bytes
 * na entrada), e a imagem aberta no navegador vai ainda com política sem
 * script. O PDF fica sem ela: o visualizador do navegador não abre sandboxado.
 */
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await getAuthContext();
  if (!ctx.tenantId || !ctx.userId || !(await isModuleEnabled(ctx.tenantId, MODULO_FLUXOS))) {
    return NextResponse.json({ error: "Sem permissão." }, { status: 403 });
  }
  const { id } = await params;
  const anexo = await getPrisma().flowAttachment.findFirst({
    where: { id, flowDoc: { tenantId: ctx.tenantId } },
    select: { fileName: true, mime: true, storagePath: true, flowDoc: { select: { folder: { select: { sectorCode: true } } } } },
  });
  if (!anexo) return NextResponse.json({ error: "Arquivo não encontrado." }, { status: 404 });
  if (!podeVerOsFluxos(ctx, anexo.flowDoc.folder.sectorCode)) return NextResponse.json({ error: "Sem permissão." }, { status: 403 });

  const caminho = caminhoDoAnexo(ctx.tenantId, anexo.storagePath);
  if (!caminho) return NextResponse.json({ error: "Arquivo não encontrado." }, { status: 404 });
  try {
    const bytes = await readFile(caminho);
    const previa = anexo.mime !== "application/vnd.jgraph.mxfile";
    const inline = previa && req.nextUrl.searchParams.get("baixar") !== "1";
    return new NextResponse(new Uint8Array(bytes), {
      headers: {
        "Content-Type": anexo.mime,
        "Content-Disposition": disposicaoDoAnexo(anexo.fileName, inline),
        "X-Content-Type-Options": "nosniff",
        "Cache-Control": "private, max-age=0, must-revalidate",
        ...(inline && anexo.mime.startsWith("image/") ? { "Content-Security-Policy": "default-src 'none'; img-src 'self'; style-src 'unsafe-inline'; sandbox" } : {}),
      },
    });
  } catch {
    return NextResponse.json({ error: "Arquivo não encontrado." }, { status: 404 });
  }
}
