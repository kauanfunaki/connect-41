import { NextRequest, NextResponse } from "next/server";
import {
  auditar,
  autorizar,
  corpoJson,
  erroInesperado,
  idValido,
  recusaDoServico,
  respostaDaRevisao,
  revisaoInexistente,
  semEmpresa,
  validar,
} from "@/lib/contabil-core/conciliacao/rotaDaRevisao";
import { excluirRevisaoSchema, renomearRevisaoSchema } from "@/lib/contabil-core/entradasRevisao";
import { excluirRevisao, obterRevisao, renomearRevisao } from "@/lib/contabil-core/servidor/revisao";

export const runtime = "nodejs";

// Uma revisão manual da conciliação (Bloco B, Fase B3, 12/11/2026): abrir (`GET`), renomear (`PATCH`,
// só o título) e excluir (`DELETE`, exclusão lógica: o histórico fica). Porte de `/revisoes/{id}`. Toda
// alteração leva a versão que a tela recebeu; outra pessoa alterou antes → 409 e a tela recarrega.

type Rota = { params: Promise<{ id: string }> };

export async function GET(req: NextRequest, { params }: Rota) {
  const a = await autorizar("ver");
  if (a.recusa) return a.recusa;
  const empresaId = idValido(req.nextUrl.searchParams.get("empresa"));
  if (!empresaId) return semEmpresa();
  const revisaoId = idValido((await params).id);
  if (!revisaoId) return revisaoInexistente();
  try {
    const r = await obterRevisao(a.ctx.tenantId, empresaId, revisaoId);
    if (!r.ok) return recusaDoServico(r);
    return respostaDaRevisao(r.valor);
  } catch (err) {
    return erroInesperado("abrir", err, "Não deu para abrir a revisão. Tente de novo.");
  }
}

export async function PATCH(req: NextRequest, { params }: Rota) {
  const a = await autorizar("agir");
  if (a.recusa) return a.recusa;
  const corpo = await corpoJson(req);
  if (!corpo) return NextResponse.json({ error: "Pedido inválido." }, { status: 400 });
  const empresaId = idValido(corpo.empresa);
  if (!empresaId) return semEmpresa();
  const revisaoId = idValido((await params).id);
  if (!revisaoId) return revisaoInexistente();
  const v = validar(renomearRevisaoSchema, corpo);
  if (!v.ok) return v.resposta;
  try {
    const r = await renomearRevisao(a.ctx.tenantId, a.ctx.userId, empresaId, revisaoId, v.valor);
    if (!r.ok) return recusaDoServico(r);
    await auditar(a.ctx, revisaoId, r.valor.auditoria);
    return respostaDaRevisao(r.valor.revisao);
  } catch (err) {
    return erroInesperado("renomear", err);
  }
}

export async function DELETE(req: NextRequest, { params }: Rota) {
  const a = await autorizar("agir");
  if (a.recusa) return a.recusa;
  const corpo = await corpoJson(req);
  if (!corpo) return NextResponse.json({ error: "Pedido inválido." }, { status: 400 });
  const empresaId = idValido(corpo.empresa);
  if (!empresaId) return semEmpresa();
  const revisaoId = idValido((await params).id);
  if (!revisaoId) return revisaoInexistente();
  const v = validar(excluirRevisaoSchema, corpo);
  if (!v.ok) return v.resposta;
  try {
    const r = await excluirRevisao(a.ctx.tenantId, a.ctx.userId, empresaId, revisaoId, v.valor.versao);
    if (!r.ok) return recusaDoServico(r);
    await auditar(a.ctx, revisaoId, r.valor.auditoria);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return erroInesperado("excluir", err);
  }
}
