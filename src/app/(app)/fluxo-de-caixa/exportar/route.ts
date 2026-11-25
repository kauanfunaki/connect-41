// O Excel do fluxo previsto, na equipe (25/11/2026, funcionalidade-837).
// A mesma régua da tela do Fluxo de caixa, mais a empresa e o foco.

import { NextResponse, type NextRequest } from "next/server";
import { getAuthContext, canViewSector } from "@/lib/auth/context";
import { isModuleEnabled, setoresDoModulo } from "@/lib/modules";
import { getModuleDef } from "@/lib/module-catalog";
import { getPrisma } from "@/lib/prisma";
import { leituraNoFoco } from "@/lib/empresas/focoServidor";
import { contentDispositionDeAnexo } from "@/lib/drive/zip";
import { baseDoPrevisto, entradaDaPlanilha, premissasDaEmpresa } from "@/lib/fluxoDeCaixa/previstoServidor";
import { gerarPlanilhaDoPrevisto, nomeDoArquivoDoPrevisto } from "@/lib/fluxoDeCaixa/planilhaDoPrevisto";
import { TIPO_DO_XLSX } from "@/lib/planilha/tabelaDoExcel";

export const dynamic = "force-dynamic";

const MODULE = "bpo_fluxo_caixa";

export async function GET(req: NextRequest) {
  const ctx = await getAuthContext();
  const naoEncontrado = NextResponse.json({ error: "Não encontrado" }, { status: 404 });
  if (!ctx.tenantId) return naoEncontrado;
  if (!(await isModuleEnabled(ctx.tenantId, MODULE))) return naoEncontrado;
  if (!canViewSector(ctx, (await setoresDoModulo(ctx.tenantId, MODULE)) ?? getModuleDef(MODULE)!.sectorCode)) return naoEncontrado;

  const empresaId = req.nextUrl.searchParams.get("empresa");
  const empresa = empresaId
    ? await getPrisma().company.findFirst({ where: { id: empresaId, tenantId: ctx.tenantId }, select: { id: true, name: true, tradeName: true } })
    : null;
  if (!empresa) return NextResponse.json({ error: "Empresa não encontrada" }, { status: 404 });
  const noFoco = await leituraNoFoco(ctx, empresa.id);
  if (!noFoco.ok) return NextResponse.json({ error: noFoco.erro }, { status: 403 });

  const nome = empresa.tradeName || empresa.name;
  const base = await baseDoPrevisto(ctx.tenantId, empresa.id);
  const premissas = await premissasDaEmpresa(ctx.tenantId, empresa.id);
  const arquivo = await gerarPlanilhaDoPrevisto({ ...entradaDaPlanilha(base, nome), premissas });
  return new NextResponse(new Uint8Array(arquivo), {
    headers: {
      "Content-Type": TIPO_DO_XLSX,
      "Content-Disposition": contentDispositionDeAnexo(nomeDoArquivoDoPrevisto(nome, base.hojeKey)),
      "Cache-Control": "no-store",
    },
  });
}
