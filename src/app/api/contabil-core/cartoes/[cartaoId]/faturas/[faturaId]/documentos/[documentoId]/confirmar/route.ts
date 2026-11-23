import { escritaJson } from "@/lib/contabil-core/cartoes/rotaDosCartoes";
import { confirmarDocumento } from "@/lib/contabil-core/servidor/faturas";

export const runtime = "nodejs";

// Confirmar a revisão de um documento da fatura (Bloco C, Fase C3, 23/11/2026): porte do
// `POST .../documentos/{documento_id}/confirmar`. Como fonte principal, os itens revisados (que fecham o
// total declarado) substituem os gastos da fatura; como complementar, o documento só fica guardado.

type Params = { params: Promise<{ cartaoId: string; faturaId: string; documentoId: string }> };

export function POST(req: Request, { params }: Params) {
  return escritaJson(req, params, "distribuicao", "confirmar o documento", (ctx, empresaId, ids, corpo) =>
    confirmarDocumento({ tenantId: ctx.tenantId, empresaId, cartaoId: ids.cartaoId, faturaId: ids.faturaId, userId: ctx.userId }, ids.documentoId, corpo),
  );
}
