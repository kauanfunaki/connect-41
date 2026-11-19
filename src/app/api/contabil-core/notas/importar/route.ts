import { NextRequest, NextResponse } from "next/server";
import { ArquivoGrande, bytesDe, idValido, MB, semEmpresa } from "@/lib/contabil-core/conciliacao/rotaDaRevisao";
import { auditarImportacao, autorizarNotas, erroDasNotas, recusaDaNota, respostaSemCache } from "@/lib/contabil-core/notas/rotaDasNotas";
import { importarArquivo } from "@/lib/contabil-core/servidor/notas";

export const runtime = "nodejs";

// Importar notas fiscais (Bloco C, Fase C1, 18/11/2026): porte do `POST /empresas/{id}/notas/importar-xml`.
// Um arquivo por envio, com o limite de 25 MB do original: XML de NF-e ou NFS-e, ZIP com vários XML,
// PDF (DANFe) ou imagem (PNG/JPG). PDF e imagem são lidos pela IA do escritório; com a leitura por IA
// desligada, a recusa do leitor volta como erro do arquivo. A tela manda vários arquivos, um por vez,
// para um arquivo com defeito não derrubar os outros (como o original).

export async function POST(req: NextRequest) {
  const a = await autorizarNotas("agir");
  if (a.recusa) return a.recusa;
  const form = await req.formData().catch(() => null);
  if (!form) return NextResponse.json({ error: `O envio chegou incompleto. O arquivo passa de ${MB} MB?` }, { status: 400 });
  const empresaId = idValido(form.get("empresa"));
  if (!empresaId) return semEmpresa();
  const arquivo = form.get("arquivo");
  if (!(arquivo instanceof File) || arquivo.size === 0) return NextResponse.json({ error: "Escolha o arquivo da nota." }, { status: 400 });

  try {
    const conteudo = await bytesDe(arquivo);
    const r = await importarArquivo(a.ctx.tenantId, a.ctx.userId, empresaId, { nome: arquivo.name || "", conteudo });
    if (!r.ok) return recusaDaNota(r);
    await auditarImportacao(a.ctx, empresaId, r.valor.auditoria);
    const { importadas, duplicadas, erros } = r.valor.resultado;
    return respostaSemCache({ ok: true, importacao: { importadas, duplicadas, erros, mensagem: r.valor.mensagem } });
  } catch (err) {
    if (err instanceof ArquivoGrande) return NextResponse.json({ error: `O arquivo passa de ${MB} MB.` }, { status: 400 });
    return erroDasNotas("importação", err, "Não deu para importar a nota. Confira o arquivo e tente de novo.");
  }
}
