// Quem baixa os XML do eSocial do DP 2 (12/11/2026): quem vê o módulo, com a
// empresa dentro da faixa "Trabalhando em".

import { getAuthContext } from "@/lib/auth/context";
import { podeNoModulo } from "@/lib/auth/modulo";
import { recusaDoFoco } from "@/lib/empresas/focoServidor";

export async function acessoAoEsocial(companyId: string) {
  const ctx = await getAuthContext();
  if (!ctx.userId || !ctx.tenantId) return { erro: "Não autenticado", status: 401 } as const;
  if (!(await podeNoModulo(ctx, "dp2_esocial", "ver"))) return { erro: "Sem permissão.", status: 403 } as const;
  const foraDoFoco = await recusaDoFoco(ctx, [companyId]);
  if (foraDoFoco) return { erro: foraDoFoco, status: 403 } as const;
  return { ctx } as const;
}
