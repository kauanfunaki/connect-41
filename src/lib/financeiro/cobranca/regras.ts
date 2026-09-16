// A cobrança de um título a receber: em que situação ele está, qual a próxima
// ação, em que ordem a fila lê, e o que se valida ao registrar contato ou baixar
// por perda. Funções puras — a mesma leitura serve a fila, o detalhe, o selo de
// `/receber`, o portal e o cron da régua.
//
// ─── Situação derivada, não guardada ─────────────────────────────────────────
//
// Pelo mesmo motivo de `situacaoDaConta`: "vencido sem contato" deixa de ser
// verdade à meia-noite em que o título vence, e uma coluna precisaria de alguém
// rodando para continuar certa. Sai de status, motivo de encerramento, acordo,
// vencimento e último contato — todos já gravados.

import { dataValida } from "../periodo";

export type StatusDoLancamento = "PROVISORIO" | "CONFERIDO" | "PAGO" | "CANCELADO";
export type MotivoDeEncerramento = "CANCELADO" | "RENEGOCIADO" | "PERDA";
export type CanalDeContato = "TELEFONE" | "WHATSAPP" | "EMAIL" | "PRESENCIAL" | "OUTRO";
export type ResultadoDoContato = "SEM_RESPOSTA" | "PROMETEU_PAGAR" | "CONTESTOU" | "NEGOCIANDO" | "OUTRO";
export type StatusDoAcordo = "ATIVO" | "CUMPRIDO" | "QUEBRADO" | "DESFEITO";

export type SituacaoDeCobranca =
  | "EM_DIA"
  | "VENCIDO_SEM_CONTATO"
  | "EM_COBRANCA"
  | "PROMETEU_PAGAR"
  | "CONTESTADO"
  | "EM_ACORDO"
  | "PERDA";

export const ROTULO_DA_SITUACAO: Record<SituacaoDeCobranca, string> = {
  EM_DIA: "Em dia",
  VENCIDO_SEM_CONTATO: "Vencido sem contato",
  EM_COBRANCA: "Em cobrança",
  PROMETEU_PAGAR: "Prometeu pagar",
  CONTESTADO: "Contestado",
  EM_ACORDO: "Em acordo",
  PERDA: "Perda",
};

// Sem contato é `danger` porque é o que ninguém tocou ainda; contestado é
// `warning` porque espera decisão, não insistência.
export const VARIANTE_DA_SITUACAO: Record<SituacaoDeCobranca, "danger" | "warning" | "info" | "success"> = {
  EM_DIA: "success",
  VENCIDO_SEM_CONTATO: "danger",
  EM_COBRANCA: "warning",
  PROMETEU_PAGAR: "info",
  CONTESTADO: "warning",
  EM_ACORDO: "info",
  PERDA: "danger",
};

export const ROTULO_DO_CANAL: Record<CanalDeContato, string> = {
  TELEFONE: "Telefone",
  WHATSAPP: "WhatsApp",
  EMAIL: "E-mail",
  PRESENCIAL: "Presencial",
  OUTRO: "Outro",
};

export const ROTULO_DO_RESULTADO: Record<ResultadoDoContato, string> = {
  SEM_RESPOSTA: "Sem resposta",
  PROMETEU_PAGAR: "Prometeu pagar",
  CONTESTOU: "Contestou",
  NEGOCIANDO: "Negociando",
  OUTRO: "Outro",
};

export const ROTULO_DO_ACORDO: Record<StatusDoAcordo, string> = {
  ATIVO: "Ativo",
  CUMPRIDO: "Cumprido",
  QUEBRADO: "Quebrado",
  DESFEITO: "Desfeito",
};

export type UltimoContato = {
  resultado: ResultadoDoContato;
  contatoKey: string;
  proximaAcaoKey: string | null;
};

export type TituloParaCobranca = {
  status: StatusDoLancamento;
  closeReason: MotivoDeEncerramento | null;
  paidAt: Date | null;
  vencimentoKey: string;
  /** Status do acordo de que este título é **parcela**; `null` quando não é parcela. */
  statusDoAcordo: StatusDoAcordo | null;
  ultimoContato: UltimoContato | null;
};

/**
 * Situação de cobrança de um título, ou `null` quando ele não está em cobrança
 * (pago, ou cancelado comum).
 *
 * A ordem das perguntas é a regra:
 *
 * 1. **perda** ganha de tudo — é decisão tomada, e o título não volta à fila
 *    sem alguém reverter;
 * 2. **renegociado** é "em acordo": a dívida continua existindo, nas parcelas;
 * 3. **pago** e **cancelado comum** saem da cobrança;
 * 4. **parcela de acordo ativo** é "em acordo" mesmo vencida — quem cuida dela
 *    é o acordo, e marcá-lo como quebrado é o que a devolve à cobrança comum;
 * 5. **não vencido** está em dia — vence hoje ainda não custou nada, a mesma
 *    leitura de `situacaoDaConta`;
 * 6. vencido: o último contato diz o resto.
 */
export function situacaoDeCobranca(t: TituloParaCobranca, hojeKey: string): SituacaoDeCobranca | null {
  if (t.closeReason === "PERDA") return "PERDA";
  if (t.closeReason === "RENEGOCIADO") return "EM_ACORDO";
  if (t.status === "CANCELADO") return null;
  if (t.status === "PAGO" || t.paidAt !== null) return null;
  if (t.statusDoAcordo === "ATIVO") return "EM_ACORDO";
  if (t.vencimentoKey >= hojeKey) return "EM_DIA";
  const c = t.ultimoContato;
  if (!c) return "VENCIDO_SEM_CONTATO";
  if (c.resultado === "CONTESTOU") return "CONTESTADO";
  if (c.resultado === "PROMETEU_PAGAR") return "PROMETEU_PAGAR";
  return "EM_COBRANCA";
}

/**
 * O último contato de uma lista: o de data mais recente, e no mesmo dia o
 * registrado por último. Contato retroativo registrado hoje sobre anteontem
 * não passa na frente da ligação de ontem.
 */
export function ultimoDosContatos<T extends { contactedAt: Date; createdAt: Date }>(contatos: T[]): T | null {
  let ultimo: T | null = null;
  for (const c of contatos) {
    if (
      !ultimo ||
      c.contactedAt.getTime() > ultimo.contactedAt.getTime() ||
      (c.contactedAt.getTime() === ultimo.contactedAt.getTime() && c.createdAt.getTime() > ultimo.createdAt.getTime())
    ) {
      ultimo = c;
    }
  }
  return ultimo;
}

export type ProximaAcao = {
  /** Data agendada no último contato; `null` quando não há nada agendado. */
  quandoKey: string | null;
  /** Agendada para hoje ou para um dia que já passou — é trabalho de hoje. */
  paraHoje: boolean;
};

/**
 * A próxima ação é a que o último contato agendou — e só ela.
 *
 * "Vencido sem contato" não ganha uma data inventada de hoje: ele sobe na fila
 * pela prioridade. Inventar a data faria "próximas ações de hoje" encher com
 * todo título vencido da carteira, e a lista do topo deixaria de separar o que
 * alguém **combinou** fazer hoje.
 */
export function proximaAcao(t: Pick<TituloParaCobranca, "ultimoContato">, situacao: SituacaoDeCobranca | null, hojeKey: string): ProximaAcao {
  if (situacao === null || situacao === "PERDA") return { quandoKey: null, paraHoje: false };
  const quandoKey = t.ultimoContato?.proximaAcaoKey ?? null;
  return { quandoKey, paraHoje: quandoKey !== null && quandoKey <= hojeKey };
}

/**
 * Prioridade na fila — menor primeiro.
 *
 * 0. o que alguém combinou fazer hoje (ou devia ter feito) — é compromisso;
 * 1. vencido que ninguém tocou;
 * 2. em cobrança, ou promessa, sem próxima ação agendada — ficou solto;
 * 3. com próxima ação agendada para frente — já tem dono e data;
 * 4. contestado — espera decisão, não mais uma ligação;
 * 5. em acordo — quem cobra é o acordo;
 * 6. em dia.
 */
export function prioridadeNaFila(situacao: SituacaoDeCobranca, acao: ProximaAcao): number {
  if (situacao === "PERDA") return 9;
  if (acao.paraHoje) return 0;
  switch (situacao) {
    case "VENCIDO_SEM_CONTATO":
      return 1;
    case "EM_COBRANCA":
    case "PROMETEU_PAGAR":
      return acao.quandoKey ? 3 : 2;
    case "CONTESTADO":
      return 4;
    case "EM_ACORDO":
      return 5;
    case "EM_DIA":
      return 6;
  }
}

export type LinhaDaFila = { id: string; prioridade: number; diasDeAtraso: number; valorCentavos: number };

/**
 * A ordem da fila: prioridade, depois o mais atrasado, depois o maior valor.
 * Atraso antes de valor porque é o que diminui a chance de receber a cada dia.
 */
export function ordenarFila<T extends LinhaDaFila>(linhas: T[]): T[] {
  return [...linhas].sort(
    (a, b) =>
      a.prioridade - b.prioridade ||
      b.diasDeAtraso - a.diasDeAtraso ||
      b.valorCentavos - a.valorCentavos ||
      (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)
  );
}

// ─── Contato ────────────────────────────────────────────────────────────────

export const TAMANHO_MAXIMO_DA_ANOTACAO = 2000;

const CANAIS = new Set<string>(["TELEFONE", "WHATSAPP", "EMAIL", "PRESENCIAL", "OUTRO"]);
const RESULTADOS = new Set<string>(["SEM_RESPOSTA", "PROMETEU_PAGAR", "CONTESTOU", "NEGOCIANDO", "OUTRO"]);

export type ContatoValidado = {
  canal: CanalDeContato;
  resultado: ResultadoDoContato;
  contatoKey: string;
  proximaAcaoKey: string | null;
  notas: string | null;
};

export type Validacao<T> = { ok: true; dados: T } | { ok: false; erro: string };

/**
 * Os campos de um contato.
 *
 * - **data no futuro** é recusa: contato registra o que aconteceu. Agendar é a
 *   próxima ação;
 * - **próxima ação no passado** é recusa: agendar para ontem cria trabalho
 *   atrasado no momento em que nasce;
 * - **prometeu pagar sem data** é recusa: a data prometida é justamente o que a
 *   régua usa para não mandar lembrete a quem disse que paga na sexta.
 */
export function validarContato(
  campos: {
    canal: string | null | undefined;
    resultado: string | null | undefined;
    contatoEm: string | null | undefined;
    proximaAcao?: string | null;
    notas?: string | null;
  },
  hojeKey: string
): Validacao<ContatoValidado> {
  const canal = campos.canal ?? "";
  if (!CANAIS.has(canal)) return { ok: false, erro: "Escolha o canal do contato." };
  const resultado = campos.resultado ?? "";
  if (!RESULTADOS.has(resultado)) return { ok: false, erro: "Escolha o resultado do contato." };

  const contatoKey = dataValida(campos.contatoEm);
  if (!contatoKey) return { ok: false, erro: "Informe a data do contato." };
  if (contatoKey > hojeKey) return { ok: false, erro: "O contato não pode ter data futura — agende como próxima ação." };

  let proximaAcaoKey: string | null = null;
  if ((campos.proximaAcao ?? "").trim() !== "") {
    proximaAcaoKey = dataValida(campos.proximaAcao);
    if (!proximaAcaoKey) return { ok: false, erro: "Data da próxima ação inválida." };
    if (proximaAcaoKey < hojeKey) return { ok: false, erro: "A próxima ação não pode ser num dia que já passou." };
  }
  if (resultado === "PROMETEU_PAGAR" && !proximaAcaoKey) {
    return { ok: false, erro: "Prometeu pagar quando? Informe a data como próxima ação." };
  }

  const notas = (campos.notas ?? "").trim();
  if (notas.length > TAMANHO_MAXIMO_DA_ANOTACAO) {
    return { ok: false, erro: `Anotação com mais de ${TAMANHO_MAXIMO_DA_ANOTACAO} caracteres.` };
  }

  return {
    ok: true,
    dados: {
      canal: canal as CanalDeContato,
      resultado: resultado as ResultadoDoContato,
      contatoKey,
      proximaAcaoKey,
      notas: notas === "" ? null : notas,
    },
  };
}

// ─── Perda ──────────────────────────────────────────────────────────────────

export const TAMANHO_MAXIMO_DO_MOTIVO = 500;

export function validarMotivoDaPerda(texto: string | null | undefined): { ok: true; motivo: string } | { ok: false; erro: string } {
  const motivo = (texto ?? "").trim();
  if (motivo.length < 5) return { ok: false, erro: "Diga o motivo da baixa por perda." };
  if (motivo.length > TAMANHO_MAXIMO_DO_MOTIVO) return { ok: false, erro: `Motivo com mais de ${TAMANHO_MAXIMO_DO_MOTIVO} caracteres.` };
  return { ok: true, motivo };
}

export type Veredito = { pode: true } | { pode: false; motivo: string };

export type TituloParaPerda = {
  kind: "PAGAR" | "RECEBER";
  status: StatusDoLancamento;
  closeReason: MotivoDeEncerramento | null;
  paidAt: Date | null;
  vencimentoKey: string;
  statusDoAcordo: StatusDoAcordo | null;
};

/**
 * Baixar por perda: só título a receber, vencido e em aberto.
 *
 * Parcela de acordo **ativo** é recusa: a perda de uma parcela é o acordo
 * falhando, e isso se diz marcando o acordo como quebrado. Sem essa ordem, um
 * acordo continuaria "ativo" com uma parcela que nunca vai ser paga, e nunca
 * chegaria a cumprido.
 */
export function podeBaixarPorPerda(t: TituloParaPerda, hojeKey: string): Veredito {
  if (t.kind !== "RECEBER") return { pode: false, motivo: "Baixa por perda é só de conta a receber." };
  if (t.closeReason === "PERDA") return { pode: false, motivo: "Já está baixado por perda." };
  if (t.closeReason === "RENEGOCIADO") return { pode: false, motivo: "Título renegociado — a dívida está nas parcelas do acordo." };
  if (t.status === "CANCELADO") return { pode: false, motivo: "Lançamento cancelado." };
  if (t.status === "PAGO" || t.paidAt !== null) return { pode: false, motivo: "Título pago não é perda." };
  if (t.vencimentoKey >= hojeKey) return { pode: false, motivo: "Título ainda não vencido não é perda." };
  if (t.statusDoAcordo === "ATIVO") return { pode: false, motivo: "Parcela de acordo ativo — marque o acordo como quebrado antes." };
  return { pode: true };
}

export function podeReverterPerda(t: Pick<TituloParaPerda, "closeReason" | "status">): Veredito {
  if (t.closeReason !== "PERDA" || t.status !== "CANCELADO") return { pode: false, motivo: "Este título não está baixado por perda." };
  return { pode: true };
}

/**
 * Status para onde o título volta ao sair de um encerramento (perda revertida,
 * acordo desfeito). O guardado, quando é um status em aberto; senão
 * `CONFERIDO` — alguém já olhou este título, e é o mesmo destino de
 * `desfazerPagamento`.
 */
export function statusDeVolta(guardado: StatusDoLancamento | null): "PROVISORIO" | "CONFERIDO" {
  return guardado === "PROVISORIO" ? "PROVISORIO" : "CONFERIDO";
}
