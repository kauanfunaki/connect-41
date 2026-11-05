import type { AuthContext } from "@/lib/auth/context";
import { getSectorMaps, sectorLabel } from "@/lib/sectors";
import { setorDoApoio, setoresDoApoio } from "./setorDoApoio";

export type SetorDoApoio = {
  /** O setor que a tela mostra. */
  setor: string;
  rotulo: string;
  /** Os setores que a pessoa pode abrir aqui — o seletor só aparece com mais de um, fora de um setor. */
  setores: { code: string; label: string }[];
  /** A pessoa está dentro de um setor: a tela é a desse setor, sem seletor. */
  noSetor: boolean;
};

/**
 * O setor de uma tela do Apoio (Senhas, Manuais) para esta pessoa — ver
 * `setorDoApoio`. Nulo: nenhum setor ao alcance, e a tela não abre.
 */
export async function setorDaTelaDoApoio(ctx: AuthContext, pedido?: string | null): Promise<SetorDoApoio | null> {
  if (!ctx.tenantId) return null;
  const { labels, options } = await getSectorMaps(ctx.tenantId);
  const disponiveis = setoresDoApoio(ctx, options.map((o) => o.value));
  // Dentro de um setor, a tela é a dele: o `?setor=` não troca (o seletor nem aparece).
  const noSetor = !!ctx.activeSector && disponiveis.includes(ctx.activeSector);
  const setor = setorDoApoio(ctx, disponiveis, noSetor ? null : pedido);
  if (!setor) return null;
  return { setor, rotulo: sectorLabel(labels, setor), setores: disponiveis.map((code) => ({ code, label: sectorLabel(labels, code) })), noSetor };
}
