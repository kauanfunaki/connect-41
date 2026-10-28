import { responderOps } from "@/lib/ops/http";
import { editarSite } from "@/lib/ops/catalogo";
export const runtime = "nodejs";
export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  return responderOps(async () => editarSite(request, (await context.params).id), "Já existe um site com esse nome.");
}
