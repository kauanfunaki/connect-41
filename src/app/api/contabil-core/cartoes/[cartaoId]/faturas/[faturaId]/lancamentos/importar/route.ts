import { NextRequest, NextResponse } from "next/server";
import { ArquivoGrande, bytesDe, idValido, MB, semEmpresa } from "@/lib/contabil-core/conciliacao/rotaDaRevisao";
import { auditarCartoes, autorizarCartoes, erroDosCartoes, idsDoCaminho, naoEncontrado, recusaDoCartao, respostaSemCache } from "@/lib/contabil-core/cartoes/rotaDosCartoes";
import { importarCsv, importarPdf } from "@/lib/contabil-core/servidor/cartoes";

export const runtime = "nodejs";
// A leitura do PDF tem 65 s (o orçamento de 60 s mais 5, como a rota do original).
export const maxDuration = 90;

// Importar gastos de um arquivo (Bloco C, Fase C3, 23/11/2026): porte de
// `POST .../lancamentos/importar-csv` e `.../importar-pdf`. O formulário traz `empresa` e o `arquivo`; o
// PDF (pelo nome, pelo tipo ou pela assinatura "%PDF") vai ao leitor de fatura; o resto, ao CSV. A
// resposta é a do original: importados, duplicados (o mesmo arquivo reenviado não duplica) e os erros de
// cada linha.

type Params = { params: Promise<{ cartaoId: string; faturaId: string }> };

const ehPdf = (nome: string, tipo: string, b: Uint8Array) =>
  nome.toLowerCase().endsWith(".pdf") || tipo === "application/pdf" || (b.length >= 4 && b[0] === 0x25 && b[1] === 0x50 && b[2] === 0x44 && b[3] === 0x46);

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
    if (!(f instanceof File) || f.size === 0) return NextResponse.json({ error: "Envie o arquivo da fatura (CSV ou PDF)." }, { status: 400 });
    const bytes = await bytesDe(f);
    const r = ehPdf(f.name, f.type, bytes)
      ? await importarPdf(a.ctx.tenantId, a.ctx.userId, empresaId, ids.cartaoId, ids.faturaId, bytes)
      : await importarCsv(a.ctx.tenantId, empresaId, ids.cartaoId, ids.faturaId, bytes);
    if (!r.ok) return recusaDoCartao(r);
    await auditarCartoes(a.ctx, r.valor.auditoria);
    return respostaSemCache({ ok: true, importacao: r.valor.valor });
  } catch (err) {
    if (err instanceof ArquivoGrande) return NextResponse.json({ error: `O arquivo passa de ${MB} MB.` }, { status: 400 });
    return erroDosCartoes("importar lançamentos", err, "Não deu para importar o arquivo. Tente de novo.");
  }
}
