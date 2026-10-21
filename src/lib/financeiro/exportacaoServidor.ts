import { NextResponse, type NextRequest } from "next/server";
import { getAuthContext, canActOnSector } from "@/lib/auth/context";
import { getModuleDef } from "@/lib/module-catalog";
import { isModuleEnabled, setoresDoModulo } from "@/lib/modules";
import { saoPauloParts } from "@/lib/agenda";
import { getPrisma } from "@/lib/prisma";
import { nomeExibicao } from "@/lib/companyName";
import { formatarNumero } from "@/lib/format";
import { leituraNoFoco } from "@/lib/empresas/focoServidor";
import { TIPO_DO_XLSX } from "@/lib/planilha/tabelaDoExcel";
import { centavosDeDecimal } from "./contas";
import { listarContas, type LinhaDaConta, type TipoDeConta } from "./data";
import { csvDasContas, LIMITE_DA_EXPORTACAO, RECORTES_A_PAGAR, RECORTES_A_RECEBER, recorteDaUrl } from "./exportacao";
import { xlsxDasContas, type ParteNaPlanilha } from "./exportacaoXlsx";

/**
 * A lista de Contas a pagar ou a receber em CSV ou em Excel, com os filtros da
 * tela (lote D, 20/10): a empresa, a competência e o recorte vêm no endereço,
 * do botão "Exportar". Os funis das colunas filtram no navegador e não entram —
 * a exportação é do recorte, e a tela diz isso.
 *
 * `formato=xlsx` (20/10): a planilha numa Tabela do Excel, pronta para a
 * tabela dinâmica — com o rateio aberto em linhas (`exportacaoXlsx.ts`).
 *
 * O acesso é o da tela: o setor que opera o módulo, com o módulo ligado. A
 * empresa vem explícita ("todas" ou o id); sem ela, nada — a tela só oferece o
 * botão depois de escolher.
 */
export async function exportarContas(req: NextRequest, kind: TipoDeConta, modulo: string): Promise<NextResponse> {
  const ctx = await getAuthContext();
  const naoAchou = NextResponse.json({ error: "Não encontrado" }, { status: 404 });
  if (!ctx.tenantId || !getModuleDef(modulo)) return naoAchou;
  const setores = await setoresDoModulo(ctx.tenantId, modulo);
  if (!setores || !canActOnSector(ctx, setores)) return naoAchou;
  if (!(await isModuleEnabled(ctx.tenantId, modulo))) return naoAchou;

  const sp = req.nextUrl.searchParams;
  const empresa = sp.get("empresa");
  if (!empresa) return NextResponse.json({ error: "Escolha a empresa (ou todas) antes de exportar." }, { status: 400 });
  const competencia = /^\d{4}-\d{2}$/.test(sp.get("competencia") ?? "") ? sp.get("competencia")! : undefined;
  const recorte = recorteDaUrl(kind, sp.get("recorte"));

  // Com uma empresa em foco (21/10/2026): "todas" é a base, e outra empresa não sai.
  const noFoco = await leituraNoFoco(ctx, empresa);
  if (!noFoco.ok) return NextResponse.json({ error: noFoco.erro }, { status: 403 });
  const { empresaId, empresaIds } = noFoco;

  const agora = new Date();
  const resultado = await listarContas(ctx.tenantId, kind, { recorte, competencia, empresaId, empresaIds }, agora, LIMITE_DA_EXPORTACAO);
  const diaDe = (d: Date) => saoPauloParts(d).dateKey;
  const nome = [kind === "PAGAR" ? "contas-a-pagar" : "contas-a-receber", competencia ?? recorte, saoPauloParts(agora).dateKey].join("-");
  const cabecalhos = (tipo: string, extensao: string) => ({
    "Content-Type": tipo,
    "Content-Disposition": `attachment; filename="${nome}.${extensao}"`,
    "Cache-Control": "no-store",
  });

  if (sp.get("formato") !== "xlsx") {
    const csv = csvDasContas(resultado.linhas, kind, { diaDe, limitada: resultado.limitada });
    return new NextResponse(csv, { headers: cabecalhos("text/csv; charset=utf-8", "csv") });
  }

  const [rateios, empresaNome] = await Promise.all([
    partesDosRateios(ctx.tenantId, resultado.linhas),
    empresaId
      ? getPrisma()
          .company.findFirst({ where: { id: empresaId, tenantId: ctx.tenantId }, select: { name: true, displayName: true } })
          .then((c) => (c ? nomeExibicao(c) : empresaId))
      : Promise.resolve(empresaIds ? "Todas da base (matriz e filiais)" : "Todas as empresas"),
  ]);
  const recortes: readonly { chave: string; rotulo: string }[] = kind === "PAGAR" ? RECORTES_A_PAGAR : RECORTES_A_RECEBER;
  const quando = saoPauloParts(agora);
  const filtros: [string, string][] = [
    ["Lista", kind === "PAGAR" ? "Contas a pagar" : "Contas a receber"],
    ["Empresa", empresaNome],
    ["Competência", competencia ? `${competencia.slice(5, 7)}/${competencia.slice(0, 4)}` : "Todas"],
    ["Situação", recortes.find((r) => r.chave === recorte)?.rotulo ?? "Todas"],
    [
      "Contas",
      resultado.limitada
        ? `${formatarNumero(resultado.linhas.length, 0)} — a exportação para em ${formatarNumero(LIMITE_DA_EXPORTACAO, 0)}; filtre por empresa ou competência para ver o resto.`
        : formatarNumero(resultado.linhas.length, 0),
    ],
    ["Rateio", "A conta rateada sai numa linha por parte do rateio, com a categoria, o centro, o projeto e o valor da parte."],
    ["Gerado em", `${quando.dateKey.split("-").reverse().join("/")} ${String(quando.hour).padStart(2, "0")}:${String(quando.minute).padStart(2, "0")}`],
  ];
  const arquivo = await xlsxDasContas(resultado.linhas, kind, { diaDe, rateios, filtros });
  return new NextResponse(new Uint8Array(arquivo), { headers: cabecalhos(TIPO_DO_XLSX, "xlsx") });
}

/** As partes do rateio das contas rateadas da lista, com os nomes, numa consulta só. */
async function partesDosRateios(tenantId: string, linhas: readonly LinhaDaConta[]): Promise<Map<string, ParteNaPlanilha[]>> {
  const ids = linhas.filter((l) => l.rateio).map((l) => l.id);
  const saida = new Map<string, ParteNaPlanilha[]>();
  if (ids.length === 0) return saida;
  const partes = await getPrisma().financeEntryAllocation.findMany({
    where: { tenantId, entryId: { in: ids } },
    select: {
      entryId: true,
      amount: true,
      category: { select: { name: true } },
      costCenter: { select: { name: true } },
      project: { select: { name: true } },
    },
    orderBy: [{ entryId: "asc" }, { position: "asc" }],
  });
  for (const p of partes) {
    const lista = saida.get(p.entryId) ?? [];
    lista.push({
      categoriaNome: p.category?.name ?? null,
      centroNome: p.costCenter?.name ?? null,
      projetoNome: p.project?.name ?? null,
      centavos: centavosDeDecimal(p.amount),
    });
    saida.set(p.entryId, lista);
  }
  return saida;
}
