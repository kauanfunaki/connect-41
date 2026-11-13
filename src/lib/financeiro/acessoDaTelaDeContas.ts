// Quem usa a tela de Contas a pagar ou a receber — a página, a exportação da
// lista e os funis das colunas (13/11/2026). Um lugar só: o funil passou a ir
// ao servidor, e uma terceira cópia do portão é como uma porta perde uma
// checagem.

import { canActOnSector, type AuthContext } from "@/lib/auth/context";
import { isModuleEnabled, setoresDoModulo } from "@/lib/modules";
import { getModuleDef } from "@/lib/module-catalog";

/**
 * Atua num dos setores do módulo da tela, neste tenant, com o módulo ligado.
 *
 * O setor não é constante: é o que opera o módulo no tenant
 * (`setoresDoModulo`), então a tela acompanha uma transferência de setor. O
 * setor ativo da pessoa é filtro de visão, não permissão — quem é do setor
 * continua entrando com outro ativo.
 */
export async function podeUsarATelaDeContas(ctx: AuthContext, modulo: string): Promise<boolean> {
  if (!ctx.tenantId || !getModuleDef(modulo)) return false;
  const setores = await setoresDoModulo(ctx.tenantId, modulo);
  if (!setores || !canActOnSector(ctx, setores)) return false;
  return isModuleEnabled(ctx.tenantId, modulo);
}
