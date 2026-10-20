import { NextResponse, type NextRequest } from "next/server";
import { getAuthContext, canActOnSector } from "@/lib/auth/context";
import { getModuleDef } from "@/lib/module-catalog";
import { isModuleEnabled, setorDoModulo } from "@/lib/modules";
import { saoPauloParts } from "@/lib/agenda";
import { TODAS_AS_EMPRESAS } from "@/lib/empresas/escolhaDaEmpresa";
import { listarContas, type TipoDeConta } from "./data";
import { csvDasContas, LIMITE_DA_EXPORTACAO, recorteDaUrl } from "./exportacao";

/**
 * O CSV de Contas a pagar ou a receber, com os filtros da tela (lote D, 20/10):
 * a empresa, a competência e o recorte vêm no endereço, do botão "Exportar
 * CSV". Os funis das colunas filtram no navegador e não entram — a exportação
 * é do recorte, e a tela diz isso.
 *
 * O acesso é o da tela: o setor que opera o módulo, com o módulo ligado. A
 * empresa vem explícita ("todas" ou o id); sem ela, nada — a tela só oferece o
 * botão depois de escolher.
 */
export async function exportarContas(req: NextRequest, kind: TipoDeConta, modulo: string): Promise<NextResponse> {
  const ctx = await getAuthContext();
  const naoAchou = NextResponse.json({ error: "Não encontrado" }, { status: 404 });
  if (!ctx.tenantId || !getModuleDef(modulo)) return naoAchou;
  const setor = await setorDoModulo(ctx.tenantId, modulo);
  if (!setor || !canActOnSector(ctx, setor)) return naoAchou;
  if (!(await isModuleEnabled(ctx.tenantId, modulo))) return naoAchou;

  const sp = req.nextUrl.searchParams;
  const empresa = sp.get("empresa");
  if (!empresa) return NextResponse.json({ error: "Escolha a empresa (ou todas) antes de exportar." }, { status: 400 });
  const competencia = /^\d{4}-\d{2}$/.test(sp.get("competencia") ?? "") ? sp.get("competencia")! : undefined;
  const recorte = recorteDaUrl(kind, sp.get("recorte"));

  const agora = new Date();
  const resultado = await listarContas(
    ctx.tenantId,
    kind,
    { recorte, competencia, empresaId: empresa === TODAS_AS_EMPRESAS ? undefined : empresa },
    agora,
    LIMITE_DA_EXPORTACAO
  );
  const csv = csvDasContas(resultado.linhas, kind, { diaDe: (d) => saoPauloParts(d).dateKey, limitada: resultado.limitada });
  const nome = [kind === "PAGAR" ? "contas-a-pagar" : "contas-a-receber", competencia ?? recorte, saoPauloParts(agora).dateKey].join("-");
  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${nome}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
