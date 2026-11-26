import { NextRequest, NextResponse } from "next/server";
import { getAuthContext } from "@/lib/auth/context";
import { podeNoModulo } from "@/lib/auth/modulo";
import { logAudit } from "@/lib/audit";
import { ehUuid, exportacaoSchema, primeiroErro } from "@/lib/contabil-core/entradas";
import { gerarExportacao } from "@/lib/contabil-core/servidor/exportacao";

export const runtime = "nodejs";

// As exportações do Contábil Core, geradas na hora e devolvidas como download: o arquivo do Domínio (Fase 2,
// 09/11/2026; sem `tipo`, é ele) e, na Fase D1 (26/11/2026), os lançamentos, o extrato com os filtros da
// tela, as baixas de notas e a conferência, em CSV, XLSX ou TXT (só o Domínio), como o
// `POST /exportacao/gerar` do original. Os avisos (conta sem código reduzido, lançamento sem par) vão num
// cabeçalho, como no original, para a tela mostrar sem o contador precisar abrir o arquivo.
export async function GET(req: NextRequest) {
  const ctx = await getAuthContext();
  if (!ctx.userId || !ctx.tenantId) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  if (!(await podeNoModulo(ctx, "contabil_core", "agir"))) return NextResponse.json({ error: "Sem acesso ao Contábil Core." }, { status: 403 });

  const p = req.nextUrl.searchParams;
  const empresaId = p.get("empresa") ?? "";
  if (!ehUuid(empresaId)) return NextResponse.json({ error: "Empresa não informada." }, { status: 400 });
  const v = exportacaoSchema.safeParse({
    tipo: p.get("tipo"),
    mes: p.get("mes") ?? "",
    agenciaId: p.get("agencia") || null,
    formato: p.get("formato") ?? "",
    usarHistoricoExtrato: p.get("historicoExtrato") === "1",
    incluirContasInativas: p.get("inativas") === "1",
    status: p.get("status") || null,
    busca: p.get("busca") || null,
    dc: p.get("dc") || null,
    valorMin: p.get("valorMin") || null,
    valorMax: p.get("valorMax") || null,
  });
  if (!v.success) return NextResponse.json({ error: primeiroErro(v.error) }, { status: 400 });

  const r = await gerarExportacao(ctx.tenantId, ctx.userId, empresaId.toLowerCase(), v.data);
  if (!r.ok) return NextResponse.json({ error: r.erro }, { status: 400 });
  await logAudit({
    tenantId: ctx.tenantId,
    userId: ctx.userId,
    action: "contabil.core.exportacao.gerada",
    entityType: "CoreEmpresa",
    entityId: empresaId.toLowerCase(),
    metadata: { nome: r.valor.nome, tipo: r.valor.exportacao, linhas: r.valor.linhas, formato: v.data.formato, mes: v.data.mes },
  });
  const corpo = typeof r.valor.conteudo === "string" ? r.valor.conteudo : Buffer.from(r.valor.conteudo);
  return new NextResponse(corpo, {
    headers: {
      "Content-Type": r.valor.tipo,
      "Content-Disposition": `attachment; filename="${r.valor.nome}"`,
      "Cache-Control": "no-store",
      "X-Avisos": encodeURIComponent(r.valor.avisos.join(" | ")),
    },
  });
}
