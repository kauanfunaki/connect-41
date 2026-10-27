import { responderOps, novaChaveOps } from "@/lib/ops/http";
export const runtime = "nodejs";
export async function POST(request: Request) { return responderOps(() => novaChaveOps(request)); }
