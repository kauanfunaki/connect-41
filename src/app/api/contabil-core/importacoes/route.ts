import { NextRequest, NextResponse } from "next/server";
import { getAuthContext } from "@/lib/auth/context";
import { podeNoModulo } from "@/lib/auth/modulo";
import { logAudit } from "@/lib/audit";
import { ehUuid } from "@/lib/contabil-core/entradas";
import { importarExtrato, MB_POR_EXTRATO } from "@/lib/contabil-core/servidor/importacao";

export const runtime = "nodejs";

// Envio de extrato para o Contábil Core (Fase 2, 09/11/2026). Rota, e não server action, para o
// navegador mostrar o progresso (src/lib/uploadComProgresso.ts). Um arquivo por requisição; o tamanho é
// conferido nos bytes lidos, não só no cabeçalho. O arquivo não é guardado: só o SHA-256 vai para o lote.
export async function POST(req: NextRequest) {
  const ctx = await getAuthContext();
  if (!ctx.userId || !ctx.tenantId) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  if (!(await podeNoModulo(ctx, "contabil_core", "agir"))) return NextResponse.json({ error: "Sem acesso ao Contábil Core." }, { status: 403 });

  const form = await req.formData().catch(() => null);
  if (!form) return NextResponse.json({ error: `O envio chegou incompleto. O arquivo passa de ${MB_POR_EXTRATO} MB?` }, { status: 400 });
  const empresaId = String(form.get("empresaId") ?? "");
  const agenciaId = String(form.get("agenciaId") ?? "");
  const confirmarConta = form.get("confirmarConta") === "1";
  const arquivo = form.get("arquivo");
  if (!ehUuid(empresaId)) return NextResponse.json({ error: "Empresa não informada." }, { status: 400 });
  if (!ehUuid(agenciaId)) return NextResponse.json({ error: "Escolha a conta bancária do extrato." }, { status: 400 });
  if (!(arquivo instanceof File) || arquivo.size === 0) return NextResponse.json({ error: "Escolha um arquivo." }, { status: 400 });
  if (arquivo.size > MB_POR_EXTRATO * 1024 * 1024) return NextResponse.json({ error: `O arquivo passa de ${MB_POR_EXTRATO} MB.` }, { status: 400 });

  try {
    const bytes = new Uint8Array(await arquivo.arrayBuffer());
    if (bytes.length > MB_POR_EXTRATO * 1024 * 1024) return NextResponse.json({ error: `O arquivo passa de ${MB_POR_EXTRATO} MB.` }, { status: 400 });
    const r = await importarExtrato(ctx.tenantId, ctx.userId, empresaId.toLowerCase(), agenciaId.toLowerCase(), arquivo.name, bytes, confirmarConta);
    if (!r.ok) return NextResponse.json({ error: r.erro, precisaConfirmar: r.precisaConfirmar ?? false }, { status: r.precisaConfirmar ? 409 : 400 });
    const v = r.valor;
    await logAudit({
      tenantId: ctx.tenantId,
      userId: ctx.userId,
      action: v.identidadeConfirmada ? "contabil.core.extrato.importado_com_confirmacao" : "contabil.core.extrato.importado",
      entityType: "CoreImportacao",
      entityId: v.importacaoId,
      metadata: { nome: arquivo.name, importadas: v.importadas, duplicadas: v.duplicadas, rejeitadas: v.rejeitadas, alerta: v.alertaSaldo },
    });
    return NextResponse.json({ ok: true, ...v });
  } catch (err) {
    console.error("[contabil-core] envio de extrato", err instanceof Error ? err.name : "erro");
    return NextResponse.json({ error: "Não deu para importar o extrato. Tente de novo." }, { status: 500 });
  }
}
