import { responderOps } from "@/lib/ops/http";
import { editarApp } from "@/lib/ops/catalogo";
export const runtime = "nodejs";
export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  return responderOps(async () => editarApp(request, (await context.params).id), "Já existe um app com esse nome.");
}
