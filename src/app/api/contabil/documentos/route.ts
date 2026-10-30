import { NextRequest, NextResponse } from "next/server";
import { getAuthContext } from "@/lib/auth/context";
import { podeNoModulo } from "@/lib/auth/modulo";
import { empresaContabilVisivel, entradasDoMes } from "@/lib/contabil/servidor";
import { competenciaValida } from "@/lib/financeiro/periodo";
export const dynamic = "force-dynamic";
export async function GET(req: NextRequest) {
  const ctx = await getAuthContext();
  const p = req.nextUrl.searchParams;
  const mes = competenciaValida(p.get("mes") ?? undefined);
  const fornecedor = p.get("fornecedor") ?? "";
  const cfop = p.get("cfop") ?? "";
  if (!ctx.tenantId || !await podeNoModulo(ctx, "contabil_sped", "ver") || !mes || !/^(\d{11}|\d{14})$/.test(fornecedor) || !/^(\d{4})?$/.test(cfop)) return NextResponse.json({ error: "Não encontrado." }, { status: 404 });
  const empresa = await empresaContabilVisivel(ctx, p.get("empresa") ?? "");
  if (!empresa) return NextResponse.json({ error: "Não encontrado." }, { status: 404 });
  const notas = await entradasDoMes(ctx.tenantId, empresa, mes, fornecedor);
  return NextResponse.json({ notas: cfop ? notas.filter((e) => e.cfops.includes(cfop)) : notas }, { headers: { "Cache-Control": "private, no-store" } });
}
