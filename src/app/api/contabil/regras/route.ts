import { NextRequest, NextResponse } from "next/server";
import { getAuthContext } from "@/lib/auth/context";
import { podeNoModulo } from "@/lib/auth/modulo";
import { empresaContabilVisivel, painelDoContabil } from "@/lib/contabil/servidor";
import { competenciaValida } from "@/lib/financeiro/periodo";
import { csvDeRegras } from "@/lib/contabil/regras";
export const dynamic = "force-dynamic";
export async function GET(req: NextRequest) {
  const ctx = await getAuthContext();
  const p = req.nextUrl.searchParams;
  if (!ctx.tenantId || !await podeNoModulo(ctx, "contabil_sped", "ver")) return NextResponse.json({ error: "Não encontrado." }, { status: 404 });
  const empresa = await empresaContabilVisivel(ctx, p.get("empresa") ?? "");
  const mes = competenciaValida(p.get("mes") ?? undefined);
  if (!empresa || !mes) return NextResponse.json({ error: "Não encontrado." }, { status: 404 });
  const pendencias = p.get("conteudo") === "pendencias";
  const painel = await painelDoContabil(ctx.tenantId, empresa, mes, { entradas: pendencias, sugestoes: false });
  const linhas = pendencias ? painel.pendencias.map((r) => ({ ...r, contaDebito: "", contaCredito: "" })) : painel.regras.map((r) => ({ ...r, valor: r.valorCentavos == null ? "" : (r.valorCentavos / 100).toFixed(2) }));
  return new Response(csvDeRegras(linhas), { headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": 'attachment; filename="' + (pendencias ? "pendencias" : "regras") + "_" + empresa.cnpj + "_" + mes + '.csv"', "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" } });
}
