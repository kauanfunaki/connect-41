import { NextResponse } from "next/server";
import { getAuthContext, canActOnSector } from "@/lib/auth/context";
import { isModuleEnabled, setoresDoModulo } from "@/lib/modules";
import { gerarModeloDeLicencas } from "@/lib/societario/importacaoDeLicencas";
import { TIPO_DO_XLSX } from "@/lib/planilha/tabelaDoExcel";

export const dynamic = "force-dynamic";

/** O modelo de planilha para importar licenças (lote B de 03/11/2026). Mesmo acesso da importação. */
export async function GET() {
  const ctx = await getAuthContext();
  if (!ctx.tenantId) return NextResponse.json({ error: "Sem acesso" }, { status: 404 });
  const setores = (await setoresDoModulo(ctx.tenantId, "societario_licencas")) ?? "societario";
  if (!canActOnSector(ctx, setores) || !(await isModuleEnabled(ctx.tenantId, "societario_licencas"))) {
    return NextResponse.json({ error: "Sem acesso" }, { status: 404 });
  }
  const arquivo = await gerarModeloDeLicencas();
  return new NextResponse(new Uint8Array(arquivo), {
    headers: { "Content-Type": TIPO_DO_XLSX, "Content-Disposition": 'attachment; filename="modelo-de-licencas-connect.xlsx"' },
  });
}
