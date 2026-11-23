import { escritaJson, leitura } from "@/lib/contabil-core/cartoes/rotaDosCartoes";
import { criarFatura, listarFaturas } from "@/lib/contabil-core/servidor/cartoes";

export const runtime = "nodejs";

// As faturas de um cartão (Bloco C, Fase C3, 23/11/2026): porte do
// `GET /empresas/{id}/cartoes/{cartao_id}/faturas` (da competência mais recente para a mais antiga, com o
// total derivado dos lançamentos) e do `POST` (uma fatura por competência, nasce aberta e zerada).

type Params = { params: Promise<{ cartaoId: string }> };

export function GET(req: Request, { params }: Params) {
  return leitura(req, params, "faturas", "lista de faturas", (ctx, empresaId, ids) => listarFaturas(ctx.tenantId, empresaId, ids.cartaoId));
}

export function POST(req: Request, { params }: Params) {
  return escritaJson(req, params, "fatura", "criar a fatura", (ctx, empresaId, ids, corpo) => criarFatura(ctx.tenantId, empresaId, ids.cartaoId, corpo), 201);
}
