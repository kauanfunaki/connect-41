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
import { novoVinculoSchema } from "@/lib/contabil-core/entradasRevisao";
import { criarVinculo } from "@/lib/contabil-core/servidor/revisao";

export const runtime = "nodejs";

// Registrar uma conferência manual (Bloco B, Fase B3, 12/11/2026): porte do `POST /revisoes/{id}/vinculos`.
// Linhas do extrato e do Razão que a pessoa diz que se compõem. As somas e a regra da diferença (que
// pede observação) são conferidas de novo no serviço; nada no extrato nem no Razão muda.

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const a = await autorizar("agir");
  if (a.recusa) return a.recusa;
  const corpo = await corpoJson(req);
  if (!corpo) return NextResponse.json({ error: "Pedido inválido." }, { status: 400 });
  const empresaId = idValido(corpo.empresa);
  if (!empresaId) return semEmpresa();
  const revisaoId = idValido((await params).id);
  if (!revisaoId) return revisaoInexistente();
  const v = validar(novoVinculoSchema, corpo);
  if (!v.ok) return v.resposta;
  try {
    const r = await criarVinculo(a.ctx.tenantId, a.ctx.userId, empresaId, revisaoId, v.valor);
    if (!r.ok) return recusaDoServico(r);
    await auditar(a.ctx, revisaoId, r.valor.auditoria);
    return respostaDaRevisao(r.valor.revisao);
  } catch (err) {
    return erroInesperado("vínculo", err, "Não deu para registrar a conferência. Tente de novo.");
  }
}
