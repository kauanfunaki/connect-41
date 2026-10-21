import { NextResponse, type NextRequest } from "next/server";
import { getAuthContext, canViewSector } from "@/lib/auth/context";
import { isModuleEnabled, setoresDoModulo } from "@/lib/modules";
import { getPrisma } from "@/lib/prisma";
import { saoPauloParts } from "@/lib/agenda";
import { nomeExibicao } from "@/lib/companyName";
import { formatarCompetencia, formatarNumero } from "@/lib/format";
import { TODAS_AS_EMPRESAS } from "@/lib/empresas/escolhaDaEmpresa";
import { gerarPlanilhaDeTabelas, TIPO_DO_XLSX } from "@/lib/planilha/tabelaDoExcel";
import { DIMENSOES, MEDIDAS, MODULO_DA_TABELA_DINAMICA, ROTULO_DA_BASE, lerConfiguracao, montarTabela } from "@/lib/relatorios/tabelaDinamica";
import { fatosDaBase, LIMITE_DE_FATOS } from "@/lib/relatorios/tabelaDinamicaServidor";
import { planilhaDaTabelaDinamica } from "@/lib/relatorios/exportacaoDaTabela";

export const dynamic = "force-dynamic";

const SITUACAO = { todas: "Todas (sem as canceladas)", abertas: "Em aberto", vencidas: "Vencidas", quitadas: "Pagas ou recebidas" } as const;

/**
 * A tabela dinâmica em Excel (20/10/2026): a mesma configuração da tela, no
 * endereço. O acesso é o da tela; a empresa vem explícita ("todas" ou o id).
 */
export async function GET(req: NextRequest) {
  const ctx = await getAuthContext();
  const naoAchou = NextResponse.json({ error: "Não encontrado" }, { status: 404 });
  if (!ctx.tenantId) return naoAchou;
  const setores = await setoresDoModulo(ctx.tenantId, MODULO_DA_TABELA_DINAMICA);
  if (!setores || !canViewSector(ctx, setores)) return naoAchou;
  if (!(await isModuleEnabled(ctx.tenantId, MODULO_DA_TABELA_DINAMICA))) return naoAchou;

  const params = Object.fromEntries(req.nextUrl.searchParams);
  const empresa = params.empresa;
  if (!empresa) return NextResponse.json({ error: "Escolha a empresa (ou todas) antes de exportar." }, { status: 400 });
  const agora = new Date();
  const quando = saoPauloParts(agora);
  const c = lerConfiguracao(params, quando.dateKey);
  const empresaId = empresa === TODAS_AS_EMPRESAS ? null : empresa;

  const [{ fatos, limitada }, empresaNome] = await Promise.all([
    fatosDaBase(ctx.tenantId, empresaId, c, agora),
    empresaId
      ? getPrisma()
          .company.findFirst({ where: { id: empresaId, tenantId: ctx.tenantId }, select: { name: true, displayName: true } })
          .then((e) => (e ? nomeExibicao(e) : null))
      : Promise.resolve("Todas as empresas"),
  ]);
  if (empresaNome === null) return naoAchou;

  const tabela = montarTabela(fatos, c);
  const periodo =
    !c.filtros.de && !c.filtros.ate
      ? "Todo o histórico"
      : `${c.filtros.de ? formatarCompetencia(c.filtros.de) : "o começo"} a ${c.filtros.ate ? formatarCompetencia(c.filtros.ate) : "hoje"}, pela ${
          c.base === "baixas" ? "data do pagamento" : c.filtros.periodoPor === "vencimento" ? "data de vencimento" : "competência"
        }`;
  const tipo = { ambos: c.base === "baixas" ? "Entradas e saídas" : "A pagar e a receber", PAGAR: c.base === "baixas" ? "Saídas" : "A pagar", RECEBER: c.base === "baixas" ? "Entradas" : "A receber" }[c.filtros.tipo];
  const filtros: [string, string][] = [
    ["Base", ROTULO_DA_BASE[c.base]],
    ["Empresa", empresaNome],
    ["Linhas", c.linhas.map((d) => DIMENSOES[d].rotulo).join(" › ")],
    ["Colunas", c.coluna ? DIMENSOES[c.coluna].rotulo : "Nenhuma (só o total)"],
    ["Valor", MEDIDAS[c.medida].rotulo],
    ["Tipo", tipo],
    ["Período", periodo],
    ...(c.base === "contas" ? [["Situação", SITUACAO[c.filtros.situacao]] as [string, string]] : []),
    [
      "Linhas lidas",
      limitada
        ? `${formatarNumero(fatos.length, 0)} — a consulta para em ${formatarNumero(LIMITE_DE_FATOS, 0)}; filtre por empresa, período ou tipo para ver tudo.`
        : formatarNumero(fatos.length, 0),
    ],
    ...(c.base === "contas" ? [["Rateio", "A conta rateada entra pela parte de cada categoria, centro e projeto; na quantidade, conta uma vez."] as [string, string]] : []),
    ["Gerado em", `${quando.dateKey.split("-").reverse().join("/")} ${String(quando.hour).padStart(2, "0")}:${String(quando.minute).padStart(2, "0")}`],
  ];

  const arquivo = await gerarPlanilhaDeTabelas(planilhaDaTabelaDinamica(tabela, fatos, c, filtros));
  const nome = ["tabela-dinamica", c.base, quando.dateKey].join("-");
  return new NextResponse(new Uint8Array(arquivo), {
    headers: {
      "Content-Type": TIPO_DO_XLSX,
      "Content-Disposition": `attachment; filename="${nome}.xlsx"`,
      "Cache-Control": "no-store",
    },
  });
}
