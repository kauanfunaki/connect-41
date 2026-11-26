import { NextResponse } from "next/server";
import { getAuthContext } from "@/lib/auth/context";
import { podeNoModulo } from "@/lib/auth/modulo";
import { recusaDoFoco } from "@/lib/empresas/focoServidor";
import { movimentacaoDaEmpresa } from "@/lib/dp2/documentosServidor";

export const dynamic = "force-dynamic";

// A movimentação de empregados da empresa no período, em PDF (26/11/2026, funcionalidade-776).
export async function GET(req: Request) {
  const url = new URL(req.url);
  const companyId = url.searchParams.get("empresa") ?? "";
  const ctx = await getAuthContext();
  if (!ctx.userId || !ctx.tenantId) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  if (!(await podeNoModulo(ctx, "dp2_colaboradores", "ver"))) return NextResponse.json({ error: "Sem permissão." }, { status: 403 });
  const foraDoFoco = await recusaDoFoco(ctx, [companyId]);
  if (foraDoFoco) return NextResponse.json({ error: foraDoFoco }, { status: 403 });
  const doc = await movimentacaoDaEmpresa(ctx.tenantId, companyId, url.searchParams.get("de") ?? "", url.searchParams.get("ate") ?? "");
  if (!doc.ok) return NextResponse.json({ error: doc.erro }, { status: doc.status });
  return new NextResponse(new Uint8Array(doc.pdf), {
    headers: { "Content-Type": "application/pdf", "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(doc.nome)}`, "Cache-Control": "no-store" },
  });
}
