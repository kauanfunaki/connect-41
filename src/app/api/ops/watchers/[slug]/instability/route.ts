import { sinalizarInstabilidade, responderOps } from "@/lib/ops/http";
export const runtime = "nodejs";
type Context = { params: Promise<{ slug: string }> };
export async function POST(request: Request, context: Context) { return responderOps(async () => sinalizarInstabilidade(request, (await context.params).slug)); }
export async function DELETE(request: Request, context: Context) { return responderOps(async () => sinalizarInstabilidade(request, (await context.params).slug, true)); }
