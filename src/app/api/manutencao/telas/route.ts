import { headers } from "next/headers";
import { lerTelasEmManutencao } from "@/lib/manutencao/leitura";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// As telas em manutenção do escritório de quem pergunta (13/11/2026). Quem
// pergunta é o proxy (src/lib/manutencao/noProxy.ts), com a sessão da pessoa
// que está abrindo a tela: o escritório vem do cabeçalho que o próprio proxy
// põe, já conferido contra o token — o de quem visita outro escritório, quando
// é o caso. Só o código e o id de cada uma (o id é o que o "Abrir para testar"
// guarda): o motivo e a previsão a página do aviso lê no banco.
export async function GET() {
  const tenantId = (await headers()).get("x-tenant-id") ?? "";
  if (!tenantId) return Response.json({ error: "Não autenticado." }, { status: 401 });
  const { telas } = await lerTelasEmManutencao(tenantId);
  return Response.json({ telas: telas.map((t) => ({ codigo: t.moduleCode, id: t.id })) }, { headers: { "cache-control": "no-store" } });
}
