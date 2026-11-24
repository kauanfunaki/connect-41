import { escritaJson } from "@/lib/contabil-core/cartoes/rotaDosCartoes";
import { desfazerDistribuicao } from "@/lib/contabil-core/servidor/faturas";

export const runtime = "nodejs";

// Desfazer a aplicação da distribuição (Bloco C, Fase C3, 23/11/2026): porte do
// `POST .../distribuicao/desfazer`. Devolve a classificação de antes (ou cancela o lançamento, se não havia);
// se ela mudou no NEO depois, só com "preservar a classificação atual", que encerra o controle sem mexer.

type Params = { params: Promise<{ cartaoId: string; faturaId: string }> };

export function POST(req: Request, { params }: Params) {
  return escritaJson(req, params, "distribuicao", "desfazer a distribuição", (ctx, empresaId, ids, corpo) =>
    desfazerDistribuicao({ tenantId: ctx.tenantId, empresaId, cartaoId: ids.cartaoId, faturaId: ids.faturaId, userId: ctx.userId }, corpo),
  );
}
