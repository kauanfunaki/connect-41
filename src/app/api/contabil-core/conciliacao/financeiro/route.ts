import { NextRequest, NextResponse } from "next/server";
import { corpoJson, idValido, semEmpresa, validar } from "@/lib/contabil-core/conciliacao/rotaDaRevisao";
import {
  auditarFinanceiro,
  autorizarFinanceiro,
  erroDoFinanceiro,
  recusaDoFinanceiro,
  respostaDaAnalise,
  respostaSemCache,
} from "@/lib/contabil-core/conciliacao/rotaDoFinanceiro";
import { novaAnaliseSchema } from "@/lib/contabil-core/entradasFinanceiro";
import { criarAnalise, listarAnalises } from "@/lib/contabil-core/servidor/financeiro";

export const runtime = "nodejs";

// As análises da conferência do financeiro de uma empresa (Bloco B, Fase B4, 12/11/2026): porte do
// `GET /concilpro/financeiro` (lista paginada, só metadados, com filtro de conta bancária) e do
// `POST /concilpro/financeiro` (abre a análise com conta e período; os documentos vêm depois, um por
// envio, em `[id]/documentos`). O extrato do período entra na análise já na criação.

const POR_PAGINA = 20;

export async function GET(req: NextRequest) {
  const a = await autorizarFinanceiro("ver");
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
    const r = await listarAnalises(a.ctx.tenantId, empresaId, agenciaId, pagina, porPagina);
    if (!r.ok) return recusaDoFinanceiro(r);
    return respostaSemCache({ ok: true, lista: r.valor });
  } catch (err) {
    return erroDoFinanceiro("lista", err, "Não deu para consultar as análises salvas. Tente de novo.");
  }
}

export async function POST(req: NextRequest) {
  const a = await autorizarFinanceiro("agir");
  if (a.recusa) return a.recusa;
  const corpo = await corpoJson(req);
  if (!corpo) return NextResponse.json({ error: "Pedido inválido." }, { status: 400 });
  const empresaId = idValido(corpo.empresa);
  if (!empresaId) return semEmpresa();
  const v = validar(novaAnaliseSchema, corpo);
  if (!v.ok) return v.resposta;
  try {
    const r = await criarAnalise(a.ctx.tenantId, a.ctx.userId, empresaId, v.valor);
    if (!r.ok) return recusaDoFinanceiro(r);
    if (!r.valor.analise) return erroDoFinanceiro("criação", new Error("sem análise"));
    await auditarFinanceiro(a.ctx, r.valor.analise.id, r.valor.auditoria);
    return respostaDaAnalise(r.valor.analise);
  } catch (err) {
    return erroDoFinanceiro("criação", err, "Não deu para abrir a análise. Tente de novo.");
  }
}
