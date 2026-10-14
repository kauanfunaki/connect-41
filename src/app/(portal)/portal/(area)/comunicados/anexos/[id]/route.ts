import { NextRequest, NextResponse } from "next/server";
import { sessaoAtivaDoPortal } from "@/app/(portal)/usuario";
import { alcanceDoCliente } from "@/app/(portal)/alcance";
import { anexoDoComunicadoDoCliente } from "@/lib/comunicados/consultas";
import { telaBloqueadaNoPortal } from "@/lib/portal/telasBloqueadas";
import { getEnabledModuleCodes } from "@/lib/modules";
import { respostaDoAnexo } from "@/lib/financeiro/pendencias/armazenamento";
import { anexosDoComunicado } from "@/lib/comunicados/avisos";

// Anexo de comunicado pelo cliente: só se o comunicado foi para alguma das
// empresas do acesso dele (era o cliente, até 14/10/2026).
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const sessao = await sessaoAtivaDoPortal();
  if (!sessao) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  if (!(await getEnabledModuleCodes(sessao.tenantId)).has("portal_solicitacoes")) return NextResponse.json({ error: "Não encontrado." }, { status: 404 });
  if (await telaBloqueadaNoPortal(sessao.tenantId, "/portal/comunicados")) return NextResponse.json({ error: "Não encontrado." }, { status: 404 });

  const { id } = await params;
  const alcance = await alcanceDoCliente(sessao);
  const anexo = await anexoDoComunicadoDoCliente(sessao.tenantId, alcance.tipo === "EMPRESAS" ? alcance.companyIds : [], id);
  if (!anexo) return NextResponse.json({ error: "Anexo não encontrado." }, { status: 404 });
  const conteudo = await anexosDoComunicado.lerAnexo(anexo.fileUrl);
  if (!conteudo) return NextResponse.json({ error: "Arquivo não encontrado no armazenamento." }, { status: 404 });
  return respostaDoAnexo(conteudo, anexo);
}
