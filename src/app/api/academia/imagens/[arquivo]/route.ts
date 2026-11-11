import { readFile } from "node:fs/promises";
import path from "node:path";
import { NextResponse, type NextRequest } from "next/server";
import { getAuthContext } from "@/lib/auth/context";
import { isModuleEnabled } from "@/lib/modules";
import { MODULO_ACADEMIA } from "@/lib/academia/regras";
import { MIME_DA_EXTENSAO, ehArquivoDeImagem } from "@/lib/academia/imagens";

export const runtime = "nodejs";

/**
 * Serve uma imagem das questões de lógica (10/11/2026): só para a equipe do
 * próprio escritório, com a Academia ligada. O nome é um uuid conferido pelo
 * formato, e a pasta é a do escritório de quem pede — nada da URL vira caminho.
 */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ arquivo: string }> }) {
  const ctx = await getAuthContext();
  if (!ctx.tenantId || !ctx.userId || !(await isModuleEnabled(ctx.tenantId, MODULO_ACADEMIA))) {
    return NextResponse.json({ error: "Sem permissão." }, { status: 403 });
  }
  const { arquivo } = await params;
  if (!ehArquivoDeImagem(arquivo)) return NextResponse.json({ error: "Arquivo inválido." }, { status: 400 });
  try {
    const bytes = await readFile(path.join(process.cwd(), "storage", "academia", ctx.tenantId, arquivo));
    return new NextResponse(new Uint8Array(bytes), {
      headers: {
        "Content-Type": MIME_DA_EXTENSAO[arquivo.split(".").pop() ?? ""] ?? "application/octet-stream",
        // O nome nunca muda de conteúdo (cada envio é um uuid novo).
        "Cache-Control": "private, max-age=604800, immutable",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch {
    return NextResponse.json({ error: "Imagem não encontrada." }, { status: 404 });
  }
}
