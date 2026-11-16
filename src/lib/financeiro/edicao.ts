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
  "retencoes",
] as const;

export type CampoEditavel = (typeof CAMPOS_EDITAVEIS)[number];

/** Campo travado → por quê. Campo fora do mapa está livre. */
export type Travas = Partial<Record<CampoEditavel, string>>;

/**
 * De onde vem uma trava (16/11/2026, melhoria-717). A janela "Editar" dizia o
 * motivo embaixo de cada campo, e a mesma frase aparecia em dois ou três
 * campos; agora diz cada motivo uma vez, no alto, com os campos que ele segura.
 */
export type ChaveDoMotivo =
  | "omie"
  | "omie_departamento"
  | "nota"
  | "acordo"
  | "retencao"
  | "fatura"
  | "conciliada"
  | "paga_e_conciliada"
  | "paga"
  | "baixa_parcial";

/** Um motivo de trava e os campos que ele segura, na ordem da janela. */
export type MotivoDaTrava = { chave: ChaveDoMotivo; campos: CampoEditavel[] };

export type ContaParaEditar = {
  status: "PROVISORIO" | "CONFERIDO" | "PAGO" | "CANCELADO";
  paidAt: Date | null;
  closeReason: "CANCELADO" | "RENEGOCIADO" | "PERDA" | null;
  fiscalDocumentId: string | null;
  agreementId: string | null;
  /** Título ou movimento que veio do Omie, numa empresa que ainda não virou para o Connect (lote E). */
  doOmie: boolean;
  /** O título do Omie tem um departamento só, e o centro vem dele (20/10). Só vale com `doOmie`. */
  centroDoOmie?: boolean;
  /** Ligada a uma linha do extrato — no Connect ou pelo Omie. */
  conciliada: boolean;
  /** Já tem baixa — total ou parcial (lote C). O valor do título fica preso ao que foi baixado. */
  temBaixa?: boolean;
  /** É a conta de um imposto retido de outra conta (lote D, 20/10). */
  deRetencao?: boolean;
  /** É a fatura de um cartão de crédito (lote D, 20/10). */
  daFatura?: boolean;
};

const DINHEIRO: CampoEditavel[] = ["valor", "vencimento"];
const DO_OMIE: CampoEditavel[] = ["valor", "vencimento", "competencia", "categoria", "emissao", "numeroDocumento", "previsao", "conta", "retencoes"];
const DA_NOTA: CampoEditavel[] = ["valor", "emissao", "numeroDocumento", "contraparte"];
const DO_ACORDO: CampoEditavel[] = ["valor", "vencimento", "contraparte"];

/** A ordem em que a janela "Editar" mostra os campos — a da lista do aviso. */
const ORDEM_NA_JANELA: CampoEditavel[] = [
  "contraparte",
  "categoria",
  "centro",
  "projeto",
  "competencia",
  "emissao",
  "numeroDocumento",
  "vencimento",
  "previsao",
  "valor",
  "conta",
  "descricao",
  "retencoes",
];

/**
 * O que pode mudar nesta conta. `pode: false` quando nada pode — a conta
 * encerrada por decisão; senão, as travas campo a campo (`travas`) e os mesmos
 * campos agrupados pelo motivo que os segura (`motivos`, 16/11/2026,
 * melhoria-717).
 *
 * A ordem importa quando duas regras travam o mesmo campo: vale a primeira,
 * que é a que diz o caminho mais curto (o Omie antes da baixa, porque desfazer
 * a baixa no Connect não adiantaria — a leitura seguinte refaz). O motivo que
 * perde todos os campos para um anterior não entra em `motivos`.
 */
export function travasDaEdicao(
  conta: ContaParaEditar
): { pode: false; motivo: string } | { pode: true; travas: Travas; motivos: MotivoDaTrava[] } {
  if (conta.closeReason === "RENEGOCIADO") return { pode: false, motivo: "Conta renegociada — o que vale agora são as parcelas do acordo." };
  if (conta.closeReason === "PERDA") return { pode: false, motivo: "Conta baixada por perda — reverta a perda na cobrança antes de editar." };
  if (conta.status === "CANCELADO") return { pode: false, motivo: "Conta cancelada não se edita." };

  const travas: Travas = {};
  const donos: Partial<Record<CampoEditavel, ChaveDoMotivo>> = {};
  const ordem: ChaveDoMotivo[] = [];
  const travar = (campos: CampoEditavel[], chave: ChaveDoMotivo, motivo: string) => {
    if (!ordem.includes(chave)) ordem.push(chave);
    for (const c of campos) {
      if (travas[c] !== undefined) continue;
      travas[c] = motivo;
      donos[c] = chave;
    }
  };

  const paga = conta.status === "PAGO" || conta.paidAt !== null;

  if (conta.doOmie) {
    travar(DO_OMIE, "omie", "Vem do Omie — altere lá. A próxima leitura traria de volta o que está no Omie.");
    // O centro só trava quando veio do departamento do título; sem
    // departamento no Omie, ele é classificação do Connect.
    if (conta.centroDoOmie) {
      travar(["centro"], "omie_departamento", "Vem do departamento do título no Omie — altere lá. O centro é o de mesmo nome ou código do departamento.");
    }
  }
  if (conta.fiscalDocumentId) {
    travar(DA_NOTA, "nota", "Vem da nota fiscal. Para corrigir o valor, estorne na ficha da nota.");
  }
  if (conta.agreementId) {
    travar(DO_ACORDO, "acordo", "Parcela de acordo — mude no acordo, na tela de cobrança.");
  }
  // A conta do imposto acompanha a retenção que a gerou: o valor e quem recebe
  // mudam lá, e imposto não retém imposto.
  if (conta.deRetencao) {
    travar(["valor", "contraparte", "retencoes"], "retencao", "Conta de imposto retido — valor e credor mudam na retenção, na edição da conta de origem.");
  }
  // A fatura do cartão é a soma das compras, a quem emitiu o cartão, fora da
  // DRE: o vencimento e a conta de onde sai mudam; o resto vem das compras.
  if (conta.daFatura) {
    travar(["valor", "contraparte", "categoria", "retencoes"], "fatura", "Fatura do cartão — o valor é a soma das compras; uma compra entra ou sai pela baixa da conta dela.");
  }
  // Paga e conciliada é um motivo só no aviso (16/11/2026, melhoria-717): o
  // caminho é o mesmo para o valor, o vencimento e a previsão. O texto de cada
  // campo continua o de antes, que o lote e a série mostram.
  if (conta.conciliada) {
    travar(DINHEIRO, paga ? "paga_e_conciliada" : "conciliada", "Conciliada com o extrato — desfaça a conciliação e o pagamento para mudar valor ou vencimento.");
  }
  if (paga) {
    travar(DINHEIRO, "paga", "Paga — desfaça o pagamento para mudar valor ou vencimento.");
    // A previsão diz quando o dinheiro vai andar; depois que andou, não diz nada.
    travar(["previsao"], conta.conciliada ? "paga_e_conciliada" : "paga", "Paga — a previsão é só de conta em aberto.");
  }
  // Baixa parcial: o vencimento do resto ainda muda; o valor, não — o saldo é
  // o valor menos o que foi baixado, e mudar um por baixo do outro o desfaria.
  if (conta.temBaixa) travar(["valor"], "baixa_parcial", "Tem baixa parcial — desfaça as baixas (⋯ › Pagamentos) para mudar o valor.");

  const motivos = ordem
    .map((chave) => ({ chave, campos: ORDEM_NA_JANELA.filter((c) => donos[c] === chave) }))
    .filter((m) => m.campos.length > 0);
  return { pode: true, travas, motivos };
}

// ─── O aviso da janela ──────────────────────────────────────────────────────

type TipoDaConta = "PAGAR" | "RECEBER";

/** O que a conta é (ou de onde vem) e o caminho para mudar, em frase curta. */
const TEXTO_DO_MOTIVO: Record<ChaveDoMotivo, (aPagar: boolean) => { causa: string; caminho: string }> = {
  omie: () => ({ causa: "Vem do Omie", caminho: "Altere no Omie: a próxima leitura traz para cá." }),
  omie_departamento: () => ({ causa: "Vem do departamento do Omie", caminho: "Troque o departamento do título no Omie." }),
  nota: () => ({ causa: "Vem da nota fiscal", caminho: "Para corrigir, estorne na ficha da nota." }),
  acordo: () => ({ causa: "Parcela de acordo", caminho: "Mude no acordo, na tela Cobrança." }),
  retencao: () => ({ causa: "Conta de imposto retido", caminho: "Mude na retenção, em “Editar” na conta de origem." }),
  fatura: () => ({ causa: "Fatura do cartão", caminho: "O valor é a soma das compras: uma compra entra ou sai pela baixa da conta dela." }),
  conciliada: (aPagar) => ({
    causa: "Conciliada com o extrato",
    caminho: `Desfaça a conciliação e o ${aPagar ? "pagamento" : "recebimento"} para alterar.`,
  }),
  paga_e_conciliada: (aPagar) => ({
    causa: `${aPagar ? "Paga" : "Recebida"} e conciliada com o extrato`,
    caminho: `Desfaça a conciliação e o ${aPagar ? "pagamento" : "recebimento"} para alterar.`,
  }),
  paga: (aPagar) => ({
    causa: aPagar ? "Paga" : "Recebida",
    caminho: aPagar
      ? "Desfaça o pagamento em Contas a pagar › “Ver baixa” para alterar."
      : "Desfaça o recebimento em Contas a receber › “Ver baixa” para alterar.",
  }),
  baixa_parcial: (aPagar) => ({
    causa: "Tem baixa parcial",
    caminho: `Desfaça as baixas em ⋯ › ${aPagar ? "Pagamentos" : "Recebimentos"} para alterar.`,
  }),
};

/** O nome do campo no meio da frase, como está no rótulo da janela. */
const NOME_DO_CAMPO: Record<CampoEditavel, (aPagar: boolean) => string> = {
  contraparte: (aPagar) => (aPagar ? "fornecedor" : "cliente"),
  categoria: () => "categoria",
  centro: () => "centro de custo",
  projeto: () => "projeto",
  conta: () => "conta corrente",
  competencia: () => "competência",
  emissao: () => "emissão",
  numeroDocumento: () => "nº do documento",
  vencimento: () => "vencimento",
  previsao: () => "previsão",
  valor: () => "valor",
  descricao: () => "descrição",
  retencoes: () => "retenções na fonte",
};

/** "valor", "vencimento e valor", "vencimento, previsão e valor". */
function listaLegivel(itens: string[]): string {
  if (itens.length <= 1) return itens.join("");
  return `${itens.slice(0, -1).join(", ")} e ${itens[itens.length - 1]}`;
}

/** Uma linha do aviso: `causa`: `naoMuda` `caminho`. */
export type LinhaDoAviso = {
  chave: ChaveDoMotivo;
  /** "Paga e conciliada com o extrato". */
  causa: string;
  /** Os campos da linha — o cadeado de cada um mostra a causa e o caminho dela. */
  campos: CampoEditavel[];
  /** "vencimento, previsão e valor não mudam." */
  naoMuda: string;
  /** "Desfaça a conciliação e o pagamento para alterar." */
  caminho: string;
};

/**
 * O aviso do alto da janela "Editar" (16/11/2026, melhoria-717): uma linha por
 * motivo, dizendo o que não muda e o caminho para mudar — no vocabulário de
 * quem paga ou de quem recebe. As retenções na fonte só existem na conta a
 * pagar; na conta a receber, saem da lista.
 */
export function avisoDasTravas(motivos: MotivoDaTrava[], kind: TipoDaConta): LinhaDoAviso[] {
  const aPagar = kind === "PAGAR";
  return motivos.flatMap((m) => {
    const campos = aPagar ? m.campos : m.campos.filter((c) => c !== "retencoes");
    if (campos.length === 0) return [];
    const nomes = listaLegivel(campos.map((c) => NOME_DO_CAMPO[c](aPagar)));
    return [{ chave: m.chave, campos, naoMuda: `${nomes} ${campos.length === 1 ? "não muda" : "não mudam"}.`, ...TEXTO_DO_MOTIVO[m.chave](aPagar) }];
  });
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
