import { responderOps } from "@/lib/ops/http";
import { criarSite } from "@/lib/ops/catalogo";

export const runtime = "nodejs";
export async function POST(request: Request) { return responderOps(() => criarSite(request), "Já existe um site com esse nome."); }
