import { NextRequest, NextResponse } from "next/server";
import { getPrisma } from "@/lib/prisma";
import { getPortalSession } from "@/lib/auth/portal";
import { getEnabledModuleCodes } from "@/lib/modules";
import { alcanceDoCliente } from "@/app/(portal)/alcance";
import { lerAnexo, respostaDoAnexo } from "@/lib/financeiro/pendencias/armazenamento";

// Download de anexo de pendência pelo cliente. Sob `/portal`, então o proxy já
// exigiu o cookie do portal; aqui se valida a sessão e o **alcance**: o anexo
// só sai se a pendência for de uma empresa do grupo do cliente.
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const sessao = await getPortalSession();
  if (!sessao) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  const modulos = await getEnabledModuleCodes(sessao.tenantId);
  if (!modulos.has("bpo_pendencias")) return NextResponse.json({ error: "Não encontrado." }, { status: 404 });

  const alcance = await alcanceDoCliente(sessao);
  const companyIds = alcance.tipo === "EMPRESAS" ? alcance.companyIds : [];
  const { id } = await params;
  const anexo = await getPrisma().clientRequestAttachment.findFirst({
    where: { id, request: { tenantId: sessao.tenantId, companyId: { in: companyIds } } },
    select: { fileName: true, fileUrl: true, mimeType: true },
  });
  if (!anexo) return NextResponse.json({ error: "Anexo não encontrado." }, { status: 404 });

  const conteudo = await lerAnexo(anexo.fileUrl);
  if (!conteudo) return NextResponse.json({ error: "Arquivo não encontrado no armazenamento." }, { status: 404 });
  return respostaDoAnexo(conteudo, anexo);
}
