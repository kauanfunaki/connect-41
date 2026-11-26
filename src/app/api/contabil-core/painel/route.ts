import { NextRequest, NextResponse } from "next/server";
import { getAuthContext } from "@/lib/auth/context";
import { podeNoModulo } from "@/lib/auth/modulo";
import { ehUuid, painelSchema, primeiroErro } from "@/lib/contabil-core/entradas";
import { estatisticasDaEmpresa } from "@/lib/contabil-core/servidor/painel";

export const runtime = "nodejs";

// O painel da empresa (Bloco D, Fase D1, 26/11/2026): o `GET /stats` do original (o resumo, a série mensal e
// a classificação por conta bancária). Só lê: pede "ver" (o `stats.read`).
export async function GET(req: NextRequest) {
  const ctx = await getAuthContext();
  if (!ctx.userId || !ctx.tenantId) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  if (!(await podeNoModulo(ctx, "contabil_core", "ver"))) return NextResponse.json({ error: "Sem acesso ao Contábil Core." }, { status: 403 });

  const p = req.nextUrl.searchParams;
  const empresaId = p.get("empresa") ?? "";
  if (!ehUuid(empresaId)) return NextResponse.json({ error: "Empresa não informada." }, { status: 400 });
  const v = painelSchema.safeParse({ meses: p.get("meses") });
  if (!v.success) return NextResponse.json({ error: primeiroErro(v.error) }, { status: 400 });

  const r = await estatisticasDaEmpresa(ctx.tenantId, empresaId.toLowerCase(), v.data.meses);
  if (!r.ok) return NextResponse.json({ error: r.erro }, { status: 404 });
  return NextResponse.json(r.valor, { headers: { "Cache-Control": "no-store" } });
}
