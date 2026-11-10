import { NextResponse, type NextRequest } from "next/server";
import { getAuthContext } from "@/lib/auth/context";
import { getPrisma } from "@/lib/prisma";
import { isModuleEnabled } from "@/lib/modules";
import { MODULO_ACADEMIA, ehMes, ehTeste, mesFechado } from "@/lib/academia/regras";
import { temCertificado } from "@/lib/academia/ranking";
import { apareceNoRanking, rankingDoMes } from "@/lib/academia/servidor";
import { linhasDoCertificado, pdfDoCertificado } from "@/lib/academia/certificado";

export const runtime = "nodejs";

/**
 * O certificado de destaque em PDF (10/11/2026, pedido do Kauan): só a
 * própria pessoa, e só se ficou no pódio (1º a 3º) do ranking geral de um mês
 * que já acabou. ?teste=digitacao|numeros|logica&mes=AAAA-MM
 */
export async function GET(req: NextRequest) {
  const ctx = await getAuthContext();
  if (!ctx.tenantId || !ctx.userId || !(await isModuleEnabled(ctx.tenantId, MODULO_ACADEMIA))) {
    return NextResponse.json({ error: "Sem permissão." }, { status: 403 });
  }
  const teste = req.nextUrl.searchParams.get("teste");
  const mes = req.nextUrl.searchParams.get("mes");
  if (!ehTeste(teste) || !ehMes(mes)) return NextResponse.json({ error: "Informe o teste e o mês." }, { status: 400 });
  if (!mesFechado(mes)) return NextResponse.json({ error: "O certificado sai quando o mês acaba." }, { status: 400 });

  const [{ ranking }, aparece] = await Promise.all([rankingDoMes(ctx.tenantId, { teste, mes, nivel: null, setor: null }), apareceNoRanking(ctx)]);
  const minha = aparece ? temCertificado(ranking, ctx.userId, true) : null;
  if (!minha) return NextResponse.json({ error: "O certificado é de quem ficou entre os 3 primeiros do mês." }, { status: 404 });

  const [pessoa, escritorio] = await Promise.all([
    getPrisma().user.findUnique({ where: { id: ctx.userId }, select: { name: true } }),
    getPrisma().tenant.findUnique({ where: { id: ctx.tenantId }, select: { name: true } }),
  ]);
  const dados = {
    nome: pessoa?.name ?? "",
    escritorio: escritorio?.name ?? "Connect",
    posicao: minha.posicao as 1 | 2 | 3,
    teste,
    mes,
    ppm: minha.ppm,
    acertos: minha.acertos,
    total: minha.total,
    precisao: minha.precisao,
    emitidoEm: new Date(),
  };
  const pdf = await pdfDoCertificado(dados);
  return new NextResponse(new Uint8Array(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${linhasDoCertificado(dados).arquivo}"`,
      "Cache-Control": "private, no-store",
    },
  });
}
