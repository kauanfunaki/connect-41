import { NextRequest, NextResponse } from "next/server";
import { getAuthContext } from "@/lib/auth/context";
import { podeNoModulo } from "@/lib/auth/modulo";
import { carteiraSchema, primeiroErro } from "@/lib/contabil-core/entradas";
import { carteiraDoEscritorio } from "@/lib/contabil-core/servidor/painel";
import { mesAtual } from "@/lib/contabil-core/tela";

export const runtime = "nodejs";

// A carteira do escritório (Bloco D, Fase D1, 26/11/2026): o `GET /carteira` do original. O trabalho da
// competência em cada empresa do escritório (importadas, classificadas, pendências, erros e o valor pendente),
// com as de mais pendências primeiro. Só lê: pede "ver". Sem competência, vale o mês corrente do escritório.
export async function GET(req: NextRequest) {
  const ctx = await getAuthContext();
  if (!ctx.userId || !ctx.tenantId) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  if (!(await podeNoModulo(ctx, "contabil_core", "ver"))) return NextResponse.json({ error: "Sem acesso ao Contábil Core." }, { status: 403 });

  const v = carteiraSchema.safeParse({ mes: req.nextUrl.searchParams.get("mes") });
  if (!v.success) return NextResponse.json({ error: primeiroErro(v.error) }, { status: 400 });
  return NextResponse.json(await carteiraDoEscritorio(ctx.tenantId, v.data.mes ?? mesAtual()), { headers: { "Cache-Control": "no-store" } });
}
