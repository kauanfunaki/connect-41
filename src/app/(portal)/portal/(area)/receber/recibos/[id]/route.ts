import { NextRequest, NextResponse } from "next/server";
import { sessaoAtivaDoPortal } from "@/app/(portal)/usuario";
import { telaBloqueadaNoPortal } from "@/lib/portal/telasBloqueadas";
import { reciboDaBaixaNoPortal } from "@/app/(portal)/reciboDaBaixa";

export const dynamic = "force-dynamic";

// O recibo de uma baixa, baixado pelo cliente na tela de Contas a receber
// (22/10/2026). Sob `/portal`, então o proxy já exigiu o cookie do portal;
// aqui, a sessão ativa e a tela liberada, antes de ler qualquer dado — o resto
// do escopo (módulo e empresas do cliente) é de `reciboDaBaixaNoPortal`.
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const sessao = await sessaoAtivaDoPortal();
  if (!sessao) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  if (await telaBloqueadaNoPortal(sessao.tenantId, "/portal/receber")) return NextResponse.json({ error: "Não encontrado." }, { status: 404 });
  const { id } = await params;
  return reciboDaBaixaNoPortal(sessao, "RECEBER", id);
}
