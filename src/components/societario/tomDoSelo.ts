import type { TomDoSelo } from "@/components/ui/Selo";

/**
 * O tom do `Selo` para os mapas de variante do `Badge` que o Societário já
 * tinha (situação do processo, da licença, prioridade).
 *
 * A regra de 02/10 no `Selo.tsx` diz que a situação de uma linha, cartão ou
 * ficha é Selo (11px), e o Badge fica para categoria em destaque — as filas
 * do Societário eram as que ainda pintavam a situação em Badge (auditoria de
 * 07/10/2026). Os mapas continuam dizendo a cor do jeito que diziam; isto só
 * traduz. Informação vira "marca": é o azul do Selo.
 */
export const TOM_DA_VARIANTE: Record<"success" | "warning" | "danger" | "info", TomDoSelo> = {
  success: "sucesso",
  warning: "atencao",
  danger: "perigo",
  info: "marca",
};
