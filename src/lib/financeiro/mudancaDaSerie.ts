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
