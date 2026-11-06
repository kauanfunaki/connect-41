import type { TomDoSelo } from "@/components/ui/Selo";

// O tom do selo de cada estado do motor. A cor diz só o que pede atenção:
// "Confere no escopo" não é aprovação (o relatório repete isso), e por isso
// é verde discreto, não um "ok".

const TOM_DO_ESTADO: Record<string, TomDoSelo> = {
  "Confere no escopo": "sucesso",
  "Confere em parte": "atencao",
  Pendente: "atencao",
  Divergência: "perigo",
  "Não executado": "neutro",
  "Não localizado": "neutro",
  Bloqueado: "perigo",
  "Conferência manual": "marca",
  // Acompanhamento do achado.
  Aberto: "atencao",
  "Em análise": "marca",
  "Aguardando documento": "atencao",
  "Ajuste proposto": "marca",
  "Corrigido aguardando reteste": "sucesso",
};

export function tomDoEstado(estado: string): TomDoSelo {
  return TOM_DO_ESTADO[estado] ?? "neutro";
}

export function tomDaGravidade(gravidade: string): TomDoSelo {
  return gravidade === "Crítica" ? "perigo" : gravidade === "Alta" ? "atencao" : "neutro";
}
