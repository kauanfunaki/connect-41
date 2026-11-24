import { NextRequest, NextResponse } from "next/server";
import { corpoJson, idValido, semEmpresa } from "@/lib/contabil-core/conciliacao/rotaDaRevisao";
import { auditarCartoes, autorizarCartoes, camposDoCorpo, erroDosCartoes, recusaDoCartao, respostaSemCache } from "@/lib/contabil-core/cartoes/rotaDosCartoes";
import { criarCartao, listarCartoes } from "@/lib/contabil-core/servidor/cartoes";

export const runtime = "nodejs";

// Os cartões de crédito de uma empresa (Bloco C, Fase C3, 23/11/2026): porte do
// `GET /empresas/{id}/cartoes` (por nome, com o total de faturas e o valor da fatura aberta) e do
// `POST /empresas/{id}/cartoes` (o cadastro, validado como o `CartaoCreate`).

export async function GET(req: NextRequest) {
  const a = await autorizarCartoes("ver");
  if (a.recusa) return a.recusa;
  const empresaId = idValido(req.nextUrl.searchParams.get("empresa"));
  if (!empresaId) return semEmpresa();
  try {
    const r = await listarCartoes(a.ctx.tenantId, empresaId);
    if (!r.ok) return recusaDoCartao(r);
    return respostaSemCache({ ok: true, cartoes: r.valor });
  } catch (err) {
    return erroDosCartoes("lista", err, "Não deu para consultar os cartões. Tente de novo.");
  }
}

export async function POST(req: NextRequest) {
  const a = await autorizarCartoes("agir");
  if (a.recusa) return a.recusa;
  const corpo = await corpoJson(req);
  if (!corpo) return NextResponse.json({ error: "Pedido inválido." }, { status: 400 });
  const empresaId = idValido(corpo.empresa);
  if (!empresaId) return semEmpresa();
  try {
    const r = await criarCartao(a.ctx.tenantId, empresaId, camposDoCorpo(corpo));
    if (!r.ok) return recusaDoCartao(r);
    await auditarCartoes(a.ctx, r.valor.auditoria);
    return respostaSemCache({ ok: true, cartao: r.valor.valor }, 201);
  } catch (err) {
    return erroDosCartoes("cadastro", err, "Não deu para cadastrar o cartão. Tente de novo.");
  }
}
