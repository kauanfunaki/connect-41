// O acordo de cobrança: títulos vencidos de um sacado trocados por parcelas.
// Funções puras — a simulação na tela e a gravação na action saem das mesmas.
//
// ─── Por que os originais saem como CANCELADO + RENEGOCIADO ──────────────────
//
// Todo cálculo de "em aberto" do Connect (a tela de contas, o aging, o ranking,
// a projeção, o runway, os candidatos da conciliação) filtra
// `status != CANCELADO`. Encerrar o original com esse status e um motivo faz a
// dívida sair desses lugares **sem mexer em nenhum deles** — e as parcelas,
// lançamentos a receber comuns, entram nos mesmos lugares pelo mesmo caminho.
// Quem precisa distinguir (a DRE econômica, a cobrança) lê o motivo.

import { centavosDeTexto } from "../manual";
import { dataValida } from "../periodo";
import type { MotivoDeEncerramento, StatusDoAcordo, StatusDoLancamento, Validacao, Veredito } from "./regras";

export const MAXIMO_DE_PARCELAS = 60;
export const TAMANHO_MAXIMO_DA_NOTA = 2000;
/** Teto do `Decimal(12,2)`, o mesmo de `validarCamposDoLancamento`. */
const MAIOR_VALOR_EM_CENTAVOS = 9_999_999_999_99;

/**
 * Soma meses a uma data "AAAA-MM-DD", segurando o dia no fim do mês.
 *
 * 31/01 + 1 mês é 28 (ou 29) de fevereiro, e **31/01 + 2 meses é 31/03** — o
 * dia sai sempre da data base, não da parcela anterior. Encadear a partir da
 * anterior faria o vencimento escorregar para 28 no resto do ano depois do
 * primeiro fevereiro.
 */
export function somarMesesNaData(dataKey: string, meses: number): string {
  const [a, m, d] = dataKey.split("-").map(Number) as [number, number, number];
  const total = a * 12 + (m - 1) + meses;
  const ano = Math.floor(total / 12);
  const mes = (total % 12) + 1;
  const ultimoDia = new Date(Date.UTC(ano, mes, 0)).getUTCDate();
  const dia = Math.min(d, ultimoDia);
  return `${ano}-${String(mes).padStart(2, "0")}-${String(dia).padStart(2, "0")}`;
}

export type ParcelaSimulada = { numero: number; valorCentavos: number; vencimentoKey: string };

/**
 * As parcelas de um acordo.
 *
 * Divisão em centavos inteiros, com a sobra **na última**: R$ 100,00 em 3 é
 * 33,33 + 33,33 + 33,34. A sobra no fim, e não espalhada, porque é o que o
 * sacado espera ler no boleto — parcelas iguais e um ajuste de centavo no fim.
 */
export function gerarParcelas(p: {
  totalCentavos: number;
  parcelas: number;
  primeiroVencimentoKey: string;
  intervaloMeses?: number;
}): ParcelaSimulada[] {
  const n = p.parcelas;
  if (!Number.isInteger(n) || n < 1) return [];
  const intervalo = p.intervaloMeses ?? 1;
  const base = Math.floor(p.totalCentavos / n);
  const sobra = p.totalCentavos - base * n;
  return Array.from({ length: n }, (_, i) => ({
    numero: i + 1,
    valorCentavos: i === n - 1 ? base + sobra : base,
    vencimentoKey: somarMesesNaData(p.primeiroVencimentoKey, i * intervalo),
  }));
}

export type TituloParaAcordo = {
  id: string;
  kind: "PAGAR" | "RECEBER";
  status: StatusDoLancamento;
  closeReason: MotivoDeEncerramento | null;
  paidAt: Date | null;
  companyId: string;
  counterpartyId: string;
  vencimentoKey: string;
  valorCentavos: number;
  /** Acordo de que o título já é parcela, quando é. */
  statusDoAcordo: StatusDoAcordo | null;
};

export type SelecaoDoAcordo =
  | { ok: true; companyId: string; counterpartyId: string; originalCentavos: number }
  | { ok: false; erro: string };

/**
 * Os títulos escolhidos podem virar um acordo?
 *
 * - **mesma empresa e mesmo sacado** — o acordo é uma dívida de alguém com
 *   alguém; misturar credores faria uma parcela paga não dizer de quem é;
 * - **a receber, vencido e em aberto** — título em dia não está em cobrança, e
 *   pago, cancelado, perdido ou já renegociado não é mais dívida;
 * - **parcela de acordo ativo** é recusa: renegociar a parcela é refazer o
 *   acordo, e isso se faz quebrando o atual. Parcela de acordo **quebrado** pode:
 *   ela é a dívida que sobrou.
 */
export function validarSelecaoDoAcordo(titulos: TituloParaAcordo[], hojeKey: string): SelecaoDoAcordo {
  if (titulos.length === 0) return { ok: false, erro: "Escolha ao menos um título." };
  if (new Set(titulos.map((t) => t.id)).size !== titulos.length) return { ok: false, erro: "Título repetido na seleção." };
  const [primeiro] = titulos as [TituloParaAcordo];
  let original = 0;
  for (const t of titulos) {
    if (t.kind !== "RECEBER") return { ok: false, erro: "Acordo é só de contas a receber." };
    if (t.companyId !== primeiro.companyId) return { ok: false, erro: "Os títulos precisam ser da mesma empresa." };
    if (t.counterpartyId !== primeiro.counterpartyId) return { ok: false, erro: "Os títulos precisam ser do mesmo sacado." };
    if (t.closeReason === "RENEGOCIADO") return { ok: false, erro: "Um dos títulos já foi renegociado." };
    if (t.closeReason === "PERDA") return { ok: false, erro: "Um dos títulos está baixado por perda — reverta antes." };
    if (t.status === "CANCELADO") return { ok: false, erro: "Um dos títulos está cancelado." };
    if (t.status === "PAGO" || t.paidAt !== null) return { ok: false, erro: "Um dos títulos já está pago." };
    if (t.vencimentoKey >= hojeKey) return { ok: false, erro: "Só entra em acordo título vencido." };
    if (t.statusDoAcordo === "ATIVO") return { ok: false, erro: "Um dos títulos é parcela de acordo ativo — marque o acordo como quebrado antes." };
    original += t.valorCentavos;
  }
  return { ok: true, companyId: primeiro.companyId, counterpartyId: primeiro.counterpartyId, originalCentavos: original };
}

export type TermosDoAcordo = {
  acordadoCentavos: number;
  parcelas: number;
  primeiroVencimentoKey: string;
  notas: string | null;
};

/**
 * Valor, parcelas e primeiro vencimento.
 *
 * O primeiro vencimento não pode estar no passado: parcela que nasce vencida é
 * um acordo que já nasce quebrado. Hoje pode — é o "paga a entrada agora".
 */
export function validarTermosDoAcordo(
  campos: { valor: string | null | undefined; parcelas: string | null | undefined; primeiroVencimento: string | null | undefined; notas?: string | null },
  hojeKey: string
): Validacao<TermosDoAcordo> {
  const acordadoCentavos = centavosDeTexto(campos.valor);
  if (acordadoCentavos === null) return { ok: false, erro: "Valor do acordo ilegível. Use, por exemplo, 1.234,56." };
  if (acordadoCentavos === 0) return { ok: false, erro: "O valor do acordo não pode ser zero." };
  if (acordadoCentavos > MAIOR_VALOR_EM_CENTAVOS) return { ok: false, erro: "Valor acima do limite do financeiro." };

  const parcelas = Number((campos.parcelas ?? "").trim());
  if (!Number.isInteger(parcelas) || parcelas < 1 || parcelas > MAXIMO_DE_PARCELAS) {
    return { ok: false, erro: `Número de parcelas entre 1 e ${MAXIMO_DE_PARCELAS}.` };
  }
  // Parcela de zero centavo não é parcela — R$ 0,05 em 10 vezes.
  if (Math.floor(acordadoCentavos / parcelas) === 0) return { ok: false, erro: "Parcelas demais para este valor." };

  const primeiroVencimentoKey = dataValida(campos.primeiroVencimento);
  if (!primeiroVencimentoKey) return { ok: false, erro: "Informe o vencimento da primeira parcela." };
  if (primeiroVencimentoKey < hojeKey) return { ok: false, erro: "A primeira parcela não pode vencer num dia que já passou." };

  const notas = (campos.notas ?? "").trim();
  if (notas.length > TAMANHO_MAXIMO_DA_NOTA) return { ok: false, erro: `Observação com mais de ${TAMANHO_MAXIMO_DA_NOTA} caracteres.` };

  return { ok: true, dados: { acordadoCentavos, parcelas, primeiroVencimentoKey, notas: notas === "" ? null : notas } };
}

/** Acréscimo (positivo) ou desconto (negativo) do acordo sobre os originais. */
export function diferencaDoAcordo(originalCentavos: number, acordadoCentavos: number): number {
  return acordadoCentavos - originalCentavos;
}

export type ParcelaParaTransicao = {
  status: StatusDoLancamento;
  closeReason: MotivoDeEncerramento | null;
  paidAt: Date | null;
};

function paga(p: ParcelaParaTransicao): boolean {
  return p.status === "PAGO" || p.paidAt !== null;
}

/**
 * Parcela que ainda faz parte do acordo: tudo menos a cancelada comum (a do
 * acordo desfeito). A **perdida** e a **renegociada** (parcela de acordo
 * quebrado que virou outro acordo) continuam — são parcelas que este acordo não
 * vai receber, e é justamente o que o impede de chegar a cumprido.
 */
function viva(p: ParcelaParaTransicao): boolean {
  return paga(p) || p.status !== "CANCELADO" || p.closeReason === "PERDA" || p.closeReason === "RENEGOCIADO";
}

/**
 * Quebrar: o sacado deixou de pagar. Só de acordo ativo; as parcelas não pagas
 * continuam em aberto como a dívida, e voltam à cobrança comum.
 */
export function podeQuebrar(status: StatusDoAcordo): Veredito {
  if (status !== "ATIVO") return { pode: false, motivo: `Acordo ${status.toLowerCase()} não pode ser marcado como quebrado.` };
  return { pode: true };
}

/**
 * Desfazer: o acordo não devia ter existido. Cancela as parcelas e devolve os
 * originais ao em aberto — por isso **só sem nenhuma parcela paga**: com uma
 * paga, o dinheiro que entrou ficaria pendurado numa parcela cancelada, e os
 * originais voltariam a cobrar o valor inteiro. Parcela baixada por perda
 * também impede: reverta a perda antes, para a decisão não sumir junto.
 */
export function podeDesfazer(status: StatusDoAcordo, parcelas: ParcelaParaTransicao[]): Veredito {
  if (status !== "ATIVO" && status !== "QUEBRADO") {
    return { pode: false, motivo: `Acordo ${status.toLowerCase()} não pode ser desfeito.` };
  }
  if (parcelas.some(paga)) return { pode: false, motivo: "Há parcela paga — acordo com pagamento não se desfaz. Marque como quebrado." };
  if (parcelas.some((p) => p.closeReason === "PERDA")) return { pode: false, motivo: "Há parcela baixada por perda — reverta a perda antes." };
  // Desfazer devolveria os originais enquanto a parcela segue cobrada no outro
  // acordo: a mesma dívida duas vezes em aberto.
  if (parcelas.some((p) => p.closeReason === "RENEGOCIADO")) {
    return { pode: false, motivo: "Há parcela renegociada em outro acordo — desfaça aquele antes." };
  }
  return { pode: true };
}

/**
 * O status que o acordo deve ter depois de uma baixa ou de um desfazer de baixa
 * numa parcela.
 *
 * - todas as parcelas (não canceladas) pagas → **cumprido**, venha de ativo ou
 *   de quebrado: o sacado acabou pagando;
 * - cumprido com uma parcela que deixou de estar paga → volta a **ativo**;
 * - desfeito não muda — as parcelas dele estão canceladas.
 */
export function statusSincronizado(status: StatusDoAcordo, parcelas: ParcelaParaTransicao[]): StatusDoAcordo {
  if (status === "DESFEITO") return status;
  const vivas = parcelas.filter(viva);
  const todasPagas = vivas.length > 0 && vivas.every(paga);
  if (todasPagas) return "CUMPRIDO";
  if (status === "CUMPRIDO") return "ATIVO";
  return status;
}

/** `emAbertoCentavos` não inclui parcela perdida nem renegociada: ela não é mais a receber por este acordo. */
export type ResumoDoAcordo = { pagas: number; total: number; pagoCentavos: number; emAbertoCentavos: number };

/** O que já foi pago de um acordo — para o detalhe e para o portal. */
export function resumoDoAcordo(parcelas: (ParcelaParaTransicao & { valorCentavos: number })[]): ResumoDoAcordo {
  const r: ResumoDoAcordo = { pagas: 0, total: 0, pagoCentavos: 0, emAbertoCentavos: 0 };
  for (const p of parcelas) {
    if (!viva(p)) continue;
    r.total += 1;
    if (paga(p)) {
      r.pagas += 1;
      r.pagoCentavos += p.valorCentavos;
    } else if (p.closeReason !== "PERDA" && p.closeReason !== "RENEGOCIADO") {
      r.emAbertoCentavos += p.valorCentavos;
    }
  }
  return r;
}

/**
 * A categoria das parcelas: a dos originais quando todos têm a mesma, senão a
 * do maior original. É o que a DRE de **caixa** usa para classificar o
 * recebimento — a econômica não conta parcela.
 */
export function categoriaDasParcelas(originais: { categoryId: string | null; valorCentavos: number }[]): string | null {
  const ids = new Set(originais.map((o) => o.categoryId));
  if (ids.size === 1) return originais[0]?.categoryId ?? null;
  const maior = [...originais].sort((a, b) => b.valorCentavos - a.valorCentavos).find((o) => o.categoryId !== null);
  return maior?.categoryId ?? null;
}
