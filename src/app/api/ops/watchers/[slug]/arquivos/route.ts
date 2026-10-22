import { responderOps } from "@/lib/ops/http";
import { autenticarWatcher } from "@/lib/ops/servidor";
import { slugSchema } from "@/lib/ops/regras";
import { lerEnvioDaRede, receberDaPastaDeRede } from "@/lib/drive/pastaDeRedeServidor";
export const runtime = "nodejs";
// O robô da pasta de rede (scripts/pasta-de-rede.mjs) manda um arquivo por
// chamada. Ver src/lib/drive/pastaDeRedeServidor.ts.
export async function POST(request: Request, context: { params: Promise<{ slug: string }> }) {
  return responderOps(async () => {
    const slug = slugSchema.parse((await context.params).slug);
    const w = await autenticarWatcher(request, slug);
    return receberDaPastaDeRede(w, await lerEnvioDaRede(request));
  });
}
