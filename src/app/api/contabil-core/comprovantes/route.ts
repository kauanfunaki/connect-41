import { NextRequest, NextResponse } from "next/server";
import { ArquivoGrande, bytesDe, corpoJson, idValido, MB, semEmpresa } from "@/lib/contabil-core/conciliacao/rotaDaRevisao";
import {
  auditarComprovante,
  autorizarComprovantes,
  camposDoCorpo,
  consultaDaLista,
  erroDosComprovantes,
  recusaDoComprovante,
  respostaSemCache,
} from "@/lib/contabil-core/comprovantes/rotaDosComprovantes";
import { criarComprovante, listarComprovantes, type ArquivoDoComprovante } from "@/lib/contabil-core/servidor/comprovantes";

export const runtime = "nodejs";

// Os comprovantes de pagamento de uma empresa (Bloco C, Fase C2, 19/11/2026): porte do
// `GET /empresas/{id}/comprovantes` (lista paginada com os filtros de conta bancária, transação e status
// "associado"/"nao_associado") e do `POST /empresas/{id}/comprovantes` (o cadastro, validado como o
// `ComprovanteCreate`, com o arquivo opcional). O cadastro aceita JSON ou formulário: no formulário, os
// campos vão em `dados` (JSON) e o arquivo em `arquivo` (o original mandava o arquivo em base64 no JSON).

export async function GET(req: NextRequest) {
  const a = await autorizarComprovantes("ver");
  if (a.recusa) return a.recusa;
  const q = req.nextUrl.searchParams;
  const empresaId = idValido(q.get("empresa"));
  if (!empresaId) return semEmpresa();
  const c = consultaDaLista(q);
  if (!c.ok) return NextResponse.json({ error: c.erro }, { status: 400 });
  try {
    const r = await listarComprovantes(a.ctx.tenantId, empresaId, c.filtros, c.pagina, c.porPagina);
    if (!r.ok) return recusaDoComprovante(r);
    return respostaSemCache({ ok: true, lista: r.valor });
  } catch (err) {
    return erroDosComprovantes("lista", err, "Não deu para consultar os comprovantes. Tente de novo.");
  }
}

/** O corpo do cadastro: JSON, ou formulário com `dados` (JSON), `empresa` e o `arquivo`. */
async function lerCorpo(req: NextRequest): Promise<{ corpo: Record<string, unknown> | null; empresa: unknown; arquivo: ArquivoDoComprovante | null } | { recusa: NextResponse }> {
  if (!(req.headers.get("content-type") ?? "").includes("multipart/form-data")) {
    const corpo = await corpoJson(req);
    return { corpo, empresa: corpo?.empresa, arquivo: null };
  }
  const form = await req.formData().catch(() => null);
  if (!form) return { recusa: NextResponse.json({ error: `O envio chegou incompleto. O arquivo passa de ${MB} MB?` }, { status: 400 }) };
  const dados = form.get("dados");
  let corpo: Record<string, unknown> | null = null;
  try {
    const v: unknown = typeof dados === "string" ? JSON.parse(dados) : null;
    corpo = v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
  } catch {
    corpo = null;
  }
  const f = form.get("arquivo");
  const arquivo = f instanceof File && f.size > 0 ? { nome: f.name || "", tipo: f.type || "", conteudo: await bytesDe(f) } : null;
  return { corpo, empresa: form.get("empresa"), arquivo };
}

export async function POST(req: NextRequest) {
  const a = await autorizarComprovantes("agir");
  if (a.recusa) return a.recusa;
  try {
    const lido = await lerCorpo(req);
    if ("recusa" in lido) return lido.recusa;
    if (!lido.corpo) return NextResponse.json({ error: "Pedido inválido." }, { status: 400 });
    const empresaId = idValido(lido.empresa);
    if (!empresaId) return semEmpresa();
    const r = await criarComprovante(a.ctx.tenantId, empresaId, camposDoCorpo(lido.corpo), lido.arquivo);
    if (!r.ok) return recusaDoComprovante(r);
    await auditarComprovante(a.ctx, r.valor.comprovante!.id, r.valor.auditoria);
    return respostaSemCache({ ok: true, comprovante: r.valor.comprovante });
  } catch (err) {
    if (err instanceof ArquivoGrande) return NextResponse.json({ error: `O arquivo passa de ${MB} MB.` }, { status: 400 });
    return erroDosComprovantes("cadastro", err, "Não deu para cadastrar o comprovante. Tente de novo.");
  }
}
