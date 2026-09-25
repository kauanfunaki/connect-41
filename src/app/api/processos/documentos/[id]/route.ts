import { NextRequest, NextResponse } from "next/server";
import { getPrisma } from "@/lib/prisma";
import { getAuthContext, canActOnSector } from "@/lib/auth/context";
import { isModuleEnabled, setorDoModulo } from "@/lib/modules";
import { respostaDoAnexo } from "@/lib/financeiro/pendencias/armazenamento";
import { arquivosDoProcesso } from "@/lib/societario/conversa";

const MODULE = "societario_processos";

// Download de documento de processo pela equipe. O escopo é o da tela do
// processo: quem atua no setor do módulo neste tenant, com o módulo ligado. O
// documento é procurado com o `tenantId` no `where` — id de outro tenant
// responde 404, como id inexistente.
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await getAuthContext();
  if (!ctx.userId || !ctx.tenantId) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  if (!canActOnSector(ctx, (await setorDoModulo(ctx.tenantId, MODULE)) ?? "societario") || !(await isModuleEnabled(ctx.tenantId, MODULE))) {
    return NextResponse.json({ error: "Sem permissão." }, { status: 403 });
  }

  const { id } = await params;
  const documento = await getPrisma().processDocument.findFirst({
    where: { id, tenantId: ctx.tenantId },
    select: { fileName: true, fileUrl: true, mimeType: true },
  });
  if (!documento) return NextResponse.json({ error: "Documento não encontrado." }, { status: 404 });

  const conteudo = await arquivosDoProcesso.lerAnexo(documento.fileUrl);
  if (!conteudo) return NextResponse.json({ error: "Arquivo não encontrado no armazenamento." }, { status: 404 });
  return respostaDoAnexo(conteudo, documento);
}
