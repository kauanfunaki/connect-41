import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { getAuthContext } from "@/lib/auth/context";
import { autorizar, ErroFiscal } from "@/lib/fiscal/sped/local/servidor";
import { geracoesDaTela } from "@/lib/fiscal/sped/local/geracao";

export const dynamic = "force-dynamic";

const competenciaMensalSchema = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/);

/**
 * O andamento das gerações da empresa na competência (06/11/2026). A tela do
 * Gerar SPED relê isto a cada poucos segundos enquanto há geração na fila ou
 * executando — leve de propósito: não recalcula a apuração.
 */
export async function GET(req: NextRequest) {
  try {
    const ctx = await getAuthContext();
    const empresa = await autorizar(ctx, req.nextUrl.searchParams.get("empresa") ?? "", "gerar");
    const competencia = competenciaMensalSchema.parse(req.nextUrl.searchParams.get("competencia"));
    return NextResponse.json(await geracoesDaTela(ctx.tenantId, empresa, competencia), { headers: { "Cache-Control": "private, no-store" } });
  } catch (e) {
    if (e instanceof ErroFiscal) return NextResponse.json({ error: e.message }, { status: e.status });
    return NextResponse.json({ error: "Competência inválida." }, { status: 422 });
  }
}
