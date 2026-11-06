import { NextResponse } from "next/server";
import { getAuthContext } from "@/lib/auth/context";
import { podeNoModulo } from "@/lib/auth/modulo";
import { scopedCompanyWhere } from "@/lib/auth/scope";
import { getPrisma } from "@/lib/prisma";
import { abrirGerado } from "@/lib/fiscal/sped/local/gerados";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const NAO_ENCONTRADO = () => NextResponse.json({ error: "Arquivo não encontrado." }, { status: 404 });

/**
 * O TXT que o agente do motor gerou e devolveu ao Connect (06/11/2026).
 *
 * Os bytes saem do disco em stream, sem decodificar: o arquivo é ISO-8859-1 e
 * o PVA confere byte a byte — o mesmo cuidado do download que vinha do motor
 * (`src/app/api/fiscal/sped/arquivos/[id]/download/route.ts`). Quem vê o
 * Gerar SPED ou as Entregas baixa, e só de empresa do próprio alcance; fora
 * disso, 404.
 */
export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const auth = await getAuthContext();
  if (!auth.tenantId || !((await podeNoModulo(auth, "fiscal_operacao", "ver")) || (await podeNoModulo(auth, "fiscal_entregas", "ver")))) return NAO_ENCONTRADO();
  const { id } = await ctx.params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return NAO_ENCONTRADO();
  const prisma = getPrisma();
  const geracao = await prisma.spedFiscalGeneration.findFirst({ where: { id, tenantId: auth.tenantId }, select: { companyId: true, fileName: true, filePath: true, fileSha256: true, fileBytes: true } });
  if (!geracao?.filePath || !geracao.fileName || !geracao.fileSha256) return NAO_ENCONTRADO();
  const noAlcance = await prisma.company.findFirst({ where: { ...(await scopedCompanyWhere(auth)), id: geracao.companyId }, select: { id: true } });
  if (!noAlcance) return NAO_ENCONTRADO();
  const arquivo = await abrirGerado(geracao.filePath).catch(() => null);
  // O registro diz que o arquivo existe, e o disco não tem: volume sem persistência ou arquivo apagado à mão.
  if (!arquivo || (geracao.fileBytes !== null && arquivo.tamanho !== geracao.fileBytes)) {
    return NextResponse.json({ error: "O arquivo gerado não está mais no servidor. Peça a geração de novo." }, { status: 410 });
  }
  return new Response(arquivo.corpo, {
    headers: {
      "Content-Type": "text/plain; charset=ISO-8859-1",
      "Content-Disposition": `attachment; filename="${geracao.fileName}"`,
      "Content-Length": String(arquivo.tamanho),
      "X-Conteudo-SHA256": geracao.fileSha256,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
