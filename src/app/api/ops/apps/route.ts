import { responderOps } from "@/lib/ops/http";
import { criarApp } from "@/lib/ops/catalogo";

export const runtime = "nodejs";
export async function POST(request: Request) { return responderOps(() => criarApp(request), "Já existe um app com esse nome."); }
