// As regras do motor de processos, como funções puras.
//
// Separadas da escrita porque são elas que precisam de teste: qual etapa está
// liberada, quantas voltas o processo deu, se o prazo estourou. Nenhuma delas
// depende de banco, e todas saem do fluxograma que o setor montou — ver
// `docs/fluxos/societario.html`, que é a fonte, e não o protótipo.

export type EtapaDoRoteiro = {
  templateStepId: string;
  /// Posição no roteiro. **Etapas na mesma posição correm em paralelo** — é
  /// assim que a ramificação do alvará (Bombeiros, Meio Ambiente, Vigilância)
  /// é expressa, e `parallelGroup` só dá nome ao conjunto para a tela.
  position: number;
  parallelGroup: string | null;
  optional: boolean;
};

export type StatusDaEtapa = "PENDENTE" | "EM_ANDAMENTO" | "CONCLUIDA" | "DISPENSADA";

export type EtapaDaInstancia = {
  templateStepId: string;
  status: StatusDaEtapa;
};

/** Etapa encerrada para efeito de liberar o que vem depois. */
function encerrada(status: StatusDaEtapa): boolean {
  return status === "CONCLUIDA" || status === "DISPENSADA";
}

/**
 * Quais etapas podem ser trabalhadas agora.
 *
 * A regra é uma só: uma etapa está liberada quando **toda etapa de posição
 * menor está encerrada**. Etapas na mesma posição não se bloqueiam — e é por
 * isso que a ramificação do alvará não precisa de caso especial nenhum: as três
 * licenças nascem na mesma posição e as três ficam liberadas juntas.
 *
 * `DISPENSADA` conta como encerrada de propósito: a vistoria sanitária que não
 * se aplica não pode segurar o resto do processo para sempre.
 *
 * Etapa já encerrada não volta na lista — o que está feito não é trabalho
 * disponível.
 */
export function etapasLiberadas(
  roteiro: EtapaDoRoteiro[],
  instancia: EtapaDaInstancia[]
): string[] {
  const statusPor = new Map(instancia.map((e) => [e.templateStepId, e.status]));
  const statusDe = (id: string): StatusDaEtapa => statusPor.get(id) ?? "PENDENTE";

  // A menor posição que ainda tem etapa em aberto. Tudo acima dela está
  // bloqueado; tudo nela está liberado.
  let barreira = Infinity;
  for (const etapa of roteiro) {
    if (!encerrada(statusDe(etapa.templateStepId)) && etapa.position < barreira) {
      barreira = etapa.position;
    }
  }
  if (barreira === Infinity) return [];

  return roteiro
    .filter((e) => e.position === barreira && !encerrada(statusDe(e.templateStepId)))
    .map((e) => e.templateStepId);
}

export type Protocolo = {
  organId: string;
  attempt: number;
  outcome: "PENDENTE" | "DEFERIDO" | "EXIGENCIA";
};

/**
 * Quantas vezes este processo precisou voltar.
 *
 * A primeira apresentação a cada órgão não é volta — é o caminho normal. Volta
 * é da segunda em diante, e é o número que explica por que um prazo de 7 dias
 * virou trinta. **Sem ele, o prazo realizado é um número sem causa.**
 *
 * Conta por órgão porque um processo protocola em vários: duas voltas na Junta
 * e nenhuma na Receita é uma história diferente de uma em cada.
 */
export function voltasPorOrgao(protocolos: Protocolo[]): Map<string, number> {
  const maiorTentativa = new Map<string, number>();
  for (const p of protocolos) {
    const atual = maiorTentativa.get(p.organId) ?? 0;
    if (p.attempt > atual) maiorTentativa.set(p.organId, p.attempt);
  }
  const voltas = new Map<string, number>();
  for (const [organId, tentativas] of maiorTentativa) {
    voltas.set(organId, Math.max(0, tentativas - 1));
  }
  return voltas;
}

export function totalDeVoltas(protocolos: Protocolo[]): number {
  let total = 0;
  for (const v of voltasPorOrgao(protocolos).values()) total += v;
  return total;
}

/**
 * O próximo número de tentativa para um órgão.
 *
 * Reapresentar é abrir um protocolo novo, não editar o anterior: o histórico de
 * cada volta é o que se perde ao sobrescrever, e é justamente ele que interessa.
 */
export function proximaTentativa(protocolos: Protocolo[], organId: string): number {
  const doOrgao = protocolos.filter((p) => p.organId === organId);
  if (doOrgao.length === 0) return 1;
  return Math.max(...doOrgao.map((p) => p.attempt)) + 1;
}

export type SituacaoDoProcesso =
  | "EM_ANDAMENTO"
  | "AGUARDANDO_ORGAO"
  | "EM_EXIGENCIA"
  | "CONCLUIDO";

/**
 * Em que estado o processo está, derivado dos protocolos.
 *
 * Derivado, e não digitado: estado que alguém precisa lembrar de atualizar é
 * estado que mente. A precedência é a do fluxo — exigência ganha de espera,
 * porque exigência é trabalho parado esperando gente, e espera é trabalho
 * parado esperando órgão. Quem olha a fila precisa ver primeiro o que depende
 * dele.
 */
export function situacaoDoProcesso(
  protocolos: Protocolo[],
  concluido: boolean
): SituacaoDoProcesso {
  if (concluido) return "CONCLUIDO";
  if (protocolos.some((p) => p.outcome === "EXIGENCIA")) return "EM_EXIGENCIA";
  if (protocolos.some((p) => p.outcome === "PENDENTE")) return "AGUARDANDO_ORGAO";
  return "EM_ANDAMENTO";
}

export type PrevisaoDeTipo = {
  expectedDaysMin: number | null;
  expectedDaysMax: number | null;
  variableFlow: boolean;
};

export type Prazo = {
  dias: number;
  situacao: "sem_previsao" | "dentro" | "no_limite" | "estourado";
  previstoMin: number | null;
  previstoMax: number | null;
};

const UM_DIA = 24 * 60 * 60 * 1000;

/**
 * Previsto contra realizado.
 *
 * Os prazos vêm do setor, por tipo de processo: 4 a 7 dias na Constituição, 7 a
 * 15 na Alteração, 5 na Baixa. O alvará o próprio setor declara como **fluxo
 * variável, sem prazo médio** — e aí a tela não deve prometer previsão nenhuma,
 * porque prometer e não cumprir é pior que não prometer.
 *
 * ─── Uma pergunta em aberto ──────────────────────────────────────────────────
 *
 * Isto conta **dias corridos**. O setor pode querer dias úteis — o app já tem
 * cadastro de feriados (`/admin/feriados`), então dá para trocar sem drama; mas
 * é decisão do coordenador, não nossa, e chutar aqui faria todo processo
 * parecer mais atrasado do que está.
 */
export function prazoDoProcesso(
  tipo: PrevisaoDeTipo,
  processo: { startedAt: Date; concludedAt: Date | null },
  agora: Date
): Prazo {
  const fim = processo.concludedAt ?? agora;
  const dias = Math.max(0, Math.floor((fim.getTime() - processo.startedAt.getTime()) / UM_DIA));

  const previstoMin = tipo.expectedDaysMin;
  const previstoMax = tipo.expectedDaysMax;

  if (tipo.variableFlow || previstoMax === null) {
    return { dias, situacao: "sem_previsao", previstoMin, previstoMax };
  }
  if (dias > previstoMax) return { dias, situacao: "estourado", previstoMin, previstoMax };
  if (dias === previstoMax) return { dias, situacao: "no_limite", previstoMin, previstoMax };
  return { dias, situacao: "dentro", previstoMin, previstoMax };
}
