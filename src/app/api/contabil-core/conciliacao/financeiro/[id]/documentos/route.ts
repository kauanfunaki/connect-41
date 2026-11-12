import { NextRequest, NextResponse } from "next/server";
import { ArquivoGrande, bytesDe, idValido, marcado, MB, semEmpresa } from "@/lib/contabil-core/conciliacao/rotaDaRevisao";
import {
  analiseInexistente,
  auditarFinanceiro,
  autorizarFinanceiro,
  erroDoFinanceiro,
  leituraRecusada,
  recusaDoFinanceiro,
  respostaDaAnalise,
  tipoDeDocumento,
} from "@/lib/contabil-core/conciliacao/rotaDoFinanceiro";
import { adicionarDocumento, obterAnalise } from "@/lib/contabil-core/servidor/financeiro";

export const runtime = "nodejs";

// Um documento numa análise do financeiro (Bloco B, Fase B4, 12/11/2026): porte do
// `POST /concilpro/financeiro/{id}/documentos`. Um arquivo por envio (relatório do financeiro, SISPAG,
// Razão da conta banco ou extrato detalhado Itaú), com a versão que a tela viu e a confirmação da
// empresa. Como no original, a análise é conferida antes de ler o arquivo: arquivo de análise alheia
// não chega ao leitor. O original guarda os bytes (para baixar depois) e o SHA-256 (reenvio recusado).

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const a = await autorizarFinanceiro("agir");
  if (a.recusa) return a.recusa;

  const form = await req.formData().catch(() => null);
  if (!form) return NextResponse.json({ error: `O envio chegou incompleto. O arquivo passa de ${MB} MB?` }, { status: 400 });
  const empresaId = idValido(form.get("empresa"));
  if (!empresaId) return semEmpresa();
  const analiseId = idValido((await params).id);
  if (!analiseId) return analiseInexistente();
  const versao = Number(form.get("versao"));
  if (!Number.isInteger(versao) || versao < 1) return NextResponse.json({ error: "Versão da análise inválida. Atualize a tela." }, { status: 400 });
  const tipo = tipoDeDocumento(form.get("tipo"));
  if (!tipo) return NextResponse.json({ error: "Tipo de documento não suportado." }, { status: 400 });
  const arquivo = form.get("arquivo");
  if (!(arquivo instanceof File) || arquivo.size === 0) return NextResponse.json({ error: "Escolha o arquivo do documento." }, { status: 400 });

  try {
    const existe = await obterAnalise(a.ctx.tenantId, empresaId, analiseId);
    if (!existe.ok) return recusaDoFinanceiro(existe);
    const conteudo = await bytesDe(arquivo);
    const r = await adicionarDocumento(a.ctx.tenantId, a.ctx.userId, empresaId, analiseId, {
      tipo,
      conteudo,
      nomeArquivo: arquivo.name || "",
      mediaType: arquivo.type || "application/octet-stream",
      versao,
      confirmarEmpresa: marcado(form.get("confirmarEmpresa")),
    });
    if (!r.ok) return recusaDoFinanceiro(r);
    if (!r.valor.analise) return erroDoFinanceiro("documento", new Error("sem análise"));
    await auditarFinanceiro(a.ctx, analiseId, r.valor.auditoria);
    return respostaDaAnalise(r.valor.analise);
  } catch (err) {
    if (err instanceof ArquivoGrande) return NextResponse.json({ error: `O arquivo passa de ${MB} MB.` }, { status: 400 });
    if (leituraRecusada(err)) return NextResponse.json({ error: err.message }, { status: 400 });
    return erroDoFinanceiro("documento", err, "Não deu para ler o documento. Confira o arquivo e tente de novo.");
  }
}
