import { NextRequest, NextResponse } from "next/server";
import { idValido, semEmpresa } from "@/lib/contabil-core/conciliacao/rotaDaRevisao";
import { autorizarComprovantes, comprovanteInexistente, erroDosComprovantes, recusaDoComprovante } from "@/lib/contabil-core/comprovantes/rotaDosComprovantes";
import { arquivoDoComprovante } from "@/lib/contabil-core/servidor/comprovantes";

export const runtime = "nodejs";

// O arquivo de um comprovante (Bloco C, Fase C2, 19/11/2026): porte do
// `GET /empresas/{id}/comprovantes/{comprovante_id}/arquivo`. O serviço confere tenant, empresa e
// comprovante vivo antes de ler o disco. PDF, PNG e JPEG abrem na tela (`inline`, como no original); o
// resto vai como anexo. Sempre com `nosniff` e sem cache: o arquivo é do cliente.

const NA_TELA = new Set(["application/pdf", "image/png", "image/jpeg"]);

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const a = await autorizarComprovantes("ver");
  if (a.recusa) return a.recusa;
  const empresaId = idValido(req.nextUrl.searchParams.get("empresa"));
  if (!empresaId) return semEmpresa();
  const id = idValido((await params).id);
  if (!id) return comprovanteInexistente();
  try {
    const r = await arquivoDoComprovante(a.ctx.tenantId, empresaId, id);
    if (!r.ok) return recusaDoComprovante(r);
    const { nome, tipo, bytes } = r.valor;
    const disposicao = NA_TELA.has(tipo) ? "inline" : "attachment";
    return new NextResponse(new Uint8Array(bytes), {
      headers: {
        "Content-Type": tipo,
        "Content-Disposition": `${disposicao}; filename*=UTF-8''${encodeURIComponent(nome || "comprovante")}`,
        "X-Content-Type-Options": "nosniff",
        "Cache-Control": "private, no-store",
      },
    });
  } catch (err) {
    return erroDosComprovantes("arquivo", err, "Não deu para abrir o arquivo. Tente de novo.");
  }
}
