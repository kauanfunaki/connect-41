import { NextRequest, NextResponse } from "next/server";
import { contentDispositionDeAnexo } from "@/lib/drive/zip";
import { idValido, semEmpresa } from "@/lib/contabil-core/conciliacao/rotaDaRevisao";
import { analiseInexistente, autorizarFinanceiro, erroDoFinanceiro, formatoDoOriginal, recusaDoFinanceiro } from "@/lib/contabil-core/conciliacao/rotaDoFinanceiro";
import { originalDoDocumento } from "@/lib/contabil-core/servidor/financeiro";

export const runtime = "nodejs";

// Baixar o arquivo original de um documento da análise (Bloco B, Fase B4, 12/11/2026): porte do
// `GET /concilpro/financeiro/{id}/documentos/{fonte}/arquivo`. O serviço confere tenant, empresa,
// análise e documento. Sempre como anexo (`attachment`, com o nome em ASCII e em UTF-8), `nosniff` e
// sem cache: o arquivo é do cliente e não fica em URL pública nem no cache do navegador.

type Rota = { params: Promise<{ id: string; fonteId: string }> };

export async function GET(req: NextRequest, { params }: Rota) {
  const a = await autorizarFinanceiro("ver");
  if (a.recusa) return a.recusa;
  const empresaId = idValido(req.nextUrl.searchParams.get("empresa"));
  if (!empresaId) return semEmpresa();
  const p = await params;
  const analiseId = idValido(p.id);
  if (!analiseId) return analiseInexistente();
  const fonteId = idValido(p.fonteId);
  if (!fonteId) return NextResponse.json({ error: "Arquivo original não encontrado nesta análise.", codigo: "NAO_ENCONTRADA" }, { status: 404 });
  try {
    const r = await originalDoDocumento(a.ctx.tenantId, empresaId, analiseId, fonteId);
    if (!r.ok) return recusaDoFinanceiro(r);
    const { nome, mediaType, bytes } = r.valor;
    return new NextResponse(new Uint8Array(bytes), {
      headers: {
        "Content-Type": formatoDoOriginal(mediaType),
        "Content-Disposition": contentDispositionDeAnexo(nome || "documento"),
        "X-Content-Type-Options": "nosniff",
        "Cache-Control": "private, no-store",
      },
    });
  } catch (err) {
    return erroDoFinanceiro("original", err, "Não deu para baixar o arquivo. Tente de novo.");
  }
}
