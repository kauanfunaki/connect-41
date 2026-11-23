import { escritaJson, leitura } from "@/lib/contabil-core/cartoes/rotaDosCartoes";
import { obterDistribuicao, salvarDistribuicao } from "@/lib/contabil-core/servidor/faturas";

export const runtime = "nodejs";

// A distribuição da fatura (Bloco C, Fase C3, 23/11/2026): porte do
// `GET .../faturas/{fatura_id}/distribuicao` (os gastos, os componentes de cada um, o hash da classificação
// do pagamento, a aplicação e os documentos) e do `PUT` (salvar os componentes, com a versão vista).

type Params = { params: Promise<{ cartaoId: string; faturaId: string }> };

export function GET(req: Request, { params }: Params) {
  return leitura(req, params, "distribuicao", "distribuição", (ctx, empresaId, ids) =>
    obterDistribuicao({ tenantId: ctx.tenantId, empresaId, cartaoId: ids.cartaoId, faturaId: ids.faturaId, userId: ctx.userId }),
  );
}

export function PUT(req: Request, { params }: Params) {
  return escritaJson(req, params, "distribuicao", "salvar a distribuição", (ctx, empresaId, ids, corpo) =>
    salvarDistribuicao({ tenantId: ctx.tenantId, empresaId, cartaoId: ids.cartaoId, faturaId: ids.faturaId, userId: ctx.userId }, corpo),
  );
}
