// A tendência do número principal dos painéis (06/10, opção A): o selo
// ("▲ 12% em 7 dias", "▼ 4 desde ontem") e a linha das últimas semanas.
// Funções puras sobre as fotos diárias (`home_metric_snapshots`); a leitura e
// a gravação ficam em `historico.ts`.
//
// Sem foto para comparar não há selo; com menos de três pontos não há linha —
// e o painel fica como era, sem espaço vazio no lugar.

import { addDaysToKey } from "@/lib/agenda";
import type { FormatoDaMetrica, SentidoDaMetrica } from "./metricas";

/** Uma foto: o valor da métrica no fim (última leitura) de um dia. */
export type Foto = { dia: string; valor: number };

/** A linha cobre oito semanas, hoje incluído. */
export const JANELA_DA_LINHA_DIAS = 56;
/** Pontos mínimos (hoje incluído) para a linha dizer alguma coisa. */
export const PONTOS_MINIMOS_DA_LINHA = 3;

/** O selo compara com uma semana atrás, aceitando de 5 a 9 dias. */
const ALVO_DIAS = 7;
const TOLERANCIA_DIAS = 2;
/** Sem foto de uma semana atrás, vale a mais recente dos últimos 4 dias ("desde ontem"). */
const RECENTE_ATE_DIAS = 4;

const NUMERO = new Intl.NumberFormat("pt-BR");
const MOEDA_CURTA = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
  notation: "compact",
  maximumFractionDigits: 1,
});

/** Dias de calendário de `de` até `ate` (chaves "AAAA-MM-DD"). */
export function diasEntre(de: string, ate: string): number {
  const utc = (k: string) => {
    const [a, m, d] = k.split("-").map(Number);
    return Date.UTC(a, m - 1, d);
  };
  return Math.round((utc(ate) - utc(de)) / 86_400_000);
}

export type Comparacao = { valor: number; dias: number };

/**
 * Com que foto o número de hoje se compara: a mais perto de 7 dias atrás (de
 * 5 a 9; no empate, a mais antiga, que cobre a semana inteira). Sem nenhuma
 * nessa faixa, a mais recente dos últimos 4 dias — a de ontem, se houver.
 * Foto de hoje (ou do futuro) não conta: hoje é o valor ao vivo.
 */
export function escolherComparacao(fotos: readonly Foto[], hojeKey: string): Comparacao | null {
  let semana: Comparacao | null = null;
  let recente: Comparacao | null = null;
  for (const f of fotos) {
    if (!Number.isFinite(f.valor)) continue;
    const dias = diasEntre(f.dia, hojeKey);
    if (!Number.isFinite(dias) || dias < 1) continue;
    const distancia = Math.abs(dias - ALVO_DIAS);
    if (distancia <= TOLERANCIA_DIAS) {
      const melhor = semana ? Math.abs(semana.dias - ALVO_DIAS) : Infinity;
      if (distancia < melhor || (distancia === melhor && semana && dias > semana.dias)) semana = { valor: f.valor, dias };
    } else if (dias <= RECENTE_ATE_DIAS) {
      if (!recente || dias < recente.dias) recente = { valor: f.valor, dias };
    }
  }
  return semana ?? recente;
}

export type Seta = "▲" | "▼" | "=";
export type TomDaTendencia = "bom" | "ruim" | "neutro";

/** "desde ontem" ou "em N dias". */
export function periodoDaComparacao(dias: number): string {
  return dias === 1 ? "desde ontem" : `em ${NUMERO.format(dias)} dias`;
}

/**
 * Quanto mudou, sem sinal (a seta diz o sentido). Contagem: a diferença
 * ("4"). Dinheiro: o percentual ("12%"), que cabe no selo; partindo de zero
 * não há percentual, e vai a diferença curta ("R$ 1,2 mil").
 */
export function quantoMudou(atual: number, anterior: number, formato: FormatoDaMetrica): string | null {
  const delta = atual - anterior;
  if (delta === 0) return null;
  const abs = Math.abs(delta);
  if (formato === "contagem") return NUMERO.format(abs);
  if (anterior > 0) {
    const pct = (abs / anterior) * 100;
    if (pct < 1) return "<1%";
    if (pct > 999) return ">999%";
    return `${NUMERO.format(Math.round(pct))}%`;
  }
  return MOEDA_CURTA.format(abs / 100);
}

/** Bom ou ruim pelo sentido da métrica: subir em "vencidas" é ruim; volume é neutro. */
export function tomDaVariacao(delta: number, sentido: SentidoDaMetrica): TomDaTendencia {
  if (delta === 0 || !Number.isFinite(delta) || sentido === "neutro") return "neutro";
  const subiu = delta > 0;
  return subiu === (sentido === "maior-e-melhor") ? "bom" : "ruim";
}

export type Selo = {
  seta: Seta;
  /** O que vai ao lado da seta: "12% em 7 dias", "igual a ontem". */
  texto: string;
  tom: TomDaTendencia;
  /** A frase para leitor de tela: "Subiu 12% em 7 dias — piorou." */
  descricao: string;
};

export function montarSelo(
  atual: number,
  comparacao: Comparacao,
  def: { formato: FormatoDaMetrica; sentido: SentidoDaMetrica }
): Selo | null {
  if (!Number.isFinite(atual) || !Number.isFinite(comparacao.valor)) return null;
  const delta = atual - comparacao.valor;
  const quanto = quantoMudou(atual, comparacao.valor, def.formato);
  const periodo = periodoDaComparacao(comparacao.dias);
  const tom = tomDaVariacao(delta, def.sentido);
  if (quanto === null) {
    const texto = comparacao.dias === 1 ? "igual a ontem" : `sem mudança ${periodo}`;
    return { seta: "=", texto, tom, descricao: `${texto[0].toUpperCase()}${texto.slice(1)}.` };
  }
  const texto = `${quanto} ${periodo}`;
  const juizo = tom === "bom" ? " — melhorou" : tom === "ruim" ? " — piorou" : "";
  return { seta: delta > 0 ? "▲" : "▼", texto, tom, descricao: `${delta > 0 ? "Subiu" : "Caiu"} ${texto}${juizo}.` };
}

/** Um ponto da linha: x e y de 0 a 1 (y = 1 é o maior valor da janela). */
export type PontoDaLinha = { dia: string; valor: number; x: number; y: number };

/**
 * Os pontos da linha das últimas semanas: as fotos dos dias anteriores na
 * janela e, no fim, o valor de hoje ao vivo. O eixo x é o calendário — dia
 * sem foto (fim de semana, ninguém abriu a Home) vira um trecho reto, não
 * some. Com menos de PONTOS_MINIMOS_DA_LINHA, não há linha.
 */
export function pontosDaLinha(
  fotos: readonly Foto[],
  hojeKey: string,
  atual: number,
  janelaDias = JANELA_DA_LINHA_DIAS
): PontoDaLinha[] | null {
  if (!Number.isFinite(atual)) return null;
  const inicio = addDaysToKey(hojeKey, -(janelaDias - 1));
  const porDia = new Map<string, number>();
  for (const f of fotos) {
    if (!Number.isFinite(f.valor) || f.dia < inicio || f.dia >= hojeKey) continue;
    porDia.set(f.dia, f.valor);
  }
  porDia.set(hojeKey, atual);
  const dias = Array.from(porDia.keys()).sort();
  if (dias.length < PONTOS_MINIMOS_DA_LINHA) return null;

  const valores = dias.map((d) => porDia.get(d)!);
  const menor = Math.min(...valores);
  const maior = Math.max(...valores);
  const total = diasEntre(dias[0], hojeKey);
  return dias.map((dia, i) => ({
    dia,
    valor: valores[i],
    x: total > 0 ? diasEntre(dias[0], dia) / total : 1,
    // Linha reta no meio quando nada mudou na janela.
    y: maior > menor ? (valores[i] - menor) / (maior - menor) : 0.5,
  }));
}

export type Tendencia = { selo: Selo | null; linha: PontoDaLinha[] | null };

/** Selo e linha juntos; `null` quando não há nem um nem outro. */
export function montarTendencia(
  fotos: readonly Foto[],
  hojeKey: string,
  atual: number,
  def: { formato: FormatoDaMetrica; sentido: SentidoDaMetrica }
): Tendencia | null {
  const comparacao = escolherComparacao(fotos, hojeKey);
  const selo = comparacao ? montarSelo(atual, comparacao, def) : null;
  const linha = pontosDaLinha(fotos, hojeKey, atual);
  return selo || linha ? { selo, linha } : null;
}
