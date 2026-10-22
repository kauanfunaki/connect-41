import { responderOps, tokenCompartilhadoOps } from "@/lib/ops/http";

export const runtime = "nodejs";

export async function POST(request: Request) {
  return responderOps(() => tokenCompartilhadoOps(request));
}

export async function DELETE(request: Request) {
  return responderOps(() => tokenCompartilhadoOps(request, true));
}
