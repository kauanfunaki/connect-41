import { NextRequest, NextResponse } from "next/server";
import { getAuthContext } from "@/lib/auth/context";
import { isModuleEnabled } from "@/lib/modules";
import { logAudit } from "@/lib/audit";
import { MODULO_ARQUIVOS, podeMexerNoCaminho } from "@/lib/drive/regras";
import { guardarArquivo, pastaParaAEquipe } from "@/lib/drive/servidor";

// Envio de um arquivo para uma pasta dos Arquivos pela equipe (09/10/2026).
//
// Rota, e não server action, pelo mesmo motivo do /api/documents: o navegador
// manda por XMLHttpRequest para mostrar o progresso de cada arquivo
// (src/lib/uploadComProgresso.ts). Um arquivo por requisição — o proxy corta o
// corpo em 10 MB, e um lote inteiro numa requisição só estouraria fácil.
export async function POST(req: NextRequest) {
  const ctx = await getAuthContext();
  if (!ctx.userId || !ctx.tenantId) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  if (!(await isModuleEnabled(ctx.tenantId, MODULO_ARQUIVOS))) {
    return NextResponse.json({ error: "Os Arquivos estão desligados neste escritório." }, { status: 404 });
  }

  const form = await req.formData().catch(() => null);
  if (!form) return NextResponse.json({ error: "O envio chegou incompleto. O arquivo passa de 10 MB?" }, { status: 400 });
  const pastaId = String(form.get("pastaId") ?? "");
  const arquivo = form.get("arquivo");
  if (!(arquivo instanceof File) || arquivo.size === 0) return NextResponse.json({ error: "Escolha um arquivo." }, { status: 400 });

  const alvo = await pastaParaAEquipe(ctx, pastaId);
  if (!alvo) return NextResponse.json({ error: "Pasta não encontrada." }, { status: 404 });
  if (!podeMexerNoCaminho(ctx, alvo.caminho)) {
    return NextResponse.json({ error: "Você não pode enviar arquivos para esta pasta." }, { status: 403 });
  }

  try {
    const r = await guardarArquivo({ tenantId: ctx.tenantId, folderId: alvo.pasta.id, arquivo, uploadedByUserId: ctx.userId });
    if (!r.ok) return NextResponse.json({ error: r.erro }, { status: 400 });
    await logAudit({
      tenantId: ctx.tenantId,
      userId: ctx.userId,
      action: "drive.file_upload",
      entityType: "DriveFile",
      entityId: r.arquivoId,
      metadata: { pastaId: alvo.pasta.id, nome: r.nome, companyId: alvo.pasta.companyId },
    });
    return NextResponse.json({ ok: true, id: r.arquivoId, nome: r.nome });
  } catch (err) {
    console.error("[drive] envio da equipe", err);
    return NextResponse.json({ error: "Não deu para guardar o arquivo. Tente de novo." }, { status: 500 });
  }
}
