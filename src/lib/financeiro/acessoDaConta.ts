// Quem mexe numa conta que já existe: a janela "Editar" (19/10, lote B) e os
// anexos da conta (19/10, lote H2). Um lugar só, para as duas portas não
// divergirem — uma segunda cópia é como uma delas perde uma checagem.
//
// A conta abre de Contas a pagar, Contas a receber e Lançamentos, e cada tela é
// de um módulo. Quem atua no setor de qualquer um dos módulos do tipo da conta
// (o do tipo, ou o de Lançamentos) pode mexer nela; quem só vê, só vê.

import { getAuthContext, canActOnSector, canViewSector, type AuthContext } from "@/lib/auth/context";
import { setoresDoModulo } from "@/lib/modules";

const SECTOR = "bpo";
/** O módulo da tela dona de cada tipo de conta. */
export const MODULO_DO_TIPO = { PAGAR: "bpo_contas_pagar", RECEBER: "bpo_contas_receber" } as const;

type Tipo = keyof typeof MODULO_DO_TIPO;

// Cada módulo traz os setores dele (21/10/2026): uma tela ligada a mais de um
// setor libera quem é de qualquer um.
async function setoresDoTipo(tenantId: string, kind: Tipo): Promise<string[]> {
  const porModulo = await Promise.all([MODULO_DO_TIPO[kind], "bpo_lancamentos"].map(async (m) => (await setoresDoModulo(tenantId, m)) ?? [SECTOR]));
  return porModulo.flat();
}

/** Quem pode mudar a conta: quem atua no setor do módulo do tipo dela, ou no de Lançamentos. */
export async function podeEditarOTipo(kind: Tipo): Promise<{ ctx: AuthContext; erro: null } | { ctx: null; erro: string }> {
  const ctx = await getAuthContext();
  if (!ctx.tenantId) return { ctx: null, erro: "Não autenticado." };
  const setores = await setoresDoTipo(ctx.tenantId, kind);
  if (!setores.some((s) => canActOnSector(ctx, s))) {
    return { ctx: null, erro: kind === "PAGAR" ? "Sem permissão em contas a pagar." : "Sem permissão em contas a receber." };
  }
  return { ctx, erro: null };
}

/** Quem pode ver a conta (e baixar o anexo dela): quem vê o setor de um dos módulos do tipo. */
export async function podeVerOTipo(ctx: AuthContext, kind: Tipo): Promise<boolean> {
  const setores = await setoresDoTipo(ctx.tenantId, kind);
  return setores.some((s) => canViewSector(ctx, s));
}
