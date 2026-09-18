import { NextRequest, NextResponse } from "next/server";
import { getPrisma } from "@/lib/prisma";
import { getAuthContext, canViewSector } from "@/lib/auth/context";
import { isModuleEnabled, setorDoModulo } from "@/lib/modules";
import { getModuleDef } from "@/lib/module-catalog";
import { respostaDoAnexo } from "@/lib/financeiro/pendencias/armazenamento";
import { anexosDaConversa } from "@/lib/financeiro/comunicacao/armazenamento";

const MODULE = "bpo_comunicacao";

// Download de anexo da conversa pela equipe — mesmo desenho da rota das
// pendências: o escopo é o da tela (setor do módulo neste tenant, com o módulo
// ligado), e o anexo é procurado com o `tenantId` no `where`, então id de outro
// tenant responde 404 como id inexistente.
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await getAuthContext();
  if (!ctx.userId || !ctx.tenantId) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  const setor = (await setorDoModulo(ctx.tenantId, MODULE)) ?? getModuleDef(MODULE)!.sectorCode;
  if (!canViewSector(ctx, setor) || !(await isModuleEnabled(ctx.tenantId, MODULE))) {
    return NextResponse.json({ error: "Sem permissão." }, { status: 403 });
  }

  const { id } = await params;
  const anexo = await getPrisma().companyMessageAttachment.findFirst({
    where: { id, tenantId: ctx.tenantId },
    select: { fileName: true, fileUrl: true, mimeType: true },
  });
  if (!anexo) return NextResponse.json({ error: "Anexo não encontrado." }, { status: 404 });

  const conteudo = await anexosDaConversa.lerAnexo(anexo.fileUrl);
  if (!conteudo) return NextResponse.json({ error: "Arquivo não encontrado no armazenamento." }, { status: 404 });
  return respostaDoAnexo(conteudo, anexo);
}
