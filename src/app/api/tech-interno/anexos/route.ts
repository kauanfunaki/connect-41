import { NextRequest, NextResponse } from "next/server";
import { getAuthContext } from "@/lib/auth/context";
import { anexarArquivo } from "@/lib/tech-interno/anexos";

export const runtime = "nodejs";

// Envio de um anexo para um item do Controle interno (05/11/2026). Rota, e não
// server action, como nos Arquivos: um arquivo por requisição, por XHR, para
// o navegador mostrar o progresso (src/lib/uploadComProgresso.ts).
export async function POST(req: NextRequest) {
  const ctx = await getAuthContext();
  if (!ctx.userId || !ctx.tenantId) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

  const form = await req.formData().catch(() => null);
  if (!form) return NextResponse.json({ error: "O envio chegou incompleto. O arquivo passa de 10 MB?" }, { status: 400 });
  const itemId = String(form.get("itemId") ?? "");
  const arquivo = form.get("arquivo");
  if (!itemId) return NextResponse.json({ error: "Item não informado." }, { status: 400 });
  if (!(arquivo instanceof File) || arquivo.size === 0) return NextResponse.json({ error: "Escolha um arquivo." }, { status: 400 });

  try {
    const r = await anexarArquivo(ctx, itemId, arquivo);
    if (!r.ok) return NextResponse.json({ error: r.erro }, { status: r.status });
    return NextResponse.json({ ok: true, ...r.valor });
  } catch (err) {
    console.error("[tech-interno] envio de anexo", err instanceof Error ? err.name : "erro");
    return NextResponse.json({ error: "Não deu para guardar o arquivo. Tente de novo." }, { status: 500 });
  }
}
