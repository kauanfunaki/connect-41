// O anexo da conta a pagar baixado pelo cliente na tela de Aprovações (P03,
// 11/11/2026): o boleto ou a nota que a equipe guardou na conta, para o
// cliente ver o que está aprovando antes de dizer "pode pagar".
//
// A rota da equipe (`/api/financeiro/anexos/[id]`) pede o login interno; esta
// é a mesma leitura do disco com o escopo do portal.

import { NextResponse } from "next/server";
import type { PortalAccessTokenPayload } from "@/lib/auth/types";
import { getPrisma } from "@/lib/prisma";
import { getEnabledModuleCodes } from "@/lib/modules";
import { alcanceDoCliente } from "@/app/(portal)/alcance";
import { armazenamentoDosAnexos } from "@/lib/financeiro/anexos";
import { respostaDoAnexo } from "@/lib/financeiro/pendencias/armazenamento";
import { MODULO_DE_APROVACOES } from "./servidor";

/**
 * O anexo só sai se for de uma conta que a tela de Aprovações mostra a este
 * cliente: conta a pagar, aguardando aprovação, não cancelada, de uma empresa
 * do alcance dele, no escritório da sessão. Fora disso, 404 — como id
 * inexistente: o cliente não descobre anexo de outra empresa pelo endereço.
 */
export function whereDoAnexoNoPortal(tenantId: string, companyIds: string[], id: string) {
  return {
    id,
    tenantId,
    entry: {
      tenantId,
      companyId: { in: companyIds },
      kind: "PAGAR" as const,
      approvalStatus: "AGUARDANDO" as const,
      status: { not: "CANCELADO" as const },
    },
  };
}

/**
 * A rota (`/portal/aprovacoes/anexos/[id]`) já conferiu a sessão e a tela
 * bloqueada; aqui, o módulo ligado e o escopo, antes de ler o disco.
 */
export async function anexoDaAprovacaoNoPortal(sessao: PortalAccessTokenPayload, id: string): Promise<Response> {
  const naoEncontrado = () => NextResponse.json({ error: "Anexo não encontrado." }, { status: 404 });
  const modulos = await getEnabledModuleCodes(sessao.tenantId);
  if (!modulos.has(MODULO_DE_APROVACOES)) return naoEncontrado();

  const alcance = await alcanceDoCliente(sessao);
  const companyIds = alcance.tipo === "EMPRESAS" ? alcance.companyIds : [];
  if (companyIds.length === 0) return naoEncontrado();

  const anexo = await getPrisma().financeEntryAttachment.findFirst({
    where: whereDoAnexoNoPortal(sessao.tenantId, companyIds, id),
    select: { fileName: true, fileUrl: true, mimeType: true },
  });
  if (!anexo) return naoEncontrado();

  const conteudo = await armazenamentoDosAnexos.lerAnexo(anexo.fileUrl);
  if (!conteudo) return NextResponse.json({ error: "Arquivo não encontrado no armazenamento." }, { status: 404 });
  return respostaDoAnexo(conteudo, anexo);
}
