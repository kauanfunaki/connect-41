import { NextResponse } from "next/server";
import { z } from "zod";
import { getAuthContext } from "@/lib/auth/context";
import { podeNoModulo } from "@/lib/auth/modulo";
import { autorizar, ErroFiscal } from "@/lib/fiscal/sped/local/servidor";
import { trazerDoAcervo } from "@/lib/fiscal/sped/local/acervoServidor";

export const runtime = "nodejs";

/**
 * "Trazer do acervo" (10/11/2026): um lote do acervo da empresa (ou do grupo,
 * no consolidado) pedido ao motor e posto na fila de importação. A tela chama
 * de novo com o cursor até `restantes` zerar. A permissão é a de importar
 * arquivo na área do SPED.
 */
export async function POST(req: Request) {
  try {
    const ctx = await getAuthContext();
    if (!await podeNoModulo(ctx, "fiscal_acervo", "agir")) throw new ErroFiscal("Sem permissão para importar.", 404);
    const corpo = z.object({ empresa: z.string().min(1), aba: z.enum(["classificacao", "apuracao", "fechamento"]) }).passthrough().parse(await req.json());
    await autorizar(ctx, corpo.empresa, corpo.aba, true);
    return NextResponse.json({ ok: true, ...await trazerDoAcervo(ctx, corpo) });
  } catch (e) {
    if (!(e instanceof ErroFiscal) && !(e instanceof z.ZodError)) console.error("[sped/local] trazer do acervo", e);
    return NextResponse.json(
      { error: e instanceof z.ZodError ? e.issues[0]?.message : e instanceof ErroFiscal ? e.message : "Não foi possível trazer do acervo. O que já entrou na fila foi preservado." },
      { status: e instanceof ErroFiscal ? e.status : e instanceof z.ZodError ? 422 : 500 },
    );
  }
}
