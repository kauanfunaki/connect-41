import type { Teste } from "@/lib/academia/regras";

/** Uma frase de cada teste da Academia (10/11/2026), no cartão e na tela da rodada. */
export const DESCRICAO_DO_TESTE: Record<Teste, string> = {
  digitacao: "Um texto para digitar em 60 segundos. Conta a velocidade (palavras por minuto) e a precisão.",
  numeros: "Valores, CNPJs, datas e códigos como os de um extrato, em 60 segundos.",
  logica: "10 questões em 3 minutos, algumas com imagem. Conta os acertos.",
  atalhos: "A tela pede uma ação do Excel ou do Connect e você aperta o atalho. Conta os acertos em 60 segundos.",
};
