import { NextResponse, type NextRequest } from "next/server";
import { getAuthContext } from "@/lib/auth/context";
import { podeNoModulo } from "@/lib/auth/modulo";
import { getPrisma } from "@/lib/prisma";
import { competenciaValida } from "@/lib/financeiro/periodo";
import { txtDaDominio, xlsxDaDominio } from "@/lib/financeiro/dominio/planilha";
import { empresaContabilVisivel } from "@/lib/contabil/servidor";
import { relatorioDosPagamentos } from "@/lib/contabil/pagamentosServidor";
import { csvDasPendencias, csvDosLancamentos, linhasDosPagamentos, nomeDoArquivoDosPagamentos } from "@/lib/contabil/exportacaoDosPagamentos";

export const dynamic = "force-dynamic";

const TIPO = {
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  txt: "text/plain; charset=iso-8859-1",
  csv: "text/csv; charset=utf-8",
} as const;

/**
 * Os arquivos dos Pagamentos sem nota de um mês (03/11/2026): a planilha (ou o
 * .txt) de importação da Domínio, sempre na matriz, e os CSVs de lançamentos
 * e de pendências.
 */
export async function GET(req: NextRequest) {
  const ctx = await getAuthContext();
  const naoAchou = () => NextResponse.json({ error: "Não encontrado." }, { status: 404 });
  if (!ctx.tenantId || !(await podeNoModulo(ctx, "contabil_sped", "ver"))) return naoAchou();
  const p = req.nextUrl.searchParams;
  const mes = competenciaValida(p.get("mes") ?? undefined);
  const formato = p.get("formato") ?? "";
  if (!mes || !["xlsx", "txt", "lancamentos", "pendencias"].includes(formato)) return naoAchou();
  const empresa = await empresaContabilVisivel(ctx, p.get("empresa") ?? "");
  if (!empresa) return naoAchou();

  const r = await relatorioDosPagamentos(ctx.tenantId, empresa, mes);
  let corpo: Buffer | string;
  let nome: string;
  let tipo: string;
  if (formato === "xlsx" || formato === "txt") {
    if (!r.lancamentos.length) return NextResponse.json({ error: "Nenhum pagamento sem nota lançado no mês." }, { status: 409 });
    if (!r.codigoFilial.trim()) return NextResponse.json({ error: "A matriz não tem o Código Matriz/Filial da Domínio em Plano e contas: sem ele a planilha não diz onde lançar." }, { status: 409 });
    const linhas = linhasDosPagamentos(r.lancamentos, r.codigoFilial);
    corpo = formato === "txt" ? txtDaDominio(linhas) : await xlsxDaDominio(linhas);
    nome = nomeDoArquivoDosPagamentos(empresa.cnpj, mes, formato);
    tipo = TIPO[formato];
  } else if (formato === "lancamentos") {
    const contas = await getPrisma().contabilConta.findMany({ where: { tenantId: ctx.tenantId, companyId: empresa.baseId }, select: { reduzido: true, classificacao: true, nome: true } });
    const nomes = new Map(contas.map((c) => [c.reduzido, `${c.classificacao} — ${c.nome}`]));
    corpo = csvDosLancamentos(r.lancamentos, (c) => nomes.get(c) ?? "");
    nome = `lancamentos_apoio_${mes}.csv`;
    tipo = TIPO.csv;
  } else {
    corpo = csvDasPendencias(r.pendencias);
    nome = `pendencias_apoio_${mes}.csv`;
    tipo = TIPO.csv;
  }
  return new Response(typeof corpo === "string" ? corpo : new Uint8Array(corpo), {
    headers: { "Content-Type": tipo, "Content-Disposition": `attachment; filename="${nome}"`, "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" },
  });
}
