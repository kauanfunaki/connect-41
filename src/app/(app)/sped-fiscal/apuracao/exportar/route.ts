import { NextResponse, type NextRequest } from "next/server";
import { getAuthContext } from "@/lib/auth/context";
import { podeNoModulo } from "@/lib/auth/modulo";
import { gerarPlanilhaDeTabelas, TIPO_DO_XLSX } from "@/lib/planilha/tabelaDoExcel";
import { prepararTelaDoSped } from "@/lib/fiscal/sped/tela";
import { arquivosDaCompetencia, carregarApuracao } from "@/lib/fiscal/sped/dados";
import { abasDaApuracao, csvDoLivro } from "@/lib/fiscal/sped/exportacao";
import { cnpjFormatado } from "@/lib/fiscal/sped/formato";
import { dataHora } from "@/lib/fiscal/motor/formato";

export const dynamic = "force-dynamic";

const erro = (mensagem: string, status: number) => NextResponse.json({ erro: mensagem }, { status, headers: { "Cache-Control": "no-store" } });

/**
 * A apuração e o livro fiscal do arquivo vigente da empresa na competência,
 * em Excel (todas as abas) ou CSV (o livro). A empresa tem de vir na URL e
 * estar entre as que a pessoa vê: a exportação não cai na "última aberta".
 */
export async function GET(req: NextRequest) {
  const ctx = await getAuthContext();
  if (!ctx.tenantId || !(await podeNoModulo(ctx, "fiscal_icms_ipi", "ver"))) return erro("Não encontrado.", 404);
  const params = Object.fromEntries(req.nextUrl.searchParams);
  const tela = await prepararTelaDoSped(params, "apuracao");
  if (!tela) return erro("A integração com o motor SPED não está configurada.", 404);
  const estab = tela.estabelecimento;
  if (!estab || tela.escolha.tipo !== "empresa" || tela.escolha.origem !== "url") return erro("Empresa não encontrada.", 404);

  const arquivos = await arquivosDaCompetencia(tela, estab);
  if (arquivos.erro !== null) return erro(arquivos.erro, 502);
  const arquivo = arquivos.dados.vigente;
  if (!arquivo) return erro("Não há arquivo gerado nesta competência.", 404);
  const d = await carregarApuracao(tela, estab, arquivo);
  if (d.erro !== null) return erro(d.erro, 502);

  const nome = `sped-icms-${estab.cnpj}-${tela.competencia}`;
  if (req.nextUrl.searchParams.get("formato") === "csv") {
    return new NextResponse(csvDoLivro(d.dados.livro), {
      headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="${nome}-livro.csv"`, "Cache-Control": "no-store" },
    });
  }
  const planilha = await gerarPlanilhaDeTabelas({
    abas: abasDaApuracao(d.dados.apuracao, d.dados.livro),
    filtros: [
      ["Empresa", `${estab.companyNome} · ${cnpjFormatado(estab.cnpj)}`],
      ["Competência", tela.competencia],
      ["Arquivo", `${arquivo.nome_arquivo} · versão ${arquivo.versao} · gerado em ${dataHora(arquivo.gerado_em)}`],
      ["Fonte", "Lido pelo Connect do arquivo da EFD ICMS/IPI gerado pelo motor SPED."],
    ],
  });
  return new NextResponse(new Uint8Array(planilha), {
    headers: { "Content-Type": TIPO_DO_XLSX, "Content-Disposition": `attachment; filename="${nome}.xlsx"`, "Cache-Control": "no-store" },
  });
}
