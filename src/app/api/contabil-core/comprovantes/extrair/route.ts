import { NextRequest, NextResponse } from "next/server";
import { ArquivoGrande, bytesDe, idValido, MB, semEmpresa } from "@/lib/contabil-core/conciliacao/rotaDaRevisao";
import { autorizarComprovantes, erroDosComprovantes, recusaDoComprovante, respostaSemCache } from "@/lib/contabil-core/comprovantes/rotaDosComprovantes";
import { extrairDoArquivo } from "@/lib/contabil-core/servidor/comprovantes";

export const runtime = "nodejs";

// Ler o comprovante para pré-preencher o formulário (Bloco C, Fase C2, 19/11/2026): porte do
// `POST /empresas/{id}/comprovantes/extrair-pdf`. Não grava nada: devolve os campos que a pessoa revisa
// antes de salvar. O arquivo que já está num comprovante da empresa é recusado antes de ler
// (`COMPROVANTE_JA_IMPORTADO`), e a nota fiscal, com `DOCUMENTO_NAO_E_COMPROVANTE`: nos dois casos a tela
// pula o arquivo em vez de pedir preenchimento à mão.

export async function POST(req: NextRequest) {
  const a = await autorizarComprovantes("agir");
  if (a.recusa) return a.recusa;
  const form = await req.formData().catch(() => null);
  if (!form) return NextResponse.json({ error: `O envio chegou incompleto. O arquivo passa de ${MB} MB?` }, { status: 400 });
  const empresaId = idValido(form.get("empresa"));
  if (!empresaId) return semEmpresa();
  const arquivo = form.get("arquivo");
  if (!(arquivo instanceof File) || arquivo.size === 0) return NextResponse.json({ error: "Escolha o arquivo do comprovante." }, { status: 400 });
  try {
    const conteudo = await bytesDe(arquivo);
    const r = await extrairDoArquivo(a.ctx.tenantId, a.ctx.userId, empresaId, { nome: arquivo.name || "", tipo: arquivo.type || "", conteudo });
    if (!r.ok) return recusaDoComprovante(r);
    return respostaSemCache({ ok: true, extracao: r.valor });
  } catch (err) {
    if (err instanceof ArquivoGrande) return NextResponse.json({ error: `O arquivo passa de ${MB} MB.` }, { status: 400 });
    return erroDosComprovantes("leitura do arquivo", err, "Não deu para ler o arquivo. Preencha os campos manualmente.");
  }
}
