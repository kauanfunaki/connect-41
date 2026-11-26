import { NextResponse } from "next/server";
import { getAuthContext } from "@/lib/auth/context";
import { podeNoModulo } from "@/lib/auth/modulo";
import { recusaDoFoco } from "@/lib/empresas/focoServidor";
import { getPrisma } from "@/lib/prisma";
import { documentoDoColaborador, lerTipoDeDocumento } from "@/lib/dp2/documentosServidor";

export const dynamic = "force-dynamic";

// Documentos do DP em PDF (funcionalidade-776): ficha de registro, contrato de experiência,
// histórico PPP (funcionalidade-761) e ficha de atualização da CTPS. A montagem fica em
// documentosServidor.ts, a mesma do "Guardar nos Arquivos".
export async function GET(req: Request) {
  const url = new URL(req.url);
  const personId = url.searchParams.get("pessoa") ?? "";
  const tipo = lerTipoDeDocumento(url.searchParams.get("tipo"));
  const ctx = await getAuthContext();
  if (!ctx.userId || !ctx.tenantId) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  if (!(await podeNoModulo(ctx, "dp2_colaboradores", "ver"))) return NextResponse.json({ error: "Sem permissão." }, { status: 403 });
  const pessoa = await getPrisma().person.findFirst({ where: { id: personId, tenantId: ctx.tenantId }, select: { currentCompanyId: true } });
  if (pessoa?.currentCompanyId) {
    const foraDoFoco = await recusaDoFoco(ctx, [pessoa.currentCompanyId]);
    if (foraDoFoco) return NextResponse.json({ error: foraDoFoco }, { status: 403 });
  }
  const doc = await documentoDoColaborador(ctx.tenantId, personId, tipo);
  if (!doc.ok) return NextResponse.json({ error: doc.erro }, { status: doc.status });
  return new NextResponse(new Uint8Array(doc.pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(doc.nome)}`,
      "Cache-Control": "no-store",
      // O que faltou no cadastro, para quem quiser avisar (o PDF sai com "—" no lugar).
      ...(doc.faltas.length ? { "X-Faltas": encodeURIComponent(doc.faltas.join("; ")) } : {}),
    },
  });
}
