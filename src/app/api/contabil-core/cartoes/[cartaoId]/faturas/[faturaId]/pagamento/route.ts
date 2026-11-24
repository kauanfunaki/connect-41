import { escritaJson, leitura } from "@/lib/contabil-core/cartoes/rotaDosCartoes";
import { idValido } from "@/lib/contabil-core/conciliacao/rotaDaRevisao";
import { associarPagamento, desassociarPagamento, pagamentosPossiveis } from "@/lib/contabil-core/servidor/cartoes";
import { invalida } from "@/lib/contabil-core/cartoes/servico";

export const runtime = "nodejs";

// O pagamento da fatura (Bloco C, Fase C3, 23/11/2026): porte do
// `POST /empresas/{id}/cartoes/{cartao_id}/faturas/{fatura_id}/associar-transacao` (a transação de débito
// com o valor exato do total quita a fatura e a deixa paga) e do `DELETE` (tira o pagamento e volta a fatura
// para "fechada"). O `GET` lista os pagamentos possíveis (a tela do original consultava o extrato).

type Params = { params: Promise<{ cartaoId: string; faturaId: string }> };

export function GET(req: Request, { params }: Params) {
  return leitura(req, params, "pagamentos", "pagamentos possíveis", (ctx, empresaId, ids, q) => pagamentosPossiveis(ctx.tenantId, empresaId, ids.cartaoId, ids.faturaId, q.get("busca")));
}

export function POST(req: Request, { params }: Params) {
  return escritaJson(req, params, "fatura", "associar o pagamento", async (ctx, empresaId, ids, corpo) => {
    const transacaoId = idValido(corpo.transacaoId);
    if (!transacaoId) return invalida("Informe a transação do pagamento.");
    return associarPagamento(ctx.tenantId, empresaId, ids.cartaoId, ids.faturaId, transacaoId);
  });
}

export function DELETE(req: Request, { params }: Params) {
  return escritaJson(req, params, "fatura", "desassociar o pagamento", (ctx, empresaId, ids) => desassociarPagamento(ctx.tenantId, empresaId, ids.cartaoId, ids.faturaId));
}
