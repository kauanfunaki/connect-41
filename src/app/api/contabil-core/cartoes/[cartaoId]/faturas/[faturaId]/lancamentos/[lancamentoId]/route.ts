import { escritaJson } from "@/lib/contabil-core/cartoes/rotaDosCartoes";
import { removerLancamento } from "@/lib/contabil-core/servidor/cartoes";

export const runtime = "nodejs";

// Um gasto (Bloco C, Fase C3, 23/11/2026): porte do
// `DELETE /empresas/{id}/cartoes/{cartao_id}/faturas/{fatura_id}/lancamentos/{lancamento_id}` (exclusão
// lógica, só na fatura não paga). Devolve `{ ok: true, lancamento: null }`; o original, 204.

type Params = { params: Promise<{ cartaoId: string; faturaId: string; lancamentoId: string }> };

export function DELETE(req: Request, { params }: Params) {
  return escritaJson(req, params, "lancamento", "remover o lançamento", (ctx, empresaId, ids) => removerLancamento(ctx.tenantId, empresaId, ids.cartaoId, ids.faturaId, ids.lancamentoId));
}
