// Editar um lançamento (19/10, pedido 1 do BPO: "ajustar o lançamento depois
// de conciliado/pago"). Funções puras, sem banco.
//
// Até aqui não havia edição em estado nenhum — só cancelar e lançar de novo, ou
// estornar na nota. A regra agora é por campo:
//
// - **classificação** (categoria, centro, projeto, descrição, número do
//   documento, emissão, competência, contraparte) muda sempre, inclusive
//   depois de pago e conciliado — não mexe no dinheiro;
// - **dinheiro** (valor e vencimento) muda só em aberto. Depois de pago, o
//   valor que andou é o da baixa, e a baixa se corrige desfazendo e refazendo
//   — o mesmo motivo de `desfazerPagamento`: a data e o valor da baixa são o
//   que a conciliação casa com o extrato. Conciliada, é preciso desconciliar
//   antes; o Omie faz igual;
// - **origem** trava o que pertence a ela: a nota (valor, emissão, número e
//   contraparte), o acordo de cobrança (valor, vencimento e contraparte da
//   parcela) e o Omie, enquanto a empresa é lida de lá — o que a leitura
//   reescreve (valor, vencimento, competência, categoria, emissão, número e,
//   desde 20/10, previsão e conta corrente prevista) voltaria ao do Omie na
//   leitura seguinte.
//
// Cada trava diz o porquê e o caminho. Ninguém edita conta cancelada,
// renegociada ou baixada por perda: o caminho é desfazer o que a encerrou.

export const CAMPOS_EDITAVEIS = [
  "contraparte",
  "categoria",
  "centro",
  "projeto",
  "conta",
  "competencia",
  "emissao",
  "numeroDocumento",
  "vencimento",
  "previsao",
  "valor",
  "descricao",
] as const;

export type CampoEditavel = (typeof CAMPOS_EDITAVEIS)[number];

/** Campo travado → por quê. Campo fora do mapa está livre. */
export type Travas = Partial<Record<CampoEditavel, string>>;

export type ContaParaEditar = {
  status: "PROVISORIO" | "CONFERIDO" | "PAGO" | "CANCELADO";
  paidAt: Date | null;
  closeReason: "CANCELADO" | "RENEGOCIADO" | "PERDA" | null;
  fiscalDocumentId: string | null;
  agreementId: string | null;
  /** Título ou movimento que veio do Omie, numa empresa que ainda não virou para o Connect (lote E). */
  doOmie: boolean;
  /** Ligada a uma linha do extrato — no Connect ou pelo Omie. */
  conciliada: boolean;
  /** Já tem baixa — total ou parcial (lote C). O valor do título fica preso ao que foi baixado. */
  temBaixa?: boolean;
};

const DINHEIRO: CampoEditavel[] = ["valor", "vencimento"];
const DO_OMIE: CampoEditavel[] = ["valor", "vencimento", "competencia", "categoria", "emissao", "numeroDocumento", "previsao", "conta"];
const DA_NOTA: CampoEditavel[] = ["valor", "emissao", "numeroDocumento", "contraparte"];
const DO_ACORDO: CampoEditavel[] = ["valor", "vencimento", "contraparte"];

/**
 * O que pode mudar nesta conta. `pode: false` quando nada pode — a conta
 * encerrada por decisão; senão, as travas campo a campo.
 *
 * A ordem importa quando duas regras travam o mesmo campo: vale a primeira,
 * que é a que diz o caminho mais curto (o Omie antes da baixa, porque desfazer
 * a baixa no Connect não adiantaria — a leitura seguinte refaz).
 */
export function travasDaEdicao(conta: ContaParaEditar): { pode: false; motivo: string } | { pode: true; travas: Travas } {
  if (conta.closeReason === "RENEGOCIADO") return { pode: false, motivo: "Conta renegociada — o que vale agora são as parcelas do acordo." };
  if (conta.closeReason === "PERDA") return { pode: false, motivo: "Conta baixada por perda — reverta a perda na cobrança antes de editar." };
  if (conta.status === "CANCELADO") return { pode: false, motivo: "Conta cancelada não se edita." };

  const travas: Travas = {};
  const travar = (campos: CampoEditavel[], motivo: string) => {
    for (const c of campos) travas[c] ??= motivo;
  };

  if (conta.doOmie) {
    travar(DO_OMIE, "Vem do Omie — altere lá. A próxima leitura traria de volta o que está no Omie.");
  }
  if (conta.fiscalDocumentId) {
    travar(DA_NOTA, "Vem da nota fiscal. Para corrigir o valor, estorne na ficha da nota.");
  }
  if (conta.agreementId) {
    travar(DO_ACORDO, "Parcela de acordo — mude no acordo, na tela de cobrança.");
  }
  if (conta.conciliada) {
    travar(DINHEIRO, "Conciliada com o extrato — desfaça a conciliação e o pagamento para mudar valor ou vencimento.");
  }
  if (conta.status === "PAGO" || conta.paidAt !== null) {
    travar(DINHEIRO, "Paga — desfaça o pagamento para mudar valor ou vencimento.");
    // A previsão diz quando o dinheiro vai andar; depois que andou, não diz nada.
    travar(["previsao"], "Paga — a previsão é só de conta em aberto.");
  }
  // Baixa parcial: o vencimento do resto ainda muda; o valor, não — o saldo é
  // o valor menos o que foi baixado, e mudar um por baixo do outro o desfaria.
  if (conta.temBaixa) travar(["valor"], "Tem baixa parcial — desfaça as baixas (⋯ › Pagamentos) para mudar o valor.");
  return { pode: true, travas };
}

/**
 * A aprovação depois da edição. A aprovação vale para **um valor a um
 * fornecedor**: conta aprovada que muda de valor ou de fornecedor volta para a
 * fila — senão "aprovada" passaria a dizer de um pagamento que ninguém
 * aprovou. Aguardando continua aguardando (quem decide vê o valor novo);
 * reprovada continua reprovada (a equipe reenvia quando quiser).
 *
 * `entraria`: a conta, se nascesse agora, entraria em aprovação
 * (`statusInicial` da entrada) — com o módulo desligado ou a empresa sem
 * alçada, ninguém aprovaria, e a conta ficaria presa.
 */
export function aprovacaoDepoisDaEdicao(p: {
  kind: "PAGAR" | "RECEBER";
  approvalStatus: "NAO_REQUER" | "AGUARDANDO" | "APROVADO" | "REPROVADO";
  mudouValor: boolean;
  mudouContraparte: boolean;
  entraria: boolean;
}): "MANTEM" | "REENVIAR" {
  if (p.kind !== "PAGAR" || p.approvalStatus !== "APROVADO") return "MANTEM";
  if (!p.mudouValor && !p.mudouContraparte) return "MANTEM";
  return p.entraria ? "REENVIAR" : "MANTEM";
}
