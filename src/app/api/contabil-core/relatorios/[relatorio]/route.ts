import { NextRequest, NextResponse } from "next/server";
import { getAuthContext } from "@/lib/auth/context";
import { podeNoModulo } from "@/lib/auth/modulo";
import { TIPO_DO_XLSX } from "@/lib/planilha/tabelaDoExcel";
import { ehUuid, primeiroErro, relatorioSchema } from "@/lib/contabil-core/entradas";
import { RELATORIOS, type QualRelatorio } from "@/lib/contabil-core/relatorios/planilha";
import { planilhaDoRelatorioDaEmpresa, relatorioDaEmpresa } from "@/lib/contabil-core/servidor/relatorios";

export const runtime = "nodejs";

// Os relatórios do Contábil Core (Bloco D, Fase D2, 26/11/2026): o `GET /relatorios/dre`, `/balancete` e
// `/livro-caixa` do original, com o período em datas (`de` e `ate`, inclusivas e opcionais). Só lê: pede "ver"
// (o `relatorios.read`). Com `formato=xlsx`, devolve a planilha do relatório (novo no Connect: o original só
// imprimia); a planilha leva os mesmos números da tela e, como a impressão, não vai para a auditoria.
export async function GET(req: NextRequest, { params }: { params: Promise<{ relatorio: string }> }) {
  const ctx = await getAuthContext();
  if (!ctx.userId || !ctx.tenantId) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  if (!(await podeNoModulo(ctx, "contabil_core", "ver"))) return NextResponse.json({ error: "Sem acesso ao Contábil Core." }, { status: 403 });

  const { relatorio } = await params;
  if (!(RELATORIOS as readonly string[]).includes(relatorio)) return NextResponse.json({ error: "Relatório não encontrado." }, { status: 404 });
  const qual = relatorio as QualRelatorio;
  const p = req.nextUrl.searchParams;
  const empresaId = p.get("empresa") ?? "";
  if (!ehUuid(empresaId)) return NextResponse.json({ error: "Empresa não informada." }, { status: 400 });
  const v = relatorioSchema.safeParse({ de: p.get("de"), ate: p.get("ate"), formato: p.get("formato") });
  if (!v.success) return NextResponse.json({ error: primeiroErro(v.error) }, { status: 400 });
  const periodo = { de: v.data.de, ate: v.data.ate };

  if (v.data.formato === "xlsx") {
    const r = await planilhaDoRelatorioDaEmpresa(qual, ctx.tenantId, empresaId.toLowerCase(), periodo);
    if (!r.ok) return NextResponse.json({ error: r.erro }, { status: 404 });
    return new NextResponse(new Uint8Array(r.valor.conteudo), {
      headers: { "Content-Type": TIPO_DO_XLSX, "Content-Disposition": `attachment; filename="${r.valor.nome}"`, "Cache-Control": "no-store" },
    });
  }
  const r = await relatorioDaEmpresa(qual, ctx.tenantId, empresaId.toLowerCase(), periodo);
  if (!r.ok) return NextResponse.json({ error: r.erro }, { status: 404 });
  return NextResponse.json(r.valor, { headers: { "Cache-Control": "no-store" } });
}
