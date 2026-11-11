import { NextRequest } from "next/server";
import { contextoDaTela } from "@/lib/atendimento/contexto";
import { arquivoDaMensagem } from "@/lib/atendimento/comandosDeMidia";
import { abreNaTela } from "@/lib/atendimento/midia";

export const dynamic = "force-dynamic";

/**
 * O arquivo de uma mensagem do Atendimento, para quem pode ver a conversa.
 * Qualquer falha é 404: não diz se o arquivo existe para quem não pode vê-lo.
 * Imagem com `?ver=1` abre na tela (a miniatura da conversa); o resto é download.
 */
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const c = await contextoDaTela();
  if (!c) return new Response("não encontrado", { status: 404 });
  const a = await arquivoDaMensagem(c, id);
  if (!a) return new Response("não encontrado", { status: 404 });
  const naTela = req.nextUrl.searchParams.get("ver") === "1" && abreNaTela(a.mime);
  return new Response(new Uint8Array(a.bytes), {
    headers: {
      "Content-Type": a.mime,
      "Content-Disposition": `${naTela ? "inline" : "attachment"}; filename*=UTF-8''${encodeURIComponent(a.nome)}`,
      "X-Content-Type-Options": "nosniff",
      "Cache-Control": "private, max-age=0, must-revalidate",
    },
  });
}
