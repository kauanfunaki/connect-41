import { NextResponse, type NextRequest } from "next/server";
import { getAuthContext } from "@/lib/auth/context";
import { podeNoModulo } from "@/lib/auth/modulo";
import { arquivoDoDocumento } from "@/lib/revisao-contabil/servidor";

export const dynamic = "force-dynamic";

const TIPOS: Record<string, string> = {
  pdf: "application/pdf",
  csv: "text/csv; charset=utf-8",
  txt: "text/plain; charset=utf-8",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  xls: "application/vnd.ms-excel",
};

/** O arquivo original de um documento da revisão. O PDF abre no navegador; o resto baixa. */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await getAuthContext();
  const naoAchou = () => NextResponse.json({ error: "Não encontrado." }, { status: 404 });
  if (!ctx.tenantId || !(await podeNoModulo(ctx, "contabil_revisao", "ver"))) return naoAchou();
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return naoAchou();
  const doc = await arquivoDoDocumento(ctx.tenantId, id);
  if (!doc) return naoAchou();
  const ext = doc.nome.toLowerCase().split(".").pop() ?? "";
  const tipo = TIPOS[ext] ?? "application/octet-stream";
  return new Response(new Uint8Array(doc.conteudo), {
    headers: {
      "Content-Type": tipo,
      "Content-Disposition": `${ext === "pdf" ? "inline" : "attachment"}; filename*=UTF-8''${encodeURIComponent(doc.nome)}`,
      "X-Content-Type-Options": "nosniff",
      "Cache-Control": "private, no-store",
    },
  });
}
