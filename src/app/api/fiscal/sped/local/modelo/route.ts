import { NextResponse } from "next/server";
import { getAuthContext } from "@/lib/auth/context";
import { podeNoModulo } from "@/lib/auth/modulo";
import { COLUNAS_APOIO } from "@/lib/fiscal/sped/local/importacao";
import { csvSeguro } from "@/lib/fiscal/sped/local/exportacao";
import ExcelJS from "exceljs";
import { TIPO_DO_XLSX } from "@/lib/planilha/tabelaDoExcel";
export async function GET(req: Request) {
  const ctx = await getAuthContext(); if (!await podeNoModulo(ctx, "fiscal_acervo", "ver")) return NextResponse.json({ error: "Não encontrado." }, { status: 404 });
  if (new URL(req.url).searchParams.get("formato") === "csv") return new NextResponse(csvSeguro([...COLUNAS_APOIO], []), { headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": 'attachment; filename="modelo-documentos-apoio.csv"' } });
  const livro = new ExcelJS.Workbook(), folha = livro.addWorksheet("Documentos de apoio"); folha.addRow([...COLUNAS_APOIO]); folha.columns.forEach(c => { c.width = 24; c.numFmt = "@"; });
  const guia = livro.addWorksheet("Instruções"); guia.addRows([["Uma linha por pagamento. CPF/CNPJ e identificação devem ser texto."], ["competencia: AAAA-MM; dataPagamento: AAAA-MM-DD; bruto/liquido: decimal com ponto."], ["categoria: rpa, recibo, contrato_motorista, contrato_locacao, contrato_locacao_imovel ou fatura."], ["A importação mantém o documento pendente para decisão fiscal. Não inclua fórmulas."], ["Não altere os cabeçalhos nem a ordem das colunas da primeira aba."]]); guia.getColumn(1).width = 110;
  return new NextResponse(new Uint8Array(await livro.xlsx.writeBuffer()), { headers: { "Content-Type": TIPO_DO_XLSX, "Content-Disposition": 'attachment; filename="modelo-documentos-apoio.xlsx"' } });
}
