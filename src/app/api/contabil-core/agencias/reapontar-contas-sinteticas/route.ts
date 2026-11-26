import { NextRequest, NextResponse } from "next/server";
import type { Prisma } from "@/generated/prisma/client";
import { getAuthContext } from "@/lib/auth/context";
import { podeNoModulo } from "@/lib/auth/modulo";
import { logAudit } from "@/lib/audit";
import { corpoJson, idValido, semEmpresa } from "@/lib/contabil-core/conciliacao/rotaDaRevisao";
import { NAO_ENCONTRADA } from "@/lib/contabil-core/servidor/base";
import { reapontarContasSinteticas } from "@/lib/contabil-core/servidor/cadastros";

export const runtime = "nodejs";

// Corrigir a conta bancária do razão (Bloco D, Fase D0, 26/11/2026): porte do
// `POST /empresas/{id}/agencias/reapontar-contas-sinteticas` do original (`agencias.write`). Move as partidas e
// as decisões do NEO da conta sintética `1.1.B.<id>` de cada conta bancária para a conta contábil vinculada e
// desativa a sintética quando nada mais aponta para ela. REESCREVE registros contábeis já lançados: é uma
// ação explícita da tela, nunca efeito de salvar a conta bancária. Pede "gerir", como as outras escritas de
// conta bancária (`salvarAgenciaAction`, `mudarAtivaDaAgenciaAction`).

/** A ação que o serviço devolve (a varredura da auditoria lê este mapa para conferir a frase). */
const ACOES_DO_REAPONTAMENTO: Record<string, string> = {
  "contabil.core.contas_sinteticas.reapontadas": "contabil.core.contas_sinteticas.reapontadas",
};

export async function POST(req: NextRequest) {
  const ctx = await getAuthContext();
  if (!ctx.userId || !ctx.tenantId) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  if (!(await podeNoModulo(ctx, "contabil_core", "gerir"))) {
    return NextResponse.json({ error: "Corrigir a conta bancária do razão é de quem coordena o Contábil Core." }, { status: 403 });
  }
  const corpo = await corpoJson(req);
  if (!corpo) return NextResponse.json({ error: "Pedido inválido." }, { status: 400 });
  const empresaId = idValido(corpo.empresa);
  if (!empresaId) return semEmpresa();
  try {
    const r = await reapontarContasSinteticas(ctx.tenantId, empresaId);
    if (!r.ok) return NextResponse.json({ error: r.erro }, { status: r.erro === NAO_ENCONTRADA ? 404 : 400 });
    const { relatorio, auditoria } = r.valor;
    if (auditoria) {
      await logAudit({
        tenantId: ctx.tenantId,
        userId: ctx.userId,
        action: ACOES_DO_REAPONTAMENTO[auditoria.acao] ?? auditoria.acao,
        entityType: "CoreEmpresa",
        entityId: empresaId,
        metadata: auditoria.dados as Prisma.InputJsonValue,
      });
    }
    return NextResponse.json({ ok: true, relatorio }, { headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    console.error("[contabil-core] reapontamento da conta sintética", err instanceof Error ? err.name : "erro");
    return NextResponse.json({ error: "Não deu para corrigir a conta do razão. Nada foi alterado. Tente de novo." }, { status: 500 });
  }
}
