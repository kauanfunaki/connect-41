import { NextRequest, NextResponse } from "next/server";
import { sessaoAtivaDoPortal } from "@/app/(portal)/usuario";
import { telaBloqueadaNoPortal } from "@/lib/portal/telasBloqueadas";
import { pdfDoDocumentoNoPortal } from "../../pdfDoDocumento";

export const dynamic = "force-dynamic";

// O PDF de uma nota, baixado pelo cliente na tela de Documentos fiscais
// (11/11/2026). Sob `/portal`, então o proxy já exigiu o cookie do portal;
// aqui, a sessão ativa e a tela liberada, antes de ler qualquer dado — o resto
// do escopo (empresas do cliente e raiz autorizada) é de `pdfDoDocumentoNoPortal`.
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const sessao = await sessaoAtivaDoPortal();
  if (!sessao) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  if (await telaBloqueadaNoPortal(sessao.tenantId, "/portal/documentos")) {
    return NextResponse.json({ error: "Documento não encontrado." }, { status: 404 });
  }
  const { id } = await params;
  return pdfDoDocumentoNoPortal(sessao, id);
}
