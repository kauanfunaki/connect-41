import { NextResponse, type NextRequest } from "next/server";
import { getAuthContext, canActOnSector } from "@/lib/auth/context";
import { getModuleDef } from "@/lib/module-catalog";
import { isModuleEnabled, setorDoModulo } from "@/lib/modules";
import { logAudit } from "@/lib/audit";
import { competenciaValida } from "@/lib/financeiro/periodo";
import { leituraNoFoco } from "@/lib/empresas/focoServidor";
import { exportacaoDoMes } from "@/lib/financeiro/dominio/servidor";
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
  if (r.linhas.length === 0) return NextResponse.json({ error: "Nenhuma baixa pronta para a Domínio neste mês." }, { status: 400 });

  const txt = sp.get("formato") === "txt";
  const nome = `lancamentos_baixas_${(r.empresa.cnpj ?? "").replace(/\D/g, "") || empresaId}_${mes}.${txt ? "txt" : "xlsx"}`;
  const corpo = txt ? txtDaDominio(r.linhas) : await xlsxDaDominio(r.linhas);

  await logAudit({
    tenantId: ctx.tenantId,
    userId: ctx.userId,
    action: "financeiro.dominio.exported",
    entityType: "Company",
    entityId: empresaId,
    metadata: { mes, formato: txt ? "txt" : "xlsx", linhas: r.linhas.length, pendencias: r.pendencias.length },
  });
  return new NextResponse(new Uint8Array(corpo), {
    headers: {
      "Content-Type": txt ? "text/plain; charset=ISO-8859-1" : TIPO_DO_XLSX,
      "Content-Disposition": `attachment; filename="${nome}"`,
      "Cache-Control": "no-store",
    },
  });
}
