import { after, NextRequest, NextResponse } from "next/server";
import { ArquivoGrande, bytesDe, idValido, MB, semEmpresa } from "@/lib/contabil-core/conciliacao/rotaDaRevisao";
import { auditarCartoes, autorizarCartoes, erroDosCartoes, idsDoCaminho, naoEncontrado, recusaDoCartao, respostaSemCache } from "@/lib/contabil-core/cartoes/rotaDosCartoes";
import { adicionarDocumento, processarDocumento } from "@/lib/contabil-core/servidor/faturas";

export const runtime = "nodejs";
// A leitura por imagem tem até 300 s, mais 10 de folga (`pdf_vision_timeout_seconds + 10`).
export const maxDuration = 320;

// Enviar o PDF da fatura para leitura (Bloco C, Fase C3, 23/11/2026): porte do
// `POST .../faturas/{fatura_id}/documentos` (202). O PDF vai para o disco e a linha nasce "processando"; a
// leitura (composição, texto ou imagem pela IA do escritório) roda depois da resposta (`after`, o
// `BackgroundTasks` do original). Nenhuma compra entra sem a revisão.

type Params = { params: Promise<{ cartaoId: string; faturaId: string }> };

export async function POST(req: NextRequest, { params }: Params) {
  const a = await autorizarCartoes("agir");
  if (a.recusa) return a.recusa;
  const ids = idsDoCaminho(await params);
  if (!ids) return naoEncontrado();
  try {
    const form = await req.formData().catch(() => null);
    if (!form) return NextResponse.json({ error: `O envio chegou incompleto. O arquivo passa de ${MB} MB?` }, { status: 400 });
    const empresaId = idValido(form.get("empresa"));
    if (!empresaId) return semEmpresa();
    const f = form.get("arquivo");
    if (!(f instanceof File) || f.size === 0) return NextResponse.json({ error: "Envie o PDF da fatura." }, { status: 400 });
    const bytes = await bytesDe(f);
    const r = await adicionarDocumento({ tenantId: a.ctx.tenantId, empresaId, cartaoId: ids.cartaoId, faturaId: ids.faturaId, userId: a.ctx.userId }, bytes, f.name || "fatura.pdf");
    if (!r.ok) return recusaDoCartao(r);
    await auditarCartoes(a.ctx, r.valor.auditoria);
    const documento = r.valor.valor;
    const quem = a.ctx.userId;
    after(() => processarDocumento(documento.id, quem));
    return respostaSemCache({ ok: true, documento }, 202);
  } catch (err) {
    if (err instanceof ArquivoGrande) return NextResponse.json({ error: "Envie um PDF de até 25 MiB." }, { status: 422 });
    return erroDosCartoes("enviar documento", err, "Não deu para enviar o PDF. Tente de novo.");
  }
}
