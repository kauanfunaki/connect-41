import { NextResponse } from "next/server";
import ExcelJS from "exceljs";
import { ErroFiscal, carregarBase, prepararTelaLocal } from "@/lib/fiscal/sped/local/servidor";
import { csvSeguro, relatorioLocal } from "@/lib/fiscal/sped/local/exportacao";
import { obrigacaoSchema } from "@/lib/fiscal/sped/local/dominio";
import { TIPO_DO_XLSX } from "@/lib/planilha/tabelaDoExcel";
import { podeNoModulo } from "@/lib/auth/modulo";

export async function GET(req: Request) {
  try {
    const p = Object.fromEntries(new URL(req.url).searchParams), aba = ["classificacao", "apuracao", "fechamento"].includes(p.aba) ? p.aba as "classificacao" | "apuracao" | "fechamento" : "apuracao";
    const tela = await prepararTelaLocal(p, aba); if (!tela.contexto) throw new ErroFiscal("Selecione uma empresa.", 404);
    if (p.empresa && tela.empresa?.id !== p.empresa) throw new ErroFiscal("A empresa em foco mudou. Atualize a tela antes de exportar.", 409);
    const obrigacao = obrigacaoSchema.parse(p.obrigacao ?? "icms_ipi");
    if (aba === "apuracao" && !await podeNoModulo(tela.ctx, obrigacao === "icms_ipi" ? "fiscal_icms_ipi" : "fiscal_contribuicoes", "ver")) throw new ErroFiscal("Relatório indisponível.", 404);
    const base = await carregarBase(tela);
    if (p.cfop) { base.icms.linhas = base.icms.linhas.filter(l => l.cfop === p.cfop); base.contribuicoes.linhas = base.contribuicoes.linhas.filter(l => l.cfop === p.cfop); }
    const relatorios = relatorioLocal(base, aba, obrigacao);
    if (p.formato === "csv") { const nome = ({ apoio: "Documentos de apoio", pagamentos: "Documentos de apoio", decisoes: "Decisões", faturamento: "Faturamento", conferencias: "Duplicidades", ajustes: "Ajustes" } as Record<string, string>)[p.vista] ?? "Livro fiscal"; const r = relatorios.find(r => r.nome === nome) ?? relatorios[0]; return new NextResponse(csvSeguro(r.colunas, r.linhas), { headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="sped-${aba}-${tela.competencia}.csv"`, "Cache-Control": "no-store" } }); }
    const livro = new ExcelJS.Workbook();
    for (const r of relatorios) {
      const folha = livro.addWorksheet(r.nome); folha.addRow(r.colunas); folha.getRow(1).font = { bold: true };
      const monetarias = new Set(["Valor", "ICMS", "IPI", "PIS", "COFINS", "Base", "Base IPI", "Base COFINS", "Débitos", "Créditos", "Saldo anterior", "A recolher", "A transportar", "Imposto", "Bruto", "Líquido", "Isentas", "Outras"]);
      for (const linha of r.linhas) folha.addRow(linha.map((v, i) => v !== null && monetarias.has(r.colunas[i]) && /^-?\d{1,12}(\.\d{1,2})?$/.test(v) ? Number(v) : v ?? "Não levantado"));
      folha.columns.forEach((c, i) => { c.width = 24; c.numFmt = monetarias.has(r.colunas[i]) ? "#,##0.00" : "@"; });
      folha.views = [{ state: "frozen", ySplit: 1 }]; folha.autoFilter = { from: { row: 1, column: 1 }, to: { row: Math.max(folha.rowCount, 1), column: r.colunas.length } };
    }
    const filtros = livro.addWorksheet("Recorte"); filtros.addRows([["Empresa", tela.empresa!.nome], ["CNPJ", tela.empresa!.cnpj], ["Competência", tela.competencia], ["Abrangência", tela.contexto.consolidado ? "Raiz" : "Estabelecimento"], ["Obrigação", obrigacao]]); filtros.columns.forEach(c => { c.width = 30; });
    return new NextResponse(new Uint8Array(await livro.xlsx.writeBuffer()), { headers: { "Content-Type": TIPO_DO_XLSX, "Content-Disposition": `attachment; filename="sped-${aba}-${tela.competencia}.xlsx"`, "Cache-Control": "no-store" } });
  } catch(e) { return NextResponse.json({ error: e instanceof Error ? e.message : "Falha ao exportar." }, { status: e instanceof ErroFiscal ? e.status : 422 }); }
}
