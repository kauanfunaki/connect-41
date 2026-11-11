import { NextRequest, NextResponse } from "next/server";
import { sessaoAtivaDoPortal } from "@/app/(portal)/usuario";
import { telaBloqueadaNoPortal } from "@/lib/portal/telasBloqueadas";
import { anexoDaAprovacaoNoPortal } from "@/lib/financeiro/aprovacao/anexoNoPortal";

export const dynamic = "force-dynamic";

// O boleto ou a nota da conta, baixado pelo cliente na tela de Aprovações
// (P03, 11/11/2026). Sob `/portal`, então o proxy já exigiu o cookie do
// portal; aqui, a sessão ativa e a tela liberada, antes de ler qualquer dado —
// o resto do escopo (módulo e empresas do cliente) é de `anexoDaAprovacaoNoPortal`.
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const sessao = await sessaoAtivaDoPortal();
  if (!sessao) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  if (await telaBloqueadaNoPortal(sessao.tenantId, "/portal/aprovacoes")) return NextResponse.json({ error: "Não encontrado." }, { status: 404 });
  const { id } = await params;
  return anexoDaAprovacaoNoPortal(sessao, id);
}
