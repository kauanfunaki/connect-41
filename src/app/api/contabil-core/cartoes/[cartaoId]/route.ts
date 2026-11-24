import { escritaJson } from "@/lib/contabil-core/cartoes/rotaDosCartoes";
import { atualizarCartao, removerCartao } from "@/lib/contabil-core/servidor/cartoes";

export const runtime = "nodejs";

// Um cartão (Bloco C, Fase C3, 23/11/2026): porte do `PATCH /empresas/{id}/cartoes/{cartao_id}` (só o que
// veio muda, validado como o `CartaoUpdate`) e do `DELETE` (exclusão lógica, recusada com fatura aberta ou
// fechada e com distribuição aplicada). A exclusão devolve `{ ok: true, cartao: null }`; o original, 204.

type Params = { params: Promise<{ cartaoId: string }> };

export function PATCH(req: Request, { params }: Params) {
  return escritaJson(req, params, "cartao", "alterar o cartão", (ctx, empresaId, ids, corpo) => atualizarCartao(ctx.tenantId, empresaId, ids.cartaoId, corpo));
}

export function DELETE(req: Request, { params }: Params) {
  return escritaJson(req, params, "cartao", "remover o cartão", (ctx, empresaId, ids) => removerCartao(ctx.tenantId, empresaId, ids.cartaoId));
}
