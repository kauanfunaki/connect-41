import { heartbeatWatcher, responderOps } from "@/lib/ops/http";
export const runtime = "nodejs";
export async function POST(request: Request, context: { params: Promise<{ slug: string }> }) {
  return responderOps(async () => heartbeatWatcher(request, (await context.params).slug));
}
