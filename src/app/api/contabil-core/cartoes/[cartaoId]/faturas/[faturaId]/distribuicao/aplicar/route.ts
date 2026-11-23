import { escritaJson } from "@/lib/contabil-core/cartoes/rotaDosCartoes";
import { aplicarDistribuicao } from "@/lib/contabil-core/servidor/faturas";

export const runtime = "nodejs";

// Aplicar a distribuição (Bloco C, Fase C3, 23/11/2026): porte do `POST .../distribuicao/aplicar`. A
// distribuição vira a composição da transação que pagou a fatura (um par por componente), numa transação
// só; o pagamento pendente é classificado antes. Pede "agir" (no original, `cartoes.write` e `neo.execute`).

type Params = { params: Promise<{ cartaoId: string; faturaId: string }> };

export function POST(req: Request, { params }: Params) {
  return escritaJson(req, params, "distribuicao", "aplicar a distribuição", (ctx, empresaId, ids, corpo) =>
    aplicarDistribuicao({ tenantId: ctx.tenantId, empresaId, cartaoId: ids.cartaoId, faturaId: ids.faturaId, userId: ctx.userId }, corpo),
  );
}
