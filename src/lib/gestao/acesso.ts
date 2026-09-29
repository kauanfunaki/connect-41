// A porta das telas da Gestão: o módulo ligado e o recorte de quem está vendo
// (diretoria e administradores veem tudo; coordenador, os setores dele).

import { getAuthContext } from "@/lib/auth/context";
import { isModuleEnabled } from "@/lib/modules";
import { getSectorMaps } from "@/lib/sectors";
import { recorteDaGestao } from "@/lib/gestao/regras";

export const MODULO_GESTAO = "gestao_painel";

export async function contextoDaGestao() {
  const ctx = await getAuthContext();
  if (!ctx.tenantId) return null;
  const recorte = recorteDaGestao(ctx);
  if (!recorte) return null;
  if (!(await isModuleEnabled(ctx.tenantId, MODULO_GESTAO))) return null;
  const mapas = await getSectorMaps(ctx.tenantId);
  // Os setores que a pessoa pode filtrar: todos os ativos, ou os dela.
  const setores = mapas.options.filter((o) => recorte === "todos" || recorte.includes(o.value));
  return { ctx, recorte, setores, rotuloDoSetor: (code: string) => mapas.labels[code] ?? code };
}

/**
 * O filtro de setor da URL, só se for um setor que a pessoa enxerga. Com
 * filtro, o recorte vira só aquele setor.
 */
export function recorteComFiltro(recorte: "todos" | string[], setores: { value: string }[], filtro: string | undefined): {
  recorte: "todos" | string[];
  setor: string | null;
} {
  if (filtro && setores.some((s) => s.value === filtro)) return { recorte: [filtro], setor: filtro };
  return { recorte, setor: null };
}
