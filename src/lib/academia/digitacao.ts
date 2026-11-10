// A conta da digitação e da digitação de números (10/11/2026, pedido do Kauan):
// palavras por minuto, precisão e as travas contra trapaça, na mesma régua do
// 41 Hub (server/routes.ts, POST /api/typing/submit). Puro, sem banco.
//
// O servidor recalcula tudo a partir do texto realmente digitado e do tempo:
// o PPM e a precisão que a tela mostra são só prévia. Do navegador, o único
// número aceito é a duração, e mesmo ela só vale perto do relógio do servidor.

import { TEMPO_DA_DIGITACAO_S, type Teste } from "./regras";

/** O que a tela mede enquanto a pessoa digita (a telemetria do Hub). Tudo opcional. */
export type TelemetriaDaDigitacao = {
  /** Tentativas de colar (o campo bloqueia; contar já invalida). */
  colagens?: number;
  /** O maior salto de caracteres entre dois eventos de digitação. */
  maiorSalto?: number;
  /** Quantos intervalos entre teclas foram medidos, a média e o desvio. */
  teclas?: number;
  intervaloMedioMs?: number;
  desvioDoIntervaloMs?: number;
  /** Algum evento de teclado sintético (isTrusted = false): injeção por script. */
  sintetico?: boolean;
  /** Quantas teclas tiveram o tempo de pressão medido, a média e o desvio. */
  pressoes?: number;
  pressaoMediaMs?: number;
  desvioDaPressaoMs?: number;
};

export type ResultadoDaDigitacao =
  | { ok: true; ppm: number; precisao: number; duracaoMs: number }
  | { ok: false; codigo: "trapaca" | "curta" | "precisao_baixa" | "vazia"; motivo: string };

// As travas do Hub, com o mesmo número.
const SALTO_DE_COLAGEM = 25;
const TOLERANCIA_DO_RELOGIO_MS = 15_000;
const DURACAO_MINIMA_MS = 10_000;
/** O Hub limita em 90 s: o relógio é de 60 s e a sessão aceita algum atraso de rede. */
const DURACAO_MAXIMA_MS = 90_000;
const PRECISAO_MINIMA = 50;
const MAXIMO_DE_CARACTERES_POR_SEGUNDO = 16;
const PPM_MAXIMO = 200;
const MINIMO_DE_TECLAS_PARA_O_RITMO = 30;
const VARIACAO_MINIMA_DO_RITMO = 0.1;
const PRESSAO_MINIMA_MS = 8;

/** Palavras do jeito do Hub: o que estiver separado por espaço, certo ou errado. */
export function contarPalavras(texto: string): number {
  const t = texto.trim();
  return t ? t.split(/\s+/).length : 0;
}

/**
 * Precisão do Hub: caracteres certos na mesma posição sobre o maior entre o
 * digitado e o texto servido — quem para no meio do texto perde precisão, o
 * que impede subir no ranking digitando um pedaço rápido e parando. Duas casas.
 */
export function precisaoDaDigitacao(servido: string, digitado: string): number {
  const base = Math.max(digitado.length, servido.length);
  if (base === 0) return 0;
  let certos = 0;
  for (let i = 0; i < digitado.length; i++) if (digitado[i] === servido[i]) certos++;
  return Math.round((certos / base) * 10_000) / 100;
}

/**
 * Palavras por minuto.
 *
 * - Digitação: palavras separadas por espaço (o Hub; o histórico importado de
 *   lá continua comparável).
 * - Números (novo): a palavra-padrão de 5 caracteres. Os itens variam muito de
 *   tamanho — "R$ 9,90" e um CNPJ de 18 caracteres —, e contar item por item
 *   tornaria o nível difícil mais "lento" só por ter itens longos.
 */
export function palavrasPorMinuto(teste: Teste, digitado: string, duracaoMs: number): number {
  if (duracaoMs <= 0) return 0;
  const palavras = teste === "numeros" ? digitado.length / 5 : contarPalavras(digitado);
  return Math.round(palavras / (duracaoMs / 60_000));
}

/**
 * A duração que vale. A do navegador conta a partir da primeira tecla (o
 * relógio do teste), e a do servidor desde que o texto foi servido — então a
 * do servidor é sempre um pouco maior. Vale a do navegador enquanto ela não
 * passar do relógio do servidor (+1 s de folga de rede) nem ficar mais de 15 s
 * abaixo dele (a régua do Hub); fora disso, vale a do servidor. Teto de 90 s.
 */
export function duracaoQueVale(duracaoDoNavegadorMs: number, decorridoNoServidorMs: number): number {
  const navegador = Number.isFinite(duracaoDoNavegadorMs) ? duracaoDoNavegadorMs : decorridoNoServidorMs;
  const confiavel = navegador <= decorridoNoServidorMs + 1_000 && decorridoNoServidorMs - navegador <= TOLERANCIA_DO_RELOGIO_MS;
  return Math.min(Math.round(confiavel ? navegador : decorridoNoServidorMs), DURACAO_MAXIMA_MS);
}

const coeficienteDeVariacao = (media: number, desvio: number) => (media > 0 ? desvio / media : 1);

/** Avalia o envio de uma rodada de digitação (ou de números). */
export function avaliarDigitacao(entrada: {
  teste: Teste;
  servido: string;
  digitado: string;
  duracaoDoNavegadorMs: number;
  decorridoNoServidorMs: number;
  telemetria?: TelemetriaDaDigitacao;
}): ResultadoDaDigitacao {
  const t = entrada.telemetria ?? {};
  const trapaca = (motivo: string): ResultadoDaDigitacao => ({ ok: false, codigo: "trapaca", motivo });

  if (!entrada.digitado.trim()) return { ok: false, codigo: "vazia", motivo: "Nada foi digitado." };
  if ((t.colagens ?? 0) > 0) return trapaca("Colar texto não vale no teste.");
  if ((t.maiorSalto ?? 0) >= SALTO_DE_COLAGEM) return trapaca("O texto entrou de uma vez, como se tivesse sido colado.");
  if (t.sintetico === true) return trapaca("Entrada automatizada: o teclado não foi o de verdade.");

  const duracaoMs = duracaoQueVale(entrada.duracaoDoNavegadorMs, entrada.decorridoNoServidorMs);
  if (duracaoMs < DURACAO_MINIMA_MS) return { ok: false, codigo: "curta", motivo: "A rodada durou menos de 10 segundos." };

  const precisao = precisaoDaDigitacao(entrada.servido, entrada.digitado);
  if (precisao <= PRECISAO_MINIMA) {
    return { ok: false, codigo: "precisao_baixa", motivo: "Precisão de até 50%: o resultado foi descartado pelo excesso de erros." };
  }

  // O teto físico: ninguém sustenta mais de ~16 caracteres por segundo. Pega a
  // macro que digita tecla a tecla, que passa pela trava de colagem.
  if (entrada.digitado.length / (duracaoMs / 1000) > MAXIMO_DE_CARACTERES_POR_SEGUNDO) return trapaca("Velocidade fisicamente impossível.");
  const ppm = palavrasPorMinuto(entrada.teste, entrada.digitado, duracaoMs);
  if (ppm > PPM_MAXIMO) return trapaca("Velocidade acima do recorde humano.");

  // Ritmo robótico: a macro digita com intervalos quase iguais entre teclas.
  if ((t.teclas ?? 0) >= MINIMO_DE_TECLAS_PARA_O_RITMO && coeficienteDeVariacao(t.intervaloMedioMs ?? 0, t.desvioDoIntervaloMs ?? 0) < VARIACAO_MINIMA_DO_RITMO) {
    return trapaca("Ritmo de digitação robótico.");
  }
  // Tempo de pressão de cada tecla: gente segura dezenas de ms, com variação.
  if ((t.pressoes ?? 0) >= MINIMO_DE_TECLAS_PARA_O_RITMO) {
    if ((t.pressaoMediaMs ?? 0) < PRESSAO_MINIMA_MS) return trapaca("Teclas pressionadas sem tempo humano.");
    if (coeficienteDeVariacao(t.pressaoMediaMs ?? 0, t.desvioDaPressaoMs ?? 0) < VARIACAO_MINIMA_DO_RITMO) return trapaca("Pressão de teclas robótica.");
  }

  return { ok: true, ppm, precisao, duracaoMs };
}

/** O relógio da rodada, em milissegundos — para a tela e para o teto do envio. */
export const RELOGIO_DA_DIGITACAO_MS = TEMPO_DA_DIGITACAO_S * 1000;
