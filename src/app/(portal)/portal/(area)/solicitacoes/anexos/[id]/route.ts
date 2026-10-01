import { NextRequest, NextResponse } from "next/server";
import { getPrisma } from "@/lib/prisma";
import { getPortalSession } from "@/lib/auth/portal";
import { getEnabledModuleCodes } from "@/lib/modules";
import { alcanceDoCliente } from "@/app/(portal)/alcance";
import { respostaDoAnexo } from "@/lib/financeiro/pendencias/armazenamento";
import { anexosDaSolicitacao } from "@/lib/solicitacoes/armazenamento";

// Download de anexo de solicitação pelo cliente. Como na pendência, o anexo só
// sai se a solicitação for de uma empresa do grupo dele — e, aqui, **nunca** se
// estiver numa nota interna da equipe: o id do anexo não aparece na tela do
// cliente, mas um id adivinhado não pode abrir o que a 41 escreveu para si.
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const sessao = await getPortalSession();
  if (!sessao) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  const modulos = await getEnabledModuleCodes(sessao.tenantId);
  if (!modulos.has("portal_solicitacoes")) return NextResponse.json({ error: "Não encontrado." }, { status: 404 });

  const alcance = await alcanceDoCliente(sessao);
  const companyIds = alcance.tipo === "EMPRESAS" ? alcance.companyIds : [];
  const { id } = await params;
  const anexo = await getPrisma().serviceRequestAttachment.findFirst({
    where: {
      id,
      request: { tenantId: sessao.tenantId, companyId: { in: companyIds } },
      OR: [{ messageId: null }, { message: { internal: false } }],
    },
    select: { fileName: true, fileUrl: true, mimeType: true },
  });
  if (!anexo) return NextResponse.json({ error: "Anexo não encontrado." }, { status: 404 });

  const conteudo = await anexosDaSolicitacao.lerAnexo(anexo.fileUrl);
  if (!conteudo) return NextResponse.json({ error: "Arquivo não encontrado no armazenamento." }, { status: 404 });
  return respostaDoAnexo(conteudo, anexo);
}
