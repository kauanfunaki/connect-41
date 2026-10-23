// O que toda tela fiscal no modo real precisa antes de desenhar (22/10/2026):
// o motor do escritório, o recorte da URL conferido contra o alcance, o mapa
// Company ↔ estabelecimento e os módulos que a pessoa abre.

import "server-only";
import { getAuthContext, canViewSector, type AuthContext } from "@/lib/auth/context";
import { getTenantModuleStates } from "@/lib/modules";
import { ErroDoMotor } from "@/lib/sped/motor";
import { abrirMotor, estabelecimentosDaRaiz, type MotorDoEscritorio } from "./servidor";
import { contextoDaUrl, type ContextoDoMotor, type EstabelecimentoVisivel, type MapaDaRaiz } from "./estabelecimentos";
import { param } from "./url";

export type TelaDoMotor = {
  ctx: AuthContext;
  motor: MotorDoEscritorio;
  contexto: ContextoDoMotor | null;
  mapa: MapaDaRaiz;
  estabelecimento: EstabelecimentoVisivel | null;
  modulos: string[];
  /** Falha ao ler os estabelecimentos (motor fora, raiz não liberada...). */
  erro: string | null;
};

const VAZIO: MapaDaRaiz = { visiveis: [], semCadastro: [], semMotor: [] };

export async function prepararTelaDoMotor(params: Record<string, string | string[] | undefined>): Promise<TelaDoMotor | null> {
  const ctx = await getAuthContext();
  const motor = await abrirMotor(ctx.tenantId);
  if (!motor) return null;
  const estados = await getTenantModuleStates(ctx.tenantId);
  const modulos = estados.filter((m) => m.enabled && canViewSector(ctx, m.sectorCodes)).map((m) => m.code);
  const pedida = param(params, "raiz");
  const raiz = pedida && motor.raizes.includes(pedida) ? pedida : motor.raizes[0];
  let mapa = VAZIO;
  let erro: string | null = null;
  if (raiz) {
    try {
      mapa = await estabelecimentosDaRaiz(ctx.tenantId, raiz);
    } catch (err) {
      erro = err instanceof ErroDoMotor ? err.message : "Não foi possível ler os estabelecimentos no motor SPED.";
      if (!(err instanceof ErroDoMotor)) console.error("[fiscal/motor] estabelecimentos", err);
    }
  }
  const contexto = contextoDaUrl({ raiz, estab: param(params, "estab"), competencia: param(params, "competencia") }, motor.raizes, () => mapa.visiveis);
  const estabelecimento = contexto?.estabelecimentoId ? mapa.visiveis.find((e) => e.id === contexto.estabelecimentoId) ?? null : null;
  return { ctx, motor, contexto, mapa, estabelecimento, modulos, erro };
}

// `doMotor` mora em `./leitura` (sem auth nem banco, para os carregadores das telas serem testáveis).
export { doMotor, type Leitura, type FalhaDaLeitura } from "./leitura";
