import { editarWatcher, responderOps } from "@/lib/ops/http";
export const runtime = "nodejs";
export async function PATCH(request: Request, context: { params: Promise<{ slug: string }> }) {
  return responderOps(async () => editarWatcher(request, (await context.params).slug));
}
