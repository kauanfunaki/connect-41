import { responderOps } from "@/lib/ops/http";
import { obterCatalogo } from "@/lib/ops/catalogo";

export const runtime = "nodejs";
export async function GET() { return responderOps(obterCatalogo); }
