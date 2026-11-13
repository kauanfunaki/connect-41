// A linha de Contas a pagar e a receber como vai para o navegador (13/11/2026).
//
// Até aqui a tabela era desenhada no servidor, e cada conta ia duas vezes —
// a linha da tabela e o cartão do celular —, com as classes, os ícones e as
// props das ações repetidos em cada uma: cerca de 4,3 KB de RSC por conta.
// Agora vai o dado, uma vez, e a tabela (componente de cliente) desenha as
// duas formas. Só vai o que a tabela mostra, sem os campos vazios: o RSC
// escreve `null` e `"$undefined"` por extenso, e numa lista isso se repete.
//
// Funções puras: servem ao servidor (que monta) e ao navegador (que lê).

import type { SituacaoDaConta } from "./contas";
import type { SituacaoDeCobranca } from "./cobranca/regras";
import type { LinhaDaConta } from "./data";

export type LinhaDaTela = {
  id: string;
  situacao: SituacaoDaConta;
  valorCentavos: number;
  /** O dia do vencimento em São Paulo, "AAAA-MM-DD" — o mesmo de `vencimentoKey`. */
  vencimento: string;
  /** A data de previsão, quando há e a conta não está paga. */
  previsao?: string;
  pagoEm?: string;
  competencia: string;
  descricao?: string;
  /** A empresa, só na lista de todas — com uma escolhida, repetiria o nome em toda linha. */
  empresa?: string;
  contraparte: string;
  categoria?: string;
  rateio?: number;
  retidoCentavos?: number;
  status: LinhaDaConta["status"];
  /** A aprovação por alçada, quando a conta passa por ela. */
  aprovacao?: Exclude<LinhaDaConta["approvalStatus"], "NAO_REQUER">;
  documentoId?: string;
  fechamento?: NonNullable<LinhaDaConta["closeReason"]>;
  parcelaDeAcordo?: true;
  /** O centro, só quando a tela mostra a coluna. */
  centro?: string;
  projeto?: string;
  baixadoCentavos?: number;
  numeroDocumento?: string;
  emissao?: string;
  presaAoOmie?: true;
  serie?: string;
  /** A situação na cobrança, quando o módulo está ligado e o título está nela. */
  cobranca?: SituacaoDeCobranca;
};

/** O que a tela pede de cada linha. */
export type OpcoesDaLinhaDaTela = {
  /** O dia de um instante em São Paulo — do servidor, para não depender do fuso do navegador. */
  diaDe: (d: Date) => string;
  mostrarEmpresa: boolean;
  mostrarCentro: boolean;
  cobranca?: SituacaoDeCobranca | null;
};

/** A conta como a tabela lê: só o que ela mostra, e sem os campos vazios. */
export function linhaDaTela(l: LinhaDaConta, o: OpcoesDaLinhaDaTela): LinhaDaTela {
  const linha: LinhaDaTela = {
    id: l.id,
    situacao: l.situacao,
    valorCentavos: l.valorCentavos,
    vencimento: l.vencimentoKey,
    competencia: l.competencia,
    contraparte: l.contraparteNome,
    status: l.status,
  };
  if (l.previsao && !l.pagoEm) linha.previsao = o.diaDe(l.previsao);
  if (l.pagoEm) linha.pagoEm = o.diaDe(l.pagoEm);
  if (l.descricao) linha.descricao = l.descricao;
  if (o.mostrarEmpresa) linha.empresa = l.empresaNome;
  if (l.categoriaNome) linha.categoria = l.categoriaNome;
  if (l.rateio) linha.rateio = l.rateio;
  if (l.retidoCentavos) linha.retidoCentavos = l.retidoCentavos;
  if (l.approvalStatus !== "NAO_REQUER") linha.aprovacao = l.approvalStatus;
  if (l.documentoId) linha.documentoId = l.documentoId;
  if (l.closeReason) linha.fechamento = l.closeReason;
  if (l.parcelaDeAcordo) linha.parcelaDeAcordo = true;
  if (o.mostrarCentro && l.centroDeCustoNome) linha.centro = l.centroDeCustoNome;
  if (l.projetoNome) linha.projeto = l.projetoNome;
  if (l.baixadoCentavos) linha.baixadoCentavos = l.baixadoCentavos;
  if (l.numeroDocumento) linha.numeroDocumento = l.numeroDocumento;
  if (l.emissao) linha.emissao = o.diaDe(l.emissao);
  if (l.presaAoOmie) linha.presaAoOmie = true;
  if (l.serie) linha.serie = l.serie;
  // "Em dia" também vai: o título na cobrança tira o "parcela de acordo" da linha.
  if (o.cobranca) linha.cobranca = o.cobranca;
  return linha;
}
