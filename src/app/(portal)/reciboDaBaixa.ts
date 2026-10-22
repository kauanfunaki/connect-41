import { NextResponse } from "next/server";
import type { PortalAccessTokenPayload } from "@/lib/auth/types";
import { getPrisma } from "@/lib/prisma";
import { getEnabledModuleCodes } from "@/lib/modules";
import { SELECT_DO_RECIBO, dadosDoRecibo, respostaDoRecibo } from "@/lib/financeiro/baixa/reciboServidor";
import { alcanceDoCliente } from "./alcance";

const MODULO = { PAGAR: "bpo_contas_pagar", RECEBER: "bpo_contas_receber" } as const;

/**
 * O recibo da baixa pelo portal (22/10/2026): o cliente baixa o mesmo PDF que
 * a equipe, de uma conta paga em Contas a pagar ou a receber. As rotas
 * (`/portal/pagar/recibos/[id]`, `/portal/receber/recibos/[id]`) já
 * conferiram a sessão e a tela bloqueada — cada uma pergunta pela própria
 * tela, como todo download do portal. Aqui, o resto do escopo, antes de ler a
 * baixa: o módulo do tipo ligado (o mesmo `notFound` da tela) e a baixa de
 * uma conta do tipo, não cancelada, de uma empresa do alcance do cliente — a
 * mesma lista que a tela mostra (`contasDoEscopo`). Fora disso, 404, como id
 * inexistente: o cliente não descobre baixa de outra empresa pelo endereço.
 *
 * O papel do portal sai sem a observação da baixa, que é anotação da equipe.
 */
export async function reciboDaBaixaNoPortal(sessao: PortalAccessTokenPayload, kind: "PAGAR" | "RECEBER", id: string): Promise<NextResponse> {
  const naoEncontrado = () => NextResponse.json({ error: "Recibo não encontrado." }, { status: 404 });
  const modulos = await getEnabledModuleCodes(sessao.tenantId);
  if (!modulos.has(MODULO[kind])) return naoEncontrado();

  const alcance = await alcanceDoCliente(sessao);
  const companyIds = alcance.tipo === "EMPRESAS" ? alcance.companyIds : [];
  if (companyIds.length === 0) return naoEncontrado();

  const baixa = await getPrisma().financeEntryPayment.findFirst({
    where: {
      id,
      tenantId: sessao.tenantId,
      companyId: { in: companyIds },
      entry: { tenantId: sessao.tenantId, companyId: { in: companyIds }, kind, status: { not: "CANCELADO" } },
    },
    select: SELECT_DO_RECIBO,
  });
  if (!baixa) return naoEncontrado();
  return respostaDoRecibo(dadosDoRecibo(baixa, { paraOPortal: true }));
}
