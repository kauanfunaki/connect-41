import { NextResponse } from "next/server";
import { getPrisma } from "@/lib/prisma";
import { getAuthContext } from "@/lib/auth/context";
import { competenciaParaBaixar } from "@/lib/dp2/saidas";

export const dynamic = "force-dynamic";

// O arquivo de uma remessa CNAB 240 do DP 2 (12/11/2026), exatamente como foi
// gerado — é o que a empresa sobe no banco.
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await getAuthContext();
  if (!ctx.userId || !ctx.tenantId) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  const { id } = await params;
  const remessa = await getPrisma().dp2Remessa.findFirst({ where: { id, tenantId: ctx.tenantId } });
  if (!remessa) return NextResponse.json({ error: "Remessa não encontrada." }, { status: 404 });
  const acesso = await competenciaParaBaixar(remessa.competenciaId);
  if ("erro" in acesso) return NextResponse.json({ error: acesso.erro }, { status: acesso.status });
  return new NextResponse(remessa.conteudo, {
    headers: {
      "Content-Type": "text/plain; charset=us-ascii",
      "Content-Disposition": `attachment; filename="${remessa.nomeArquivo}"`,
      "Cache-Control": "no-store",
    },
  });
}
