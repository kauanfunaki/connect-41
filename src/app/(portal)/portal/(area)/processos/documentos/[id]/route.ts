import { NextRequest, NextResponse } from "next/server";
import { getPrisma } from "@/lib/prisma";
import { getPortalSession } from "@/lib/auth/portal";
import { getEnabledModuleCodes } from "@/lib/modules";
import { alcanceDoCliente } from "@/app/(portal)/alcance";
import { respostaDoAnexo } from "@/lib/financeiro/pendencias/armazenamento";
import { arquivosDoProcesso } from "@/lib/societario/conversa";

// Download de documento de processo pelo cliente. Sob `/portal`, então o proxy
// já exigiu o cookie do portal; aqui se valida a sessão e o **alcance**: o
// arquivo só sai se o processo for de uma empresa do grupo dele — inclusive os
// que a própria equipe anexou.
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const sessao = await getPortalSession();
  if (!sessao) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  const modulos = await getEnabledModuleCodes(sessao.tenantId);
  if (!modulos.has("societario_processos")) return NextResponse.json({ error: "Não encontrado." }, { status: 404 });

  const alcance = await alcanceDoCliente(sessao);
  const companyIds = alcance.tipo === "EMPRESAS" ? alcance.companyIds : [];
  const { id } = await params;
  const documento = await getPrisma().processDocument.findFirst({
    where: { id, tenantId: sessao.tenantId, process: { companyId: { in: companyIds } } },
    select: { fileName: true, fileUrl: true, mimeType: true },
  });
  if (!documento) return NextResponse.json({ error: "Documento não encontrado." }, { status: 404 });

  const conteudo = await arquivosDoProcesso.lerAnexo(documento.fileUrl);
  if (!conteudo) return NextResponse.json({ error: "Arquivo não encontrado no armazenamento." }, { status: 404 });
  return respostaDoAnexo(conteudo, documento);
}
