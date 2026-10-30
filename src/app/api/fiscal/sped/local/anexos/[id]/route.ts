import { NextResponse } from "next/server";
import { readFile } from "node:fs/promises";
import { getAuthContext } from "@/lib/auth/context";
import { podeNoModulo } from "@/lib/auth/modulo";
import { getPrisma } from "@/lib/prisma";
import { autorizar, ErroFiscal } from "@/lib/fiscal/sped/local/servidor";
import { caminhoPrivado } from "@/lib/fiscal/sped/local/fila";
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const ctx = await getAuthContext(), { id } = await params, empresaId = new URL(req.url).searchParams.get("empresa") ?? "";
    await autorizar(ctx, empresaId, await podeNoModulo(ctx, "fiscal_classificacao", "ver") ? "classificacao" : "fechamento");
    const a = await getPrisma().spedFiscalImport.findFirst({ where: { id, tenantId: ctx.tenantId, companyId: empresaId, state: "anexo" } });
    if (!a) throw new ErroFiscal("Anexo não encontrado.", 404);
    const bytes = await readFile(caminhoPrivado(a.path));
    return new NextResponse(bytes, { headers: { "Content-Type": "application/pdf", "Content-Disposition": `inline; filename*=UTF-8''${encodeURIComponent(a.name)}`, "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" } });
  } catch { return NextResponse.json({ error: "Anexo não encontrado." }, { status: 404 }); }
}
