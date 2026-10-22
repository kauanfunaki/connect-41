// O parcelamento da conta (22/10/2026, o que faltava do levantamento do
// mercado — Omie, Conta Azul e Nibo têm): **um** valor dividido em N parcelas,
// cada uma com o seu valor e o seu vencimento, que a pessoa confere e ajusta
// antes de lançar. A compra de R$ 1.000,00 em 3× vira três contas
// (333,34 + 333,33 + 333,33), uma por mês.
//
// Não é a repetição: na repetição cada conta é a conta inteira de novo
// (aluguel), aqui as parcelas **somam** a conta. Mas a ligação é a mesma — a
// série da repetição (`recurrenceId`, "3/12") —, para o rótulo, o "cancelar
// esta e as próximas" e o "mudar a série daqui em diante" valerem para as duas
// sem uma estrutura paralela.
//
// A competência é a mesma em todas as parcelas: a despesa (ou a receita)
// aconteceu uma vez, no mês da compra; o que se divide é o pagamento. É o
// contrário da repetição, em que cada conta é de um mês.
//
// Funções puras; a gravação é `criarLancamentoManual`.

import { formatarReaisDeCentavos } from "@/lib/format";
import { dataValida } from "./periodo";
import { MAXIMO_DE_OCORRENCIAS, ocorrenciasDaRepeticao, type AjusteDoDia } from "./repeticao";

/** O mesmo teto da repetição com número de vezes: dez anos de parcelas mensais. */
export const MAXIMO_DE_PARCELAS = MAXIMO_DE_OCORRENCIAS;

/** Onde ficam os centavos que não dividem por igual. */
export type OndeFicaOResto = "PRIMEIRA" | "ULTIMA";

export const ONDE_FICA_O_RESTO: { valor: OndeFicaOResto; rotulo: string }[] = [
  { valor: "PRIMEIRA", rotulo: "Na primeira parcela" },
  { valor: "ULTIMA", rotulo: "Na última parcela" },
];

export type Parcela = { indice: number; vencimentoKey: string; centavos: number };

/**
 * O total dividido em `n` partes iguais, com os centavos que sobram numa
 * parcela só — a primeira ou a última —, e não espalhados: é como o boleto
 * parcelado e o cartão fazem, e uma parcela diferente das outras é mais fácil
 * de conferir do que várias com um centavo a mais.
 */
export function dividirEmParcelas(totalCentavos: number, n: number, resto: OndeFicaOResto = "PRIMEIRA"): number[] {
  if (!Number.isInteger(totalCentavos) || !Number.isInteger(n) || n < 1 || totalCentavos < n) return [];
  const base = Math.floor(totalCentavos / n);
  const sobra = totalCentavos - base * n;
  const partes = Array.from({ length: n }, () => base);
  partes[resto === "ULTIMA" ? n - 1 : 0]! += sobra;
  return partes;
}

/**
 * Os vencimentos, um por mês a partir do primeiro — o primeiro como a pessoa
 * digitou; os seguintes no mesmo dia (ou no último do mês) e, caindo em fim de
 * semana ou feriado do escritório, ajustados. É a regra da repetição mensal
 * (`ocorrenciasDaRepeticao`), para as duas andarem iguais.
 */
export function vencimentosDasParcelas(
  primeiroKey: string,
  n: number,
  ajuste: AjusteDoDia = "ADIAR",
  feriados: ReadonlySet<string> = new Set()
): string[] {
  if (!dataValida(primeiroKey) || !Number.isInteger(n) || n < 1) return [];
  return ocorrenciasDaRepeticao(
    { vencimentoKey: primeiroKey, competencia: primeiroKey.slice(0, 7) },
    { frequencia: "MENSAL", ajuste, fim: { tipo: "VEZES", vezes: n } },
    feriados
  ).map((o) => o.vencimentoKey);
}

/** A proposta que a tela mostra para a pessoa conferir: valor dividido, um vencimento por mês. */
export function propostaDeParcelas(p: {
  totalCentavos: number;
  parcelas: number;
  primeiroVencimentoKey: string;
  resto?: OndeFicaOResto;
  ajuste?: AjusteDoDia;
  feriados?: ReadonlySet<string>;
}): Parcela[] {
  const valores = dividirEmParcelas(p.totalCentavos, p.parcelas, p.resto);
  const vencimentos = vencimentosDasParcelas(p.primeiroVencimentoKey, p.parcelas, p.ajuste, p.feriados);
  if (valores.length !== p.parcelas || vencimentos.length !== p.parcelas) return [];
  return valores.map((centavos, i) => ({ indice: i + 1, vencimentoKey: vencimentos[i]!, centavos }));
}

/**
 * As parcelas que vieram do formulário (o campo oculto `parcelas`, em JSON:
 * `[{ vencimento, centavos }]`), conferidas no servidor — a tela pode ter sido
 * editada à mão, e é daqui que as contas nascem. Precisam ser de 2 a
 * `MAXIMO_DE_PARCELAS`, cada uma com data válida e valor positivo, em ordem de
 * vencimento, e somar exatamente o valor da conta: um centavo de diferença é
 * um centavo que ninguém lançou.
 */
export function lerParcelas(texto: string, totalCentavos: number): { ok: true; parcelas: Parcela[] } | { ok: false; erro: string } {
  let bruto: unknown;
  try {
    bruto = JSON.parse(texto);
  } catch {
    return { ok: false, erro: "As parcelas não vieram — refaça o parcelamento." };
  }
  if (!Array.isArray(bruto)) return { ok: false, erro: "As parcelas não vieram — refaça o parcelamento." };
  if (bruto.length < 2) return { ok: false, erro: "Parcele em duas vezes ou mais." };
  if (bruto.length > MAXIMO_DE_PARCELAS) return { ok: false, erro: `No máximo ${MAXIMO_DE_PARCELAS} parcelas.` };

  const parcelas: Parcela[] = [];
  for (const [i, item] of bruto.entries()) {
    const n = i + 1;
    const linha = (item ?? {}) as { vencimento?: unknown; centavos?: unknown };
    const vencimentoKey = dataValida(typeof linha.vencimento === "string" ? linha.vencimento : "");
    if (!vencimentoKey) return { ok: false, erro: `Informe o vencimento da parcela ${n}.` };
    const centavos = linha.centavos;
    if (typeof centavos !== "number" || !Number.isInteger(centavos) || centavos <= 0) {
      return { ok: false, erro: `Informe o valor da parcela ${n} — maior que zero.` };
    }
    const anterior = parcelas[i - 1];
    if (anterior && vencimentoKey < anterior.vencimentoKey) {
      return { ok: false, erro: `A parcela ${n} vence antes da parcela ${n - 1} — confira os vencimentos.` };
    }
    parcelas.push({ indice: n, vencimentoKey, centavos });
  }
  const soma = somaDasParcelas(parcelas);
  if (soma !== totalCentavos) {
    return {
      ok: false,
      erro: `As parcelas somam ${formatarReaisDeCentavos(soma)}, e o valor da conta é ${formatarReaisDeCentavos(totalCentavos)} — ajuste uma delas.`,
    };
  }
  return { ok: true, parcelas };
}

export function somaDasParcelas(parcelas: { centavos: number }[]): number {
  return parcelas.reduce((s, p) => s + p.centavos, 0);
}
