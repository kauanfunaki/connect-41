import { NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { contexto } from "@/lib/atendimento/contexto";
import { enviarArquivo } from "@/lib/atendimento/comandosDeMidia";

export const dynamic = "force-dynamic";

/**
 * Envia um arquivo na conversa do Atendimento (11/11/2026). Rota, e não server
 * action, para o arquivo de até 16 MB (o limite da Meta) não esbarrar no corpo
 * das actions. Campos: `cicloId`, `legenda`, `arquivo`.
 */
export async function POST(req: NextRequest) {
  try {
    const c = await contexto();
    // Mesma conferência de origem da rota dos Chamados: o envio sai da própria tela.
    const origin = req.headers.get("origin");
    if (origin && origin !== new URL(req.url).origin && new URL(origin).host !== req.headers.get("x-forwarded-host")) {
      return NextResponse.json({ ok: false, erro: "Origem inválida." }, { status: 403 });
    }
    const form = await req.formData();
    const cicloId = String(form.get("cicloId") ?? "");
    const legenda = String(form.get("legenda") ?? "");
    const arquivo = form.get("arquivo");
    if (!cicloId || !(arquivo instanceof File) || arquivo.size === 0) {
      return NextResponse.json({ ok: false, erro: "Escolha um arquivo." }, { status: 400 });
    }
    await enviarArquivo(c, cicloId, arquivo, legenda);
    revalidatePath("/atendimento", "layout");
    return NextResponse.json({ ok: true });
  } catch (err) {
    revalidatePath("/atendimento", "layout");
    return NextResponse.json({ ok: false, erro: err instanceof Error ? err.message : "Não deu certo. Tente de novo." }, { status: 400 });
  }
}
