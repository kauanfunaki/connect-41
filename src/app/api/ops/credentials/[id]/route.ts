import { responderOps, atualizarChaveOps } from "@/lib/ops/http";
export const runtime = "nodejs";
type Contexto = { params: Promise<{ id: string }> };
export async function POST(request: Request, { params }: Contexto) {
  const { id } = await params;
  return responderOps(() => atualizarChaveOps(request, id));
}
export async function DELETE(request: Request, { params }: Contexto) {
  const { id } = await params;
  return responderOps(() => atualizarChaveOps(request, id, true));
}
