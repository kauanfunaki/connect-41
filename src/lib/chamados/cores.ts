import { SECTOR_COLOR_PALETTE } from "@/lib/sector-constants";

/** Cor estável por categoria, baseada no ID para sobreviver a renomeações. */
export function corDaCategoria(id: string): string {
  let hash = 0;
  for (const caractere of id) hash = (hash * 31 + caractere.charCodeAt(0)) >>> 0;
  return SECTOR_COLOR_PALETTE[hash % SECTOR_COLOR_PALETTE.length] ?? "#586577";
}
