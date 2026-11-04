import { NextResponse, type NextRequest } from "next/server";
import { getAuthContext, canViewSector } from "@/lib/auth/context";
import { isModuleEnabled, setoresDoModulo } from "@/lib/modules";
import { getModuleDef } from "@/lib/module-catalog";
import { saoPauloParts } from "@/lib/agenda";
import { lerPeriodo } from "@/lib/societario/relatorios";
import { dadosDosRelatorios } from "@/lib/societario/relatoriosServidor";
import {
  csvDaTabela,
  lerRelatorio,
  tabelaDaProdutividade,
  tabelaDasVoltas,
  tabelaDoCusto,
  tabelaDoSla,
  type ChaveDoRelatorio,
  type TabelaDoRelatorio,
} from "@/lib/societario/relatoriosNaTela";
import { gerarPlanilhaDeTabelas, TIPO_DO_XLSX } from "@/lib/planilha/tabelaDoExcel";

export const dynamic = "force-dynamic";

const MODULE = "societario_relatorios";

/**
 * O relatório que está na tela, em Excel (Tabela do Excel) ou CSV
 * (Relatórios B, 04/11/2026): `?relatorio=&periodo=&formato=`. Mesmo acesso
 * da página — quem vê o setor.
 */
export async function GET(req: NextRequest) {
  const ctx = await getAuthContext();
  const setor = ctx.tenantId ? ((await setoresDoModulo(ctx.tenantId, MODULE)) ?? getModuleDef(MODULE)!.sectorCode) : null;
  if (!ctx.tenantId || !setor || !canViewSector(ctx, setor) || !(await isModuleEnabled(ctx.tenantId, MODULE))) {
    return NextResponse.json({ error: "Sem acesso" }, { status: 404 });
  }

  const sp = req.nextUrl.searchParams;
  const relatorio = lerRelatorio(sp.get("relatorio"));
  const periodo = lerPeriodo(sp.get("periodo") ?? undefined);
  const formato = sp.get("formato") === "csv" ? "csv" : "xlsx";
  const d = await dadosDosRelatorios(ctx.tenantId, periodo);

  const tabelas: Record<ChaveDoRelatorio, () => TabelaDoRelatorio> = {
    sla: () => tabelaDoSla(d.sla),
    voltas: () => tabelaDasVoltas(d.maisVoltas),
    produtividade: () => tabelaDaProdutividade(d.produtividade),
    custo: () => tabelaDoCusto(d.custos),
  };
  const tabela = tabelas[relatorio.chave]();
  const nome = `societario-${relatorio.chave}-${periodo.chave}-${saoPauloParts(new Date()).dateKey}`;

  if (formato === "csv") {
    return new NextResponse(csvDaTabela(tabela), {
      headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="${nome}.csv"` },
    });
  }
  const arquivo = await gerarPlanilhaDeTabelas({
    abas: [{ aba: relatorio.rotulo, tabela: `Societario_${relatorio.chave}`, colunas: tabela.colunas, linhas: tabela.linhas, semLinhas: "Nenhum processo no período." }],
    filtros: [
      ["Relatório", relatorio.rotulo],
      ["Período", `Abertos agora e concluídos nos últimos ${periodo.rotulo}`],
      ["Prazo", "Dias úteis, descontados os feriados do escritório"],
    ],
  });
  return new NextResponse(new Uint8Array(arquivo), {
    headers: { "Content-Type": TIPO_DO_XLSX, "Content-Disposition": `attachment; filename="${nome}.xlsx"` },
  });
}
