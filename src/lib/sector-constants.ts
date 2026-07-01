// Constantes puras (sem acesso a banco) — seguro para importar em Client Components.

// Paleta sugerida para novos setores (o admin pode escolher outra cor livremente).
export const SECTOR_COLOR_PALETTE = [
  "#2E6FB8", "#7C5CBF", "#1E8E5A", "#C8860D", "#0E9384",
  "#C5374B", "#4F46E5", "#B7791F", "#E15A2B", "#0891B2", "#586577",
];

// Setores originais do CRM (Fase 2) — usados só para semear o primeiro acesso
// de cada tenant. A partir daí o cadastro vive 100% na tabela `sectors`.
export const DEFAULT_SECTORS = [
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
