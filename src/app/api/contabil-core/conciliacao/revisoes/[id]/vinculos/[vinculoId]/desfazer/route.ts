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
import { desfazerVinculoSchema } from "@/lib/contabil-core/entradasRevisao";
import { desfazerVinculo } from "@/lib/contabil-core/servidor/revisao";

export const runtime = "nodejs";

// Desfazer uma conferência manual (Bloco B, Fase B3, 12/11/2026): porte do
// `POST /revisoes/{id}/vinculos/{vinculoId}/desfazer`. O motivo é obrigatório e o registro continua no
// histórico da revisão. Vale também na revisão que virou histórico (fonte alterada), como no original.

type Rota = { params: Promise<{ id: string; vinculoId: string }> };

export async function POST(req: NextRequest, { params }: Rota) {
  const a = await autorizar("agir");
  if (a.recusa) return a.recusa;
  const corpo = await corpoJson(req);
  if (!corpo) return NextResponse.json({ error: "Pedido inválido." }, { status: 400 });
  const empresaId = idValido(corpo.empresa);
  if (!empresaId) return semEmpresa();
  const p = await params;
  const revisaoId = idValido(p.id);
  if (!revisaoId) return revisaoInexistente();
  const vinculoId = idValido(p.vinculoId);
  if (!vinculoId) return NextResponse.json({ error: "Conferência não encontrada nesta revisão.", codigo: "NAO_ENCONTRADA" }, { status: 404 });
  const v = validar(desfazerVinculoSchema, corpo);
  if (!v.ok) return v.resposta;
  try {
    const r = await desfazerVinculo(a.ctx.tenantId, a.ctx.userId, empresaId, revisaoId, vinculoId, v.valor);
    if (!r.ok) return recusaDoServico(r);
    await auditar(a.ctx, revisaoId, r.valor.auditoria);
    return respostaDaRevisao(r.valor.revisao);
  } catch (err) {
    return erroInesperado("desfazer", err, "Não deu para desfazer a conferência. Tente de novo.");
  }
}
