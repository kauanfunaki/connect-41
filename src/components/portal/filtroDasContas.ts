// O recorte da lista de Contas a pagar/receber do portal (P02, 11/11/2026):
// situação e mês de vencimento na URL, busca por texto na tela. Funções puras —
// o componente da lista (`ListaDeContasDoPortal`) só liga isto à tela.
//
// A lista já vem inteira do servidor (até 500 contas), então o recorte é feito
// no navegador, como o funil das colunas da tabela. A diferença é que este vale
// também para os cartões do celular, onde não há cabeçalho de coluna.

import type { SituacaoDaConta } from "@/lib/financeiro/contas";

/** O que vai em `?situacao=`. "aberto" junta vencida, vence hoje e a vencer — é o "Em aberto" do topo. */
export type SituacaoDoFiltro = "aberto" | "vencida" | "hoje" | "a_vencer" | "paga";

export type FiltroDasContas = {
  situacao: SituacaoDoFiltro | null;
  /** "AAAA-MM" do vencimento. */
  vencimento: string | null;
};

export const PARAMETRO_DA_SITUACAO = "situacao";
export const PARAMETRO_DO_VENCIMENTO = "vencimento";

const SITUACOES_DO_FILTRO: Record<SituacaoDoFiltro, SituacaoDaConta[]> = {
  aberto: ["VENCIDA", "VENCE_HOJE", "A_VENCER"],
  vencida: ["VENCIDA"],
  hoje: ["VENCE_HOJE"],
  a_vencer: ["A_VENCER"],
  paga: ["PAGA"],
};

/** As opções do seletor de situação, na ordem em que o cliente pensa: o que é urgente primeiro. */
export function opcoesDeSituacao(aPagar: boolean): { value: SituacaoDoFiltro; label: string }[] {
  return [
    { value: "aberto", label: "Em aberto" },
    { value: "vencida", label: "Vencidas" },
    { value: "hoje", label: "Vencem hoje" },
    { value: "a_vencer", label: "A vencer" },
    { value: "paga", label: aPagar ? "Pagas" : "Recebidas" },
  ];
}

function ehSituacao(v: string | null): v is SituacaoDoFiltro {
  return v !== null && Object.prototype.hasOwnProperty.call(SITUACOES_DO_FILTRO, v);
}

/** Lê o recorte da URL. Valor que não existe (endereço digitado à mão, link velho) vale como sem filtro. */
export function lerFiltro(params: { get(chave: string): string | null }): FiltroDasContas {
  const situacao = params.get(PARAMETRO_DA_SITUACAO);
  const vencimento = params.get(PARAMETRO_DO_VENCIMENTO);
  return {
    situacao: ehSituacao(situacao) ? situacao : null,
    vencimento: vencimento && /^\d{4}-\d{2}$/.test(vencimento) ? vencimento : null,
  };
}

/** Quantos filtros do painel estão ligados — o "(N)" do botão Filtros. */
export function filtrosAtivos(f: FiltroDasContas): number {
  return (f.situacao ? 1 : 0) + (f.vencimento ? 1 : 0);
}

/** Minúsculas e sem acento: "São" acha "sao", "AÇO" acha "aco". */
export function textoDeBusca(texto: string): string {
  return texto
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim();
}

export type ContaFiltravel = {
  situacao: SituacaoDaConta;
  vencimentoKey: string;
  contraparteNome: string;
  descricao: string | null;
  empresaNome: string;
  categoriaNome: string | null;
};

/**
 * A conta passa no recorte? A busca procura no fornecedor (ou cliente), na
 * descrição, na empresa e na categoria — o que aparece no cartão.
 */
export function passaNoFiltro(conta: ContaFiltravel, filtro: FiltroDasContas, busca = ""): boolean {
  if (filtro.situacao && !SITUACOES_DO_FILTRO[filtro.situacao].includes(conta.situacao)) return false;
  if (filtro.vencimento && !conta.vencimentoKey.startsWith(filtro.vencimento)) return false;
  const q = textoDeBusca(busca);
  if (!q) return true;
  const onde = [conta.contraparteNome, conta.descricao, conta.empresaNome, conta.categoriaNome].filter(Boolean).join(" ");
  return textoDeBusca(onde).includes(q);
}

/** Os meses de vencimento que a lista tem, do mais recente para o mais antigo — as opções do seletor. */
export function mesesDeVencimento(contas: { vencimentoKey: string }[]): string[] {
  return [...new Set(contas.map((c) => c.vencimentoKey.slice(0, 7)))].sort().reverse();
}

/**
 * O endereço com o recorte trocado, mantendo o resto da query. `null` tira o
 * parâmetro. Devolve só "?…" (ou o caminho, sem query): é o que o
 * `history.pushState` e o link do cartão do topo precisam.
 */
export function enderecoComFiltro(
  pathname: string,
  atual: { toString(): string },
  mudancas: Partial<Record<typeof PARAMETRO_DA_SITUACAO | typeof PARAMETRO_DO_VENCIMENTO, string | null>>
): string {
  const q = new URLSearchParams(atual.toString());
  for (const [chave, valor] of Object.entries(mudancas)) {
    if (valor) q.set(chave, valor);
    else q.delete(chave);
  }
  const s = q.toString();
  return s ? `${pathname}?${s}` : pathname;
}
