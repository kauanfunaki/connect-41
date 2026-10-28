import { NextResponse, type NextRequest } from "next/server";
import { getAuthContext, canActOnSector } from "@/lib/auth/context";
import { getModuleDef } from "@/lib/module-catalog";
import { isModuleEnabled, setorDoModulo } from "@/lib/modules";
import { logAudit } from "@/lib/audit";
import { competenciaValida } from "@/lib/financeiro/periodo";
import { leituraNoFoco } from "@/lib/empresas/focoServidor";
import { correcaoDoMes, exportacaoDoMes, registrarExportacao } from "@/lib/financeiro/dominio/servidor";
import { txtDaDominio, xlsxDaDominio } from "@/lib/financeiro/dominio/planilha";
import { TIPO_DO_XLSX } from "@/lib/planilha/tabelaDoExcel";

export const dynamic = "force-dynamic";

const MODULE = "bpo_lancamentos";

/**
 * A planilha de importação da Domínio com as baixas de uma empresa num mês
 * (fila do BPO, 21/10): `?empresa=<id>&mes=AAAA-MM&formato=xlsx|txt`. O nome
 * do arquivo segue o do SPED Generator (`lancamentos_<cnpj>_<mês>`), com
 * "baixas" para não confundir com o das notas. A baixa sem conta no de-para
 * fica fora — a tela mostra quais e por quê antes do botão.
 *
 * `&tipo=correcao` (lote 3, 28/10/2026): só o que mudou desde a última
 * planilha baixada — baixas novas, e o estorno das que saíram ou mudaram (ver
 * `correcao.ts`). Toda planilha baixada fica registrada, e é contra a última
 * que a próxima correção compara.
 */
export async function GET(req: NextRequest) {
  const ctx = await getAuthContext();
  const naoAchou = NextResponse.json({ error: "Não encontrado" }, { status: 404 });
  if (!ctx.tenantId) return naoAchou;
  const setor = (await setorDoModulo(ctx.tenantId, MODULE)) ?? getModuleDef(MODULE)!.sectorCode;
  if (!canActOnSector(ctx, setor) || !(await isModuleEnabled(ctx.tenantId, MODULE))) return naoAchou;

  const sp = req.nextUrl.searchParams;
  const mes = competenciaValida(sp.get("mes"));
  const empresaId = sp.get("empresa");
  if (!mes || !empresaId) return NextResponse.json({ error: "Escolha a empresa e o mês." }, { status: 400 });
  // Com uma empresa em foco: outra empresa não sai (o arquivo vem pelo endereço, sem a tela).
  const noFoco = await leituraNoFoco(ctx, empresaId);
  if (!noFoco.ok) return NextResponse.json({ error: noFoco.erro }, { status: 403 });
  const r = await exportacaoDoMes(ctx.tenantId, empresaId, mes);
  if (!r) return naoAchou;

  const ehCorrecao = sp.get("tipo") === "correcao";
  let linhas = r.linhas;
  let resumo: { novas: number; alteradas: number; removidas: number } | null = null;
  if (ehCorrecao) {
    const c = await correcaoDoMes(ctx.tenantId, empresaId, mes, r);
    if (!c) return NextResponse.json({ error: "Nenhuma planilha deste mês foi baixada ainda: baixe a do mês inteiro primeiro." }, { status: 400 });
    if (c.linhas.length === 0) return NextResponse.json({ error: "Nada mudou desde a última planilha baixada." }, { status: 400 });
    linhas = c.linhas;
    resumo = { novas: c.novas, alteradas: c.alteradas, removidas: c.removidas };
  } else if (r.linhas.length === 0) {
    return NextResponse.json({ error: "Nenhuma baixa pronta para a Domínio neste mês." }, { status: 400 });
  }

  const txt = sp.get("formato") === "txt";
  const nome = `lancamentos_baixas_${ehCorrecao ? "correcao_" : ""}${(r.empresa.cnpj ?? "").replace(/\D/g, "") || empresaId}_${mes}.${txt ? "txt" : "xlsx"}`;
  const corpo = txt ? txtDaDominio(linhas) : await xlsxDaDominio(linhas);

  await registrarExportacao({
    tenantId: ctx.tenantId,
    companyId: empresaId,
    competencia: mes,
    tipo: ehCorrecao ? "CORRECAO" : "COMPLETA",
    formato: txt ? "txt" : "xlsx",
    linhasDoArquivo: linhas.length,
    atual: r,
    userId: ctx.userId ?? null,
  });

  await logAudit({
    tenantId: ctx.tenantId,
    userId: ctx.userId,
    action: "financeiro.dominio.exported",
    entityType: "Company",
    entityId: empresaId,
    metadata: { mes, formato: txt ? "txt" : "xlsx", tipo: ehCorrecao ? "correcao" : "completa", linhas: linhas.length, pendencias: r.pendencias.length, ...(resumo ?? {}) },
  });
  return new NextResponse(new Uint8Array(corpo), {
    headers: {
      "Content-Type": txt ? "text/plain; charset=ISO-8859-1" : TIPO_DO_XLSX,
      "Content-Disposition": `attachment; filename="${nome}"`,
      "Cache-Control": "no-store",
    },
  });
}
