import { cookies } from "next/headers";
import { COOKIE_DA_EMPRESA_DO_PORTAL } from "./empresaEscolhida";

/**
 * A empresa guardada no cookie do portal, crua — quem usa passa por
 * `empresaDaTela`, que só aceita empresa do acesso. Ver `empresaEscolhida.ts`.
 */
export async function empresaGuardadaDoPortal(): Promise<string | null> {
  const bruto = (await cookies()).get(COOKIE_DA_EMPRESA_DO_PORTAL)?.value;
  if (!bruto) return null;
  try {
    return decodeURIComponent(bruto);
  } catch {
    return null;
  }
}
