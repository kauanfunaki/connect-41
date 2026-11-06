import { NextResponse, type NextRequest } from "next/server";
import { getAuthContext } from "@/lib/auth/context";
import { podeNoModulo } from "@/lib/auth/modulo";
import { comAcompanhamento, csvDasPendencias, nomeDoArquivo } from "@/lib/revisao-contabil/fechamento";
import { reportMarkdown } from "@/lib/revisao-contabil/motor/relatorio";
import { carregarExecucao } from "@/lib/revisao-contabil/servidor";

export const dynamic = "force-dynamic";

// Os arquivos de uma execução, como os três botões do original: o relatório
// em Markdown, as pendências em CSV (com o acompanhamento de agora) e a
// execução inteira em JSON, para guardar ou comparar.
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await getAuthContext();
  const naoAchou = () => NextResponse.json({ error: "Não encontrado." }, { status: 404 });
  if (!ctx.tenantId || !(await podeNoModulo(ctx, "contabil_revisao", "ver"))) return naoAchou();
  const { id } = await params;
  const formato = req.nextUrl.searchParams.get("formato") ?? "md";
  if (!/^[0-9a-f-]{36}$/i.test(id) || !["md", "csv", "json"].includes(formato)) return naoAchou();
  const e = await carregarExecucao(ctx.tenantId, id);
  if (!e) return naoAchou();

  const r = e.resultado;
  const achados = r.findings.map((f) => comAcompanhamento(f, e.acompanhamento.get(f.id)));
  const base = `Revisao_${e.nomeDaEmpresa}_${r.closing.start}_${r.closing.end}`;
  let corpo: string;
  let tipo: string;
  if (formato === "md") {
    corpo = reportMarkdown(r, achados, Object.fromEntries(achados.map((f) => [f.id, f.nota])));
    tipo = "text/markdown; charset=utf-8";
  } else if (formato === "csv") {
    corpo = csvDasPendencias(e.nomeDaEmpresa, achados);
    tipo = "text/csv; charset=utf-8";
  } else {
    corpo = JSON.stringify({ ...r, acompanhamento: Object.fromEntries(e.acompanhamento) }, null, 2);
    tipo = "application/json; charset=utf-8";
  }
  return new Response(corpo, {
    headers: {
      "Content-Type": tipo,
      "Content-Disposition": `attachment; filename="${nomeDoArquivo(base, formato)}"`,
      "X-Content-Type-Options": "nosniff",
      "Cache-Control": "private, no-store",
    },
  });
}
