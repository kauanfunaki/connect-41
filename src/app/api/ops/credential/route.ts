import { listarChavesOps, responderOps, tokenCompartilhadoOps } from "@/lib/ops/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  return responderOps(listarChavesOps);
}

export async function POST(request: Request) {
  return responderOps(() => tokenCompartilhadoOps(request));
}

export async function DELETE(request: Request) {
  return responderOps(() => tokenCompartilhadoOps(request, true));
}
