import { NextRequest, NextResponse } from "next/server";
import { lerRazaoApoioDoArquivo } from "@/lib/contabil-core/conciliacao/razaoPdf";
import { RazaoInvalido } from "@/lib/contabil-core/conciliacao/razaoTipos";
import {
  ArquivoGrande,
  auditar,
  autorizar,
  bytesDe,
  erroInesperado,
  idValido,
  marcado,
  MB,
  recusaDoServico,
  respostaDaRevisao,
  revisaoInexistente,
  semEmpresa,
} from "@/lib/contabil-core/conciliacao/rotaDaRevisao";
import { adicionarApoio, obterRevisao } from "@/lib/contabil-core/servidor/revisao";

export const runtime = "nodejs";

// O Razão de apoio de uma revisão (Bloco B, Fase B3, 12/11/2026): porte do `POST /revisoes/{id}/apoio`.
// FGTS a recolher, impostos ou outras contas, para buscar a composição de um valor do banco. Como no
// original, a revisão é conferida antes de ler o arquivo: arquivo de revisão alheia não chega ao leitor.

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const a = await autorizar("agir");
  if (a.recusa) return a.recusa;

  const form = await req.formData().catch(() => null);
  if (!form) return NextResponse.json({ error: `O envio chegou incompleto. O arquivo passa de ${MB} MB?` }, { status: 400 });
  const empresaId = idValido(form.get("empresa"));
  if (!empresaId) return semEmpresa();
  const revisaoId = idValido((await params).id);
  if (!revisaoId) return revisaoInexistente();
  const versao = Number(form.get("versao"));
  if (!Number.isInteger(versao) || versao < 1) return NextResponse.json({ error: "Versão da revisão inválida. Atualize a tela." }, { status: 400 });
  const arquivo = form.get("arquivo");
  if (!(arquivo instanceof File) || arquivo.size === 0) return NextResponse.json({ error: "Escolha o arquivo do Razão de apoio." }, { status: 400 });

  try {
    const existe = await obterRevisao(a.ctx.tenantId, empresaId, revisaoId);
    if (!existe.ok) return recusaDoServico(existe);
    const razao = await lerRazaoApoioDoArquivo(await bytesDe(arquivo), arquivo.name || "");
    const r = await adicionarApoio(a.ctx.tenantId, a.ctx.userId, empresaId, revisaoId, {
      razao,
      nomeArquivo: arquivo.name || "Razão de apoio",
      versao,
      confirmarEmpresa: marcado(form.get("confirmarEmpresa")),
    });
    if (!r.ok) return recusaDoServico(r);
    await auditar(a.ctx, revisaoId, r.valor.auditoria);
    return respostaDaRevisao(r.valor.revisao);
  } catch (err) {
    if (err instanceof ArquivoGrande) return NextResponse.json({ error: `O arquivo passa de ${MB} MB.` }, { status: 400 });
    if (err instanceof RazaoInvalido) return NextResponse.json({ error: err.message }, { status: 400 });
    return erroInesperado("razão de apoio", err, "Não deu para ler o Razão de apoio. Confira o arquivo e tente de novo.");
  }
}
