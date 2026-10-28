import { fecharAviso, responderOps } from "@/lib/ops/http";
export const runtime = "nodejs";
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  return responderOps(async () => fecharAviso(request, (await context.params).id));
}
