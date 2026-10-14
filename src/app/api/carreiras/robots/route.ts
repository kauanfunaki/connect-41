import { NextRequest } from "next/server";
import { configDeCarreiras, ehHostDeCarreiras } from "@/lib/carreiras/enderecoDeCarreiras";
import { robotsDoPortal } from "@/lib/carreiras/indexacao";

// O `/robots.txt` do 41 Carreiras: o proxy reescreve para cá só no endereço do
// portal. Em qualquer outro host, 404 — o Connect não ganha robots por tabela.
export const dynamic = "force-dynamic";

export function GET(req: NextRequest) {
  const config = configDeCarreiras();
  if (!config?.tenantSlug || !ehHostDeCarreiras(req.headers.get("host"), config)) {
    return new Response("Não encontrado", { status: 404 });
  }
  return new Response(robotsDoPortal(config.principal), {
    headers: { "content-type": "text/plain; charset=utf-8" },
  });
}
