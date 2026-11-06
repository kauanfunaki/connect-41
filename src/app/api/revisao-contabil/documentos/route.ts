import { NextRequest, NextResponse } from "next/server";
import { getAuthContext } from "@/lib/auth/context";
import { podeNoModulo } from "@/lib/auth/modulo";
import { logAudit } from "@/lib/audit";
import { MB_POR_ARQUIVO } from "@/lib/revisao-contabil/fechamento";
import { importarArquivo } from "@/lib/revisao-contabil/servidor";

export const runtime = "nodejs";

// Envio de um documento para a Revisão do fechamento (05/11/2026). Rota, e não
// server action, como nos Arquivos: um arquivo por requisição, por XHR, para o
// navegador mostrar o progresso (src/lib/uploadComProgresso.ts). O motor lê o
// arquivo aqui mesmo; um ZIP vira um documento por arquivo de dentro, e o que o
// motor recusa volta em `avisos` sem derrubar os outros.
export async function POST(req: NextRequest) {
  const ctx = await getAuthContext();
  if (!ctx.userId || !ctx.tenantId) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  if (!(await podeNoModulo(ctx, "contabil_revisao", "agir"))) return NextResponse.json({ error: "Sem acesso à Revisão do fechamento." }, { status: 403 });

  const form = await req.formData().catch(() => null);
  if (!form) return NextResponse.json({ error: `O envio chegou incompleto. O arquivo passa de ${MB_POR_ARQUIVO} MB?` }, { status: 400 });
  const fechamentoId = String(form.get("fechamentoId") ?? "");
  const arquivo = form.get("arquivo");
  if (!/^[0-9a-f-]{36}$/i.test(fechamentoId)) return NextResponse.json({ error: "Fechamento não informado." }, { status: 400 });
  if (!(arquivo instanceof File) || arquivo.size === 0) return NextResponse.json({ error: "Escolha um arquivo." }, { status: 400 });
  if (arquivo.size > MB_POR_ARQUIVO * 1024 * 1024) return NextResponse.json({ error: `O arquivo passa de ${MB_POR_ARQUIVO} MB.` }, { status: 400 });

  try {
    const r = await importarArquivo(ctx.tenantId, ctx.userId, fechamentoId, arquivo.name, new Uint8Array(await arquivo.arrayBuffer()));
    if (!r.ok) return NextResponse.json({ error: r.erro }, { status: 400 });
    const { ids, erros } = r.valor;
    for (const id of ids) {
      await logAudit({ tenantId: ctx.tenantId, userId: ctx.userId, action: "contabil.revisao.documento.enviado", entityType: "RevisaoDocumento", entityId: id, metadata: { nome: arquivo.name } });
    }
    // Nada lido: o arquivo vai para a lista com o erro do motor.
    if (!ids.length) return NextResponse.json({ error: erros.map((e) => `${e.name}: ${e.error}`).join(" ") || "Nenhum documento lido." }, { status: 400 });
    return NextResponse.json({ ok: true, id: ids[0], ids, avisos: erros.map((e) => `${e.name}: ${e.error}`) });
  } catch (err) {
    console.error("[revisao-contabil] envio de documento", err instanceof Error ? err.name : "erro");
    return NextResponse.json({ error: "Não deu para guardar o arquivo. Tente de novo." }, { status: 500 });
  }
}
