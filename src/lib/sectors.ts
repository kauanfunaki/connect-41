import { getPrisma } from "@/lib/prisma";
import { DEFAULT_SECTORS } from "@/lib/sector-constants";

export { SECTOR_COLOR_PALETTE } from "@/lib/sector-constants";

export type SectorRow = {
  id: string;
  code: string;
  label: string;
  color: string;
  active: boolean;
  order: number;
};

async function ensureDefaultSectors(tenantId: string): Promise<void> {
  const prisma = getPrisma();
  const count = await prisma.sector.count({ where: { tenantId } });
  if (count > 0) return;

  await prisma.sector.createMany({
    data: DEFAULT_SECTORS.map((s, i) => ({ tenantId, order: i, ...s })),
    skipDuplicates: true,
  });
}

// Todos os setores do tenant (inclui inativos — necessário para exibir o label
// correto de registros antigos que apontam pra um setor já desativado).
export async function getAllSectors(tenantId: string): Promise<SectorRow[]> {
  await ensureDefaultSectors(tenantId);
  const prisma = getPrisma();
  return prisma.sector.findMany({
    where: { tenantId },
    orderBy: [{ order: "asc" }, { label: "asc" }],
  });
}

// Só os setores ativos — para dropdowns de seleção (novo pipeline, handoff, usuário).
export async function getActiveSectors(tenantId: string): Promise<SectorRow[]> {
  const all = await getAllSectors(tenantId);
  return all.filter((s) => s.active);
}

export type SectorMaps = {
  labels: Record<string, string>;
  colors: Record<string, string>;
  options: { value: string; label: string }[];
};

export async function getSectorMaps(tenantId: string): Promise<SectorMaps> {
  const all = await getAllSectors(tenantId);
  const labels: Record<string, string> = {};
  const colors: Record<string, string> = {};
  for (const s of all) {
    labels[s.code] = s.label;
    colors[s.code] = s.color;
  }
  const options = all.filter((s) => s.active).map((s) => ({ value: s.code, label: s.label }));
  return { labels, colors, options };
}

// Label de exibição de um setor a partir do map de labels — se o código não
// tiver label cadastrado (setor removido/renomeado), formata o código como
// título em vez de mostrar o slug cru (ex.: "dp" -> "Dp").
export function sectorLabel(labels: Record<string, string>, code: string): string {
  return labels[code] ?? code.replace(/[_-]+/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}
