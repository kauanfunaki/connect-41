import { NextResponse, type NextRequest } from "next/server";
import { getAuthContext } from "@/lib/auth/context";
import { podeNoModulo } from "@/lib/auth/modulo";
import { getPrisma } from "@/lib/prisma";
import { empresaContabilVisivel } from "@/lib/contabil/servidor";
import { armazenamentoDosPagamentos } from "@/lib/contabil/importacaoDePagamentos";

export const dynamic = "force-dynamic";

/** O documento enviado, para conferir a leitura. O PDF abre no navegador; a planilha baixa. */
export async function GET(req: NextRequest) {
  const ctx = await getAuthContext();
  const naoAchou = () => NextResponse.json({ error: "Não encontrado." }, { status: 404 });
  if (!ctx.tenantId || !(await podeNoModulo(ctx, "contabil_sped", "ver"))) return naoAchou();
  const p = req.nextUrl.searchParams;
  const empresa = await empresaContabilVisivel(ctx, p.get("empresa") ?? "");
  const id = p.get("id") ?? "";
  if (!empresa || !/^[0-9a-f-]{36}$/i.test(id)) return naoAchou();
  const doc = await getPrisma().contabilDocumentoPagamento.findFirst({ where: { id, tenantId: ctx.tenantId, companyId: empresa.baseId }, select: { nome: true, mimeType: true, fileUrl: true } });
  const conteudo = doc ? await armazenamentoDosPagamentos.lerAnexo(doc.fileUrl) : null;
  if (!doc || !conteudo) return naoAchou();
  const inline = doc.mimeType === "application/pdf";
  return new Response(new Uint8Array(conteudo), {
    headers: {
      "Content-Type": doc.mimeType,
      "Content-Disposition": `${inline ? "inline" : "attachment"}; filename*=UTF-8''${encodeURIComponent(doc.nome)}`,
      "X-Content-Type-Options": "nosniff",
      "Cache-Control": "private, no-store",
    },
  });
}
