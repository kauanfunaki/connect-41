export const SECTOR_LABELS: Record<string, string> = {
  tech: "Tech",
  dprh: "DP / RH",
  recrutamento: "Recrutamento",
  societario: "Societário",
  financeiro: "Financeiro",
  fiscal: "Fiscal",
  contabil: "Contábil",
  bpo: "BPO",
  comercial: "Comercial",
  corretora: "Corretora",
  gestao: "Gestão",
};

export const SECTOR_COLORS: Record<string, string> = {
  tech: "#2E6FB8",
  dprh: "#7C5CBF",
  recrutamento: "#1E8E5A",
  societario: "#C8860D",
  financeiro: "#0E9384",
  fiscal: "#C5374B",
  contabil: "#4F46E5",
  bpo: "#B7791F",
  comercial: "#E15A2B",
  corretora: "#0891B2",
  gestao: "#586577",
};

export const SECTOR_OPTIONS = Object.entries(SECTOR_LABELS).map(([value, label]) => ({
  value,
  label,
}));
