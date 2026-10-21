import { eventoWatcher, responderOps } from "@/lib/ops/http";
export const runtime = "nodejs";
export async function POST(request: Request) { return responderOps(() => eventoWatcher(request)); }
