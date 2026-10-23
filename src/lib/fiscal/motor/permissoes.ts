import "server-only";
import { podeExcluir, type AuthContext } from "@/lib/auth/context";
import { podeNoModulo } from "@/lib/auth/modulo";
import { DECISOES, type TipoDeDecisao } from "./decisoes";
import { permissaoDeEscrita, type PermissaoDeEscrita } from "./escrita";

/** Para a tela: quem grava (agir no módulo do tipo) e quem apaga (+ perfil que exclui). A Server Action confere de novo. */
export async function permissoesDeDecisao(ctx: AuthContext, tipos: TipoDeDecisao[]): Promise<Partial<Record<TipoDeDecisao, { agir: boolean; excluir: boolean }>>> {
  const pares = await Promise.all(tipos.map(async (t) => [t, { agir: await podeNoModulo(ctx, DECISOES[t].modulo, "agir"), excluir: podeExcluir(ctx) }] as const));
  return Object.fromEntries(pares);
}

/** Os botões das escritas de §13 numa tela: `agir` no módulo dela e o token de escrita do escritório. */
export async function escritaNaTela(ctx: AuthContext, motor: { escrita: boolean }, modulo: string): Promise<PermissaoDeEscrita> {
  return permissaoDeEscrita({ agir: await podeNoModulo(ctx, modulo, "agir"), tokenDeEscrita: motor.escrita });
}
