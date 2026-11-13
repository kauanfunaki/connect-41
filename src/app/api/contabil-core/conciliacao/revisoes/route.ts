import { NextRequest, NextResponse } from "next/server";
import { lerRazaoDoArquivo } from "@/lib/contabil-core/conciliacao/razaoPdf";
import { RazaoInvalido } from "@/lib/contabil-core/conciliacao/razaoTipos";
import { lerSispag, SispagInvalido, type ConsultaSispag } from "@/lib/contabil-core/conciliacao/sispag";
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
  semEmpresa,
  sha256,
} from "@/lib/contabil-core/conciliacao/rotaDaRevisao";
import { criarRevisao, listarRevisoes } from "@/lib/contabil-core/servidor/revisao";

export const runtime = "nodejs";

// As revisões manuais da conciliação de uma empresa (Bloco B, Fase B3, 12/11/2026): porte do
// `GET /revisoes` (lista paginada, com filtro de conta bancária) e do `POST /revisoes` (salva a análise:
// o Razão e, se vier, o SISPAG são lidos de novo e cruzados com o extrato, e o relatório fica guardado
// para a revisão). Do arquivo guarda-se só o nome e o SHA-256; os lançamentos vão para a revisão.

const POR_PAGINA = 50;

export async function GET(req: NextRequest) {
  const a = await autorizar("ver");
  if (a.recusa) return a.recusa;
  const q = req.nextUrl.searchParams;
  const empresaId = idValido(q.get("empresa"));
  if (!empresaId) return semEmpresa();
  const agencia = q.get("agencia");
  const agenciaId = agencia ? idValido(agencia) : null;
  if (agencia && !agenciaId) return NextResponse.json({ error: "Conta bancária inválida." }, { status: 400 });
  const pagina = Number(q.get("pagina") ?? "1");
  const porPagina = Number(q.get("porPagina") ?? String(POR_PAGINA));
  if (!Number.isInteger(pagina) || pagina < 1) return NextResponse.json({ error: "Página inválida." }, { status: 400 });
  if (!Number.isInteger(porPagina) || porPagina < 1 || porPagina > 100) return NextResponse.json({ error: "Tamanho de página inválido." }, { status: 400 });

  try {
    const r = await listarRevisoes(a.ctx.tenantId, empresaId, agenciaId, pagina, porPagina);
    if (!r.ok) return recusaDoServico(r);
    return NextResponse.json({ ok: true, lista: r.valor }, { headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    return erroInesperado("lista", err, "Não deu para consultar as revisões salvas. Tente de novo.");
  }
}

export async function POST(req: NextRequest) {
  const a = await autorizar("agir");
  if (a.recusa) return a.recusa;

  const form = await req.formData().catch(() => null);
  if (!form) return NextResponse.json({ error: `O envio chegou incompleto. Algum arquivo passa de ${MB} MB?` }, { status: 400 });
  const empresaId = idValido(form.get("empresa"));
  const agenciaId = idValido(form.get("agencia"));
  const arquivo = form.get("arquivo");
  const sispag = form.get("sispag");
  if (!empresaId) return semEmpresa();
  if (!agenciaId) return NextResponse.json({ error: "Escolha a conta bancária." }, { status: 400 });
  if (!(arquivo instanceof File) || arquivo.size === 0) return NextResponse.json({ error: "Escolha o arquivo do Razão." }, { status: 400 });

  try {
    const conteudo = await bytesDe(arquivo);
    const razao = await lerRazaoDoArquivo(conteudo, arquivo.name || "");
    // O SISPAG é opcional: campo vazio é como se não viesse (como na conciliação).
    let consulta: ConsultaSispag | null = null;
    let hashSispag: string | null = null;
    if (sispag instanceof File && sispag.size > 0) {
      const bytes = await bytesDe(sispag);
      consulta = lerSispag(bytes);
      hashSispag = sha256(bytes);
    }

    const r = await criarRevisao(a.ctx.tenantId, a.ctx.userId, empresaId, {
      agenciaId,
      razao,
      nomeArquivo: arquivo.name || "Razão",
      hashArquivo: sha256(conteudo),
      sispag: consulta,
      hashSispag,
      confirmarEmpresa: marcado(form.get("confirmarEmpresa")),
    });
    if (!r.ok) return recusaDoServico(r);
    await auditar(a.ctx, r.valor.revisao.id, r.valor.auditoria);
    return respostaDaRevisao(r.valor.revisao);
  } catch (err) {
    if (err instanceof ArquivoGrande) return NextResponse.json({ error: `O arquivo passa de ${MB} MB.` }, { status: 400 });
    if (err instanceof RazaoInvalido || err instanceof SispagInvalido) return NextResponse.json({ error: err.message }, { status: 400 });
    return erroInesperado("criação", err, "Não deu para salvar a análise. Confira os arquivos e tente de novo.");
  }
}
