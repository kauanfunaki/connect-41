// Prioridade de um processo do Societário.
//
// Aparece e filtra — **não reordena a fila**. A ordem da fila é regra do setor
// (exigência antes de espera de órgão, o mais estourado no topo, ver `ordenarFila`),
// e prioridade marcada à mão passando na frente dela esconderia justamente a
// exigência parada, que é o que a tela existe para mostrar.

export const PRIORIDADES = ["BAIXA", "NORMAL", "ALTA", "URGENTE"] as const;

export type Prioridade = (typeof PRIORIDADES)[number];

export const PRIORIDADE_LABEL: Record<Prioridade, string> = {
  BAIXA: "Baixa",
  NORMAL: "Normal",
  ALTA: "Alta",
  URGENTE: "Urgente",
};

export const PRIORIDADE_VARIANTE: Record<Prioridade, "success" | "warning" | "danger" | "info"> = {
  BAIXA: "info",
  NORMAL: "info",
  ALTA: "warning",
  URGENTE: "danger",
};

export function ehPrioridade(valor: unknown): valor is Prioridade {
  return typeof valor === "string" && (PRIORIDADES as readonly string[]).includes(valor);
}
