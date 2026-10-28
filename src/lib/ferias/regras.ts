// As regras das férias num lugar só (lote 6, 28/10/2026). O levantamento das
// telas repetidas achou a lista das férias "em aberto" copiada cinco vezes e o
// prazo de "a vencer" escrito em quatro lugares, com dois números: 60 dias nas
// telas (Home, Férias, Indicadores) e 30 no sino e na IA do DP.
//
// Os dois prazos continuam como estavam — cada um com nome, aqui. Usar um
// número só é decisão do Kauan (documento "Telas e informações repetidas no
// Connect", item 5); quando vier, muda-se aqui.
//
// Só regra: sem banco, para servir também a componente do navegador.

/** As situações em que as férias ainda estão por gozar ou em gozo. */
export const FERIAS_EM_ABERTO = ["PLANEJADA", "SOLICITADA", "EM_ANALISE", "APROVADA", "PROGRAMADA", "EM_GOZO"] as const;

/**
 * "A vencer" nas telas: o fim do período concessivo nos próximos 60 dias — o
 * prazo em que ainda dá para programar sem pagar em dobro.
 */
export const DIAS_DAS_FERIAS_A_VENCER = 60;

/** O aviso no sino e a resposta da IA do DP: o fim do período concessivo nos próximos 30 dias. */
export const DIAS_DO_AVISO_DAS_FERIAS = 30;
