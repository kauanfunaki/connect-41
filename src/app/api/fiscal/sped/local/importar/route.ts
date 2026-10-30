import { NextResponse } from "next/server";
import { getAuthContext } from "@/lib/auth/context";
import { podeNoModulo } from "@/lib/auth/modulo";
import { autorizar, ErroFiscal } from "@/lib/fiscal/sped/local/servidor";
import { enfileirarArquivo } from "@/lib/fiscal/sped/local/fila";

export async function POST(req: Request) {
  try {
    const ctx = await getAuthContext();
    if (!await podeNoModulo(ctx, "fiscal_acervo", "agir")) throw new ErroFiscal("Sem permissão para importar.", 404);
    const form = await req.formData();
    const aba = form.get("aba");
    const empresa = await autorizar(ctx, String(form.get("empresa") ?? ""), aba === "apuracao" || aba === "fechamento" ? aba : "classificacao");
    const arquivo = form.get("arquivo");
    if (!(arquivo instanceof File)) throw new ErroFiscal("Escolha um arquivo.");
    return NextResponse.json({ ok: true, ids: await enfileirarArquivo(ctx, empresa, arquivo) });
  } catch (e) { return NextResponse.json({ error: e instanceof Error ? e.message : "Falha no envio." }, { status: e instanceof ErroFiscal ? e.status : 422 }); }
}
