import { getPrisma } from "@/lib/prisma";

// Paleta sugerida para novos setores (o admin pode escolher outra cor livremente).
export const SECTOR_COLOR_PALETTE = [
  "#2E6FB8", "#7C5CBF", "#1E8E5A", "#C8860D", "#0E9384",
  "#C5374B", "#4F46E5", "#B7791F", "#E15A2B", "#0891B2", "#586577",
];

// Setores originais do CRM (Fase 2) — usados só para semear o primeiro acesso
// de cada tenant. A partir daí o cadastro vive 100% na tabela `sectors`.
const DEFAULT_SECTORS = [
  { code: "tech", label: "Tech", color: "#2E6FB8" },
  { code: "dprh", label: "DP / RH", color: "#7C5CBF" },
  { code: "recrutamento", label: "Recrutamento", color: "#1E8E5A" },
  { code: "societario", label: "Societário", color: "#C8860D" },
  { code: "financeiro", label: "Financeiro", color: "#0E9384" },
  { code: "fiscal", label: "Fiscal", color: "#C5374B" },
  { code: "contabil", label: "Contábil", color: "#4F46E5" },
  { code: "bpo", label: "BPO", color: "#B7791F" },
  { code: "comercial", label: "Comercial", color: "#E15A2B" },
  { code: "corretora", label: "Corretora", color: "#0891B2" },
  { code: "gestao", label: "Gestão", color: "#586577" },
];

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
