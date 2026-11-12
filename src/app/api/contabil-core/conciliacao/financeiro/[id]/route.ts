import { NextRequest, NextResponse } from "next/server";
import { corpoJson, idValido, semEmpresa, validar } from "@/lib/contabil-core/conciliacao/rotaDaRevisao";
import {
  analiseInexistente,
  auditarFinanceiro,
  autorizarFinanceiro,
  erroDoFinanceiro,
  recusaDoFinanceiro,
  respostaDaAnalise,
} from "@/lib/contabil-core/conciliacao/rotaDoFinanceiro";
import { excluirAnaliseSchema, renomearAnaliseSchema } from "@/lib/contabil-core/entradasFinanceiro";
import { excluirAnalise, obterAnalise, renomearAnalise } from "@/lib/contabil-core/servidor/financeiro";

export const runtime = "nodejs";

// Uma análise da conferência do financeiro (Bloco B, Fase B4, 12/11/2026): abrir (`GET`, a análise
// inteira: fontes, linhas, títulos em aberto e conferências), renomear (`PATCH`, só o título) e excluir
// (`DELETE`, exclusão lógica: fontes, conferências e auditoria ficam). Como no original, renomear e
// excluir usam os mesmos contratos da revisão (`NomeConciliacao`, `ExclusaoConciliacao`): banco,
// período e arquivos não mudam por aqui. Toda alteração leva a versão; versão velha é 409.

type Rota = { params: Promise<{ id: string }> };

export async function GET(req: NextRequest, { params }: Rota) {
  const a = await autorizarFinanceiro("ver");
  if (a.recusa) return a.recusa;
  const empresaId = idValido(req.nextUrl.searchParams.get("empresa"));
  if (!empresaId) return semEmpresa();
  const analiseId = idValido((await params).id);
  if (!analiseId) return analiseInexistente();
  try {
    const r = await obterAnalise(a.ctx.tenantId, empresaId, analiseId);
    if (!r.ok) return recusaDoFinanceiro(r);
    return respostaDaAnalise(r.valor);
  } catch (err) {
    return erroDoFinanceiro("abrir", err, "Não deu para abrir a análise. Tente de novo.");
  }
}

export async function PATCH(req: NextRequest, { params }: Rota) {
  const a = await autorizarFinanceiro("agir");
  if (a.recusa) return a.recusa;
  const corpo = await corpoJson(req);
  if (!corpo) return NextResponse.json({ error: "Pedido inválido." }, { status: 400 });
  const empresaId = idValido(corpo.empresa);
  if (!empresaId) return semEmpresa();
  const analiseId = idValido((await params).id);
  if (!analiseId) return analiseInexistente();
  const v = validar(renomearAnaliseSchema, corpo);
  if (!v.ok) return v.resposta;
  try {
    const r = await renomearAnalise(a.ctx.tenantId, a.ctx.userId, empresaId, analiseId, v.valor);
    if (!r.ok) return recusaDoFinanceiro(r);
    await auditarFinanceiro(a.ctx, analiseId, r.valor.auditoria);
    return r.valor.analise ? respostaDaAnalise(r.valor.analise) : NextResponse.json({ ok: true });
  } catch (err) {
    return erroDoFinanceiro("renomear", err);
  }
}

export async function DELETE(req: NextRequest, { params }: Rota) {
  const a = await autorizarFinanceiro("agir");
  if (a.recusa) return a.recusa;
  const corpo = await corpoJson(req);
  if (!corpo) return NextResponse.json({ error: "Pedido inválido." }, { status: 400 });
  const empresaId = idValido(corpo.empresa);
  if (!empresaId) return semEmpresa();
  const analiseId = idValido((await params).id);
  if (!analiseId) return analiseInexistente();
  const v = validar(excluirAnaliseSchema, corpo);
  if (!v.ok) return v.resposta;
  try {
    const r = await excluirAnalise(a.ctx.tenantId, a.ctx.userId, empresaId, analiseId, v.valor.versao);
    if (!r.ok) return recusaDoFinanceiro(r);
    await auditarFinanceiro(a.ctx, analiseId, r.valor.auditoria);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return erroDoFinanceiro("excluir", err);
  }
}
