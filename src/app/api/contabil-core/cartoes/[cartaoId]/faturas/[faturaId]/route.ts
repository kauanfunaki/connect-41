import { escritaJson, leitura } from "@/lib/contabil-core/cartoes/rotaDosCartoes";
import { atualizarFatura, obterFatura } from "@/lib/contabil-core/servidor/cartoes";

export const runtime = "nodejs";

// Uma fatura (Bloco C, Fase C3, 23/11/2026): o cabeçalho (o original o tirava da lista) e o
// `PATCH /empresas/{id}/cartoes/{cartao_id}/faturas/{fatura_id}` (status, vencimento e observação; a fatura
// paga não reabre, e só o pagamento a deixa paga).

type Params = { params: Promise<{ cartaoId: string; faturaId: string }> };

export function GET(req: Request, { params }: Params) {
  return leitura(req, params, "fatura", "fatura", (ctx, empresaId, ids) => obterFatura(ctx.tenantId, empresaId, ids.cartaoId, ids.faturaId));
}

export function PATCH(req: Request, { params }: Params) {
  return escritaJson(req, params, "fatura", "alterar a fatura", (ctx, empresaId, ids, corpo) => atualizarFatura(ctx.tenantId, empresaId, ids.cartaoId, ids.faturaId, corpo));
}
