// Mudar a série daqui em diante (22/10/2026, o que faltava do levantamento do
// mercado): o aluguel reajustado, a mensalidade que mudou de categoria, o
// vencimento que passou do dia 10 para o 15. A mudança vale para esta conta e
// para as **próximas da mesma série que ainda estão em aberto** — a paga, a com
// baixa parcial, a cancelada e as anteriores ficam como estão: o que já andou
// é histórico, e a baixa é o que a conciliação casa com o extrato.
//
// Cada conta passa pelas travas da janela "Editar" (`travasDaEdicao`): o que
// ela não deixa mudar numa conta, a série também não. A conta com trava em
// algum campo pedido fica de fora inteira, com o porquê — mudar só parte do
// pedido deixaria a conta num meio-termo que ninguém escolheu (a mesma regra
// do "Alterar em lote").
//
// Funções puras; a leitura e a gravação moram em `mudancaDaSerieServidor.ts`.

import { centavosDeTexto } from "./manual";
import type { CampoEditavel, travasDaEdicao } from "./edicao";
import { ajustarDia, type AjusteDoDia } from "./repeticao";
import { diasCorridos } from "./baixa/encargos";

/** Teto do `Decimal(12,2)`, o mesmo do lançamento manual e da edição. */
const MAIOR_VALOR_EM_CENTAVOS = 9_999_999_999_99;

export type CampoDaSerie = "valor" | "categoria" | "descricao" | "vencimento";

/** O que a pessoa pediu para mudar. Campo ausente é "manter o de cada conta". */
export type MudancaDaSerie = {
  centavos?: number;
  categoriaId?: string;
  descricao?: string;
  /** O dia do mês do vencimento, de 1 a 31 — no mês sem esse dia, o último. */
  dia?: number;
};

/** Os campos que esta mudança mexe, no vocabulário das travas da edição. */
export function camposDaMudanca(m: MudancaDaSerie): CampoDaSerie[] {
  const campos: CampoDaSerie[] = [];
  if (m.centavos !== undefined) campos.push("valor");
  if (m.categoriaId !== undefined) campos.push("categoria");
  if (m.descricao !== undefined) campos.push("descricao");
  if (m.dia !== undefined) campos.push("vencimento");
  return campos;
}

/**
 * Os campos da janela "Mudar a série". Em branco é "manter o de cada conta" —
 * não "apagar": a série de parcelas tem valores diferentes (o centavo do
 * resto), e um valor só, sem a pessoa pedir, achataria todas.
 */
export function lerMudancaDaSerie(campos: {
  valor: string | null | undefined;
  categoryId: string | null | undefined;
  descricao: string | null | undefined;
  dia: string | null | undefined;
}): { ok: true; mudanca: MudancaDaSerie } | { ok: false; erro: string } {
  const m: MudancaDaSerie = {};
  const valor = (campos.valor ?? "").trim();
  if (valor) {
    const centavos = centavosDeTexto(valor);
    if (centavos === null) return { ok: false, erro: "Valor ilegível. Use, por exemplo, 1.234,56." };
    if (centavos <= 0) return { ok: false, erro: "O valor precisa ser maior que zero." };
    if (centavos > MAIOR_VALOR_EM_CENTAVOS) return { ok: false, erro: "Valor acima do limite do financeiro." };
    m.centavos = centavos;
  }
  const categoria = (campos.categoryId ?? "").trim();
  if (categoria) m.categoriaId = categoria;
  const descricao = (campos.descricao ?? "").trim().replace(/\s+/g, " ");
  if (descricao) {
    if (descricao.length > 255) return { ok: false, erro: "Descrição com mais de 255 caracteres." };
    m.descricao = descricao;
  }
  const diaTexto = (campos.dia ?? "").trim();
  if (diaTexto) {
    const dia = Number(diaTexto);
    if (!Number.isInteger(dia) || dia < 1 || dia > 31) return { ok: false, erro: "O dia do vencimento vai de 1 a 31." };
    m.dia = dia;
  }
  if (camposDaMudanca(m).length === 0) return { ok: false, erro: "Diga o que muda: o valor, a categoria, a descrição ou o dia do vencimento." };
  return { ok: true, mudanca: m };
}

export type ContaDaSerie = {
  id: string;
  indice: number;
  status: "PROVISORIO" | "CONFERIDO" | "PAGO" | "CANCELADO";
  paidAt: Date | null;
  /** Quanto as baixas já quitaram, em centavos (lote C). */
  pagoCentavos: number;
  /** O veredito da janela "Editar" para esta conta. */
  edicao: ReturnType<typeof travasDaEdicao>;
  /** Tem rateio (lote D, 20/10): categoria e valor moram nas linhas. */
  rateada: boolean;
};

export type SelecaoDaSerie = {
  /** As que mudam: desta posição em diante, em aberto e sem trava no que foi pedido. */
  mudam: ContaDaSerie[];
  /** As desta posição em diante que ficam como estão, com o porquê. As canceladas não contam. */
  ficam: { id: string; indice: number; motivo: string }[];
};

/** Quais contas da série a mudança alcança — e por que as outras ficam. */
export function contasDaquiEmDiante(contas: ContaDaSerie[], aPartirDe: number, campos: CampoDaSerie[]): SelecaoDaSerie {
  const mudam: ContaDaSerie[] = [];
  const ficam: SelecaoDaSerie["ficam"] = [];
  const ordenadas = [...contas].sort((a, b) => a.indice - b.indice);
  for (const c of ordenadas) {
    // As anteriores não são tocadas, e a cancelada é histórico: nenhuma entra na conta.
    if (c.indice < aPartirDe || c.status === "CANCELADO") continue;
    const motivo = porQueFica(c, campos);
    if (motivo) ficam.push({ id: c.id, indice: c.indice, motivo });
    else mudam.push(c);
  }
  return { mudam, ficam };
}

function porQueFica(c: ContaDaSerie, campos: CampoDaSerie[]): string | null {
  if (c.status === "PAGO" || c.paidAt !== null) return "Paga — o que já andou fica como está.";
  if (c.pagoCentavos > 0) return "Tem baixa parcial — desfaça as baixas para mudar.";
  if (!c.edicao.pode) return c.edicao.motivo;
  // Na conta rateada, o valor e a categoria são a soma e o resumo das linhas:
  // trocar um só na conta desmancharia o rateio sem ninguém ver.
  if (c.rateada && campos.some((x) => x === "valor" || x === "categoria")) {
    return "Tem rateio — mude o valor e a categoria nas linhas, na edição da conta.";
  }
  for (const campo of campos) {
    const trava = c.edicao.travas[campo satisfies CampoEditavel];
    if (trava) return trava;
  }
  return null;
}

// ─── O dia novo na série antiga, sem regra (22/10/2026) ──────────────────────
//
// As séries lançadas antes de 21/10 não guardaram a regra (`FinanceRecurrence`):
// sem ela, o "mudar o dia" recusava, e o vencimento só mudava conta a conta. O
// que a regra diria sai das próprias contas da série:
//
// - a frequência, pela mediana dos dias entre uma conta e a seguinte (por
//   posição): ~1 mês é mensal, ~1 ano é anual; o resto (semanal, quinzenal,
//   todo dia útil) segue recusando, com o mesmo porquê. A mediana aguenta a
//   conta que alguém já mudou à mão;
// - o mês de cada conta é o que ela já tem — salvo quando o ajuste do fim de
//   semana a empurrou para o mês vizinho (o 31/10 num sábado que foi para
//   02/11): aí vale o mês que a competência dá, pelo deslocamento mais comum
//   entre competência e vencimento na série;
// - o ajuste do fim de semana e feriado: conta da série num sábado ou domingo
//   é sinal de "manter a data"; senão, as contas fora do dia de sempre dizem se
//   a série adia ou antecipa; sem sinal, adiar — o padrão do formulário.
//
// O dia novo não é gravado em regra nenhuma (não há): as contas que existem
// mudam; a série antiga não cria contas sozinha.

export type ContaDaSerieAntiga = { indice: number; vencimentoKey: string; competencia?: string | null };

export type InferenciaDaSerieAntiga =
  | {
      ok: true;
      frequencia: "MENSAL" | "ANUAL";
      ajuste: AjusteDoDia;
      /** Meses da competência ao vencimento mais comuns na série, ou nulo sem competência legível. */
      deslocamento: number | null;
    }
  | { ok: false; motivo: "poucas" | "sem_dia_do_mes" };

const ehCompetencia = (c: string | null | undefined): c is string => typeof c === "string" && /^\d{4}-(0[1-9]|1[0-2])$/.test(c);
const indiceDoMes = (k: string) => Number(k.slice(0, 4)) * 12 + Number(k.slice(5, 7)) - 1;
const ultimoDia = (indiceMes: number) => new Date(Date.UTC(Math.floor(indiceMes / 12), (indiceMes % 12) + 1, 0)).getUTCDate();
const chaveDoMes = (indiceMes: number, dia: number) =>
  `${Math.floor(indiceMes / 12)}-${String((indiceMes % 12) + 1).padStart(2, "0")}-${String(Math.min(dia, ultimoDia(indiceMes))).padStart(2, "0")}`;

function maisComum<T>(valores: T[]): T | null {
  const contagem = new Map<T, number>();
  for (const v of valores) contagem.set(v, (contagem.get(v) ?? 0) + 1);
  let melhor: T | null = null;
  let vezes = 0;
  for (const [v, n] of contagem) if (n > vezes) [melhor, vezes] = [v, n];
  return melhor;
}

/** O que a regra da série diria, lido das contas dela. */
export function inferirSerieAntiga(contas: ContaDaSerieAntiga[]): InferenciaDaSerieAntiga {
  const ordenadas = [...contas].sort((a, b) => a.indice - b.indice);
  const passos: number[] = [];
  for (let i = 1; i < ordenadas.length; i++) {
    const [a, b] = [ordenadas[i - 1]!, ordenadas[i]!];
    if (b.indice > a.indice) passos.push(diasCorridos(a.vencimentoKey, b.vencimentoKey) / (b.indice - a.indice));
  }
  if (passos.length === 0) return { ok: false, motivo: "poucas" };
  passos.sort((x, y) => x - y);
  const mediana = passos[Math.floor(passos.length / 2)]!;
  const frequencia = mediana >= 20 && mediana <= 45 ? "MENSAL" : mediana >= 330 && mediana <= 400 ? "ANUAL" : null;
  if (!frequencia) return { ok: false, motivo: "sem_dia_do_mes" };

  const deslocamento = maisComum(ordenadas.filter((c) => ehCompetencia(c.competencia)).map((c) => indiceDoMes(c.vencimentoKey) - indiceDoMes(c.competencia!)));

  let ajuste: AjusteDoDia = "ADIAR";
  const fimDeSemana = (k: string) => [0, 6].includes(new Date(`${k}T00:00:00Z`).getUTCDay());
  if (ordenadas.some((c) => fimDeSemana(c.vencimentoKey))) ajuste = "MANTER";
  else {
    const diaDeSempre = maisComum(ordenadas.map((c) => Number(c.vencimentoKey.slice(8, 10))))!;
    let adiou = 0;
    let antecipou = 0;
    for (const c of ordenadas) {
      const bruto = chaveDoMes(mesDaConta(c, deslocamento), diaDeSempre);
      const d = diasCorridos(bruto, c.vencimentoKey);
      // Só o que o ajuste explica: até quatro dias (feriado emendado no fim de semana).
      if (d > 0 && d <= 4) adiou++;
      else if (d < 0 && d >= -4) antecipou++;
    }
    if (antecipou > adiou) ajuste = "ANTECIPAR";
  }
  return { ok: true, frequencia, ajuste, deslocamento };
}

/**
 * O mês da conta (índice ano × 12 + mês): o do vencimento, ou o da competência
 * mais o deslocamento da série quando o vencimento caiu no mês vizinho por uns
 * poucos dias — o ajuste do fim de semana, e não uma mudança de mês.
 */
function mesDaConta(c: ContaDaSerieAntiga, deslocamento: number | null): number {
  const doVencimento = indiceDoMes(c.vencimentoKey);
  if (deslocamento === null || !ehCompetencia(c.competencia)) return doVencimento;
  const pelaCompetencia = indiceDoMes(c.competencia) + deslocamento;
  if (pelaCompetencia === doVencimento || Math.abs(pelaCompetencia - doVencimento) > 1) return doVencimento;
  const borda = pelaCompetencia < doVencimento ? chaveDoMes(pelaCompetencia, 31) : chaveDoMes(pelaCompetencia, 1);
  return Math.abs(diasCorridos(borda, c.vencimentoKey)) <= 4 ? pelaCompetencia : doVencimento;
}

/** O vencimento novo da conta da série antiga: o mês dela, o dia novo (ou o último do mês) e o ajuste da série. */
export function vencimentoNaSerieAntiga(
  conta: ContaDaSerieAntiga,
  inferencia: Extract<InferenciaDaSerieAntiga, { ok: true }>,
  dia: number,
  feriados: ReadonlySet<string> = new Set()
): string {
  return ajustarDia(chaveDoMes(mesDaConta(conta, inferencia.deslocamento), dia), inferencia.ajuste, feriados);
}
