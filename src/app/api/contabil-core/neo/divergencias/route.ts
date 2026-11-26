import { NextRequest, NextResponse } from "next/server";
import { getAuthContext } from "@/lib/auth/context";
import { podeNoModulo } from "@/lib/auth/modulo";
import { divergenciasSchema, ehUuid, primeiroErro } from "@/lib/contabil-core/entradas";
import { consultarDivergencias } from "@/lib/contabil-core/servidor/painel";

export const runtime = "nodejs";

// "Conflitos e qualidade" (Bloco D, Fase D1, 26/11/2026): o `GET /neo/divergencias` do original. Resume as
// medições da sombra do NEO (a conta da regra × a da contraparte) no mês e na conta bancária pedidos. Só lê:
// pede "ver" (o `neo.read`).
export async function GET(req: NextRequest) {
  const ctx = await getAuthContext();
  if (!ctx.userId || !ctx.tenantId) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  if (!(await podeNoModulo(ctx, "contabil_core", "ver"))) return NextResponse.json({ error: "Sem acesso ao Contábil Core." }, { status: 403 });

  const p = req.nextUrl.searchParams;
  const empresaId = p.get("empresa") ?? "";
  if (!ehUuid(empresaId)) return NextResponse.json({ error: "Empresa não informada." }, { status: 400 });
  const v = divergenciasSchema.safeParse({ mes: p.get("mes"), agenciaId: p.get("agencia") || null });
  if (!v.success) return NextResponse.json({ error: primeiroErro(v.error) }, { status: 400 });

  const r = await consultarDivergencias(ctx.tenantId, empresaId.toLowerCase(), v.data);
  if (!r.ok) return NextResponse.json({ error: r.erro }, { status: 404 });
  return NextResponse.json(r.valor, { headers: { "Cache-Control": "no-store" } });
}
