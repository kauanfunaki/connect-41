// Motor do Valora — ponto de entrada. Este diretório é a fonte única do cálculo: o Connect usa
// daqui e o 41-gestao recebe uma cópia por scripts/valora/sincronizar-motor.mjs. Editar só aqui.

export * from "./tipos";
export * from "./calculo";
export * from "./validacao";
export { MODELO_41 } from "./modelo";
