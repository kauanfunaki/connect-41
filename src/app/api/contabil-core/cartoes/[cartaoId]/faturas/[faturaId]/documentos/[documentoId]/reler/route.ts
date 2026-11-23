import { after } from "next/server";
import { escritaJson } from "@/lib/contabil-core/cartoes/rotaDosCartoes";
import { processarDocumento, relerDocumento } from "@/lib/contabil-core/servidor/faturas";

export const runtime = "nodejs";
export const maxDuration = 320;

// Ler de novo um documento da fatura (Bloco C, Fase C3, 23/11/2026): porte do
// `POST .../documentos/{documento_id}/reler` (202). Só a leitura que falhou, ou que ficou presa além do prazo,
// volta para "processando"; a leitura roda depois da resposta.

type Params = { params: Promise<{ cartaoId: string; faturaId: string; documentoId: string }> };

export function POST(req: Request, { params }: Params) {
  return escritaJson(
    req,
    params,
    "documento",
    "reler o documento",
    async (ctx, empresaId, ids) => {
      const r = await relerDocumento({ tenantId: ctx.tenantId, empresaId, cartaoId: ids.cartaoId, faturaId: ids.faturaId, userId: ctx.userId }, ids.documentoId);
      if (r.ok) after(() => processarDocumento(ids.documentoId, ctx.userId));
      return r;
    },
    202,
  );
}
