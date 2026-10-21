import { obterPainel, responderOps } from "@/lib/ops/http";
export const runtime = "nodejs";
export async function GET(request: Request) { return responderOps(() => obterPainel(request)); }
