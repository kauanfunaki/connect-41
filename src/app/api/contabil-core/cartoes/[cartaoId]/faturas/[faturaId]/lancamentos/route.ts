import { escritaJson, leitura } from "@/lib/contabil-core/cartoes/rotaDosCartoes";
import { adicionarLancamento, listarLancamentos } from "@/lib/contabil-core/servidor/cartoes";

export const runtime = "nodejs";

// Os gastos de uma fatura (Bloco C, Fase C3, 23/11/2026): porte do
// `GET /empresas/{id}/cartoes/{cartao_id}/faturas/{fatura_id}/lancamentos` (pela data da compra, com a soma)
// e do `POST` (o gasto à mão, validado como o `LancamentoCreate`, só na fatura não paga).

type Params = { params: Promise<{ cartaoId: string; faturaId: string }> };

export function GET(req: Request, { params }: Params) {
  return leitura(req, params, "lancamentos", "lista de lançamentos", (ctx, empresaId, ids) => listarLancamentos(ctx.tenantId, empresaId, ids.cartaoId, ids.faturaId));
}

export function POST(req: Request, { params }: Params) {
  return escritaJson(req, params, "lancamento", "adicionar o lançamento", (ctx, empresaId, ids, corpo) => adicionarLancamento(ctx.tenantId, empresaId, ids.cartaoId, ids.faturaId, corpo), 201);
}
