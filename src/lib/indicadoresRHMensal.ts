// As contas mês a mês dos Indicadores de RH (05/11/2026, opção A da tela 9
// escolhida pelo Kauan: "4 números e um gráfico por tema"). Regra pura, sem
// banco — quem lê é `indicadoresRH.ts`.
//
// Não há tabela de histórico: cada série sai das datas que o cadastro já
// guarda (admissão e desligamento da pessoa, o dia da hora extra, o fim do
// período concessivo e a volta das férias, a etapa da candidatura). Os meses
// são os de São Paulo, como o resto do Connect (`diaDoRegistro`).

import { hojeIso, somarMeses } from "@/lib/datas/calendario";
import { diaDoRegistro } from "@/lib/colaboradores/resumoDaEmpresa";
import { contarFerias } from "@/lib/home/paineis";
import { stageIndex } from "@/lib/recruitmentFunnel";

/** Um mês, "AAAA-MM". */
export type Mes = string;

const MESES_CURTOS = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
const MESES_LONGOS = [
  "janeiro", "fevereiro", "março", "abril", "maio", "junho",
  "julho", "agosto", "setembro", "outubro", "novembro", "dezembro",
];

function mesDe(d: Date): Mes {
  return diaDoRegistro(d).slice(0, 7);
}

function partes(mes: Mes): { ano: number; mes: number } {
  return { ano: Number(mes.slice(0, 4)), mes: Number(mes.slice(5, 7)) };
}

function paraMes(p: { ano: number; mes: number }): Mes {
  return `${p.ano}-${String(p.mes).padStart(2, "0")}`;
}

/** Os `n` meses que terminam no mês de hoje (em São Paulo), do mais antigo ao atual. */
export function mesesDaJanela(agora: Date, n: number): Mes[] {
  const atual = partes(hojeIso(agora).slice(0, 7));
  return Array.from({ length: n }, (_, i) => paraMes(somarMeses(atual.ano, atual.mes, i - (n - 1))));
}

/**
 * O rótulo do mês no eixo: "nov". Sem o ano: com 12 meses no celular, cada
 * mês tem uns 26px e "jan 26" sairia cortado. O ano está no período escrito
 * acima dos gráficos ("dezembro de 2025 a novembro de 2026"), na dica e na
 * tabela acessível.
 */
export function rotuloDoMes(mes: Mes): string {
  return MESES_CURTOS[partes(mes).mes - 1];
}

/** "novembro de 2026" — a dica e a tabela acessível. */
export function mesPorExtenso(mes: Mes): string {
  const { ano, mes: m } = partes(mes);
  return `${MESES_LONGOS[m - 1]} de ${ano}`;
}

/** "setembro a novembro" — o período de uma janela curta, no título do gráfico. */
export function periodoDosMeses(meses: readonly Mes[]): string {
  if (meses.length === 0) return "";
  const nome = (mes: Mes) => MESES_LONGOS[partes(mes).mes - 1];
  const [primeiro, ultimo] = [meses[0], meses[meses.length - 1]];
  if (primeiro === ultimo) return nome(primeiro);
  const anos = primeiro.slice(0, 4) !== ultimo.slice(0, 4);
  return anos ? `${mesPorExtenso(primeiro)} a ${mesPorExtenso(ultimo)}` : `${nome(primeiro)} a ${nome(ultimo)}`;
}

/**
 * O último instante do mês em São Paulo. O Brasil não tem horário de verão
 * desde 2019: o mês seguinte começa à meia-noite de -03:00.
 */
export function fimDoMes(mes: Mes): Date {
  const { ano, mes: m } = partes(mes);
  const seguinte = paraMes(somarMeses(ano, m, 1));
  return new Date(new Date(`${seguinte}-01T00:00:00-03:00`).getTime() - 1);
}

// ─── Quadro: headcount, admissões e desligamentos ──────────────────────────

export type PessoaDoQuadro = {
  admissionDate: Date | null;
  dismissalDate: Date | null;
  active: boolean;
  employmentStatus: string;
};

export type MesDoQuadro = {
  mes: Mes;
  /** Quem estava no quadro no fim do mês (no mês atual, hoje). */
  headcount: number;
  admissoes: number;
  desligamentos: number;
};

/**
 * Está no quadro hoje: cadastro ativo e vínculo que não é "Desligado" — o
 * mesmo filtro do Headcount de antes desta tela, para o número não mudar.
 */
export function noQuadroHoje(p: Pick<PessoaDoQuadro, "active" | "employmentStatus">): boolean {
  return p.active && p.employmentStatus !== "DESLIGADO";
}

/**
 * O quadro mês a mês, reconstruído das datas do cadastro.
 *
 * - Quem está no quadro hoje conta desde o mês da admissão (sem data de
 *   admissão, desde sempre). A data de desligamento dessa pessoa é ignorada:
 *   se o vínculo segue ativo, ela não saiu. Admissão marcada para um mês
 *   adiante conta no mês atual, como no Headcount de hoje.
 * - Quem saiu conta da admissão até o mês do desligamento, exclusive — no fim
 *   do mês em que saiu, já não está. Desligamento com data adiante, de quem
 *   já está "Desligado", conta no mês atual.
 * - Quem não está no quadro e não tem data de desligamento fica de fora: não
 *   dá para saber quando saiu (é a admissão que não foi adiante, ou o cadastro
 *   arquivado).
 *
 * Assim o último ponto é o Headcount de hoje, e a linha só muda de um mês
 * para o outro pelo que as colunas de admissão e desligamento mostram.
 */
export function quadroMensal(pessoas: readonly PessoaDoQuadro[], meses: readonly Mes[]): MesDoQuadro[] {
  const atual = meses[meses.length - 1];
  const linhas = meses.map((mes) => ({ mes, headcount: 0, admissoes: 0, desligamentos: 0 }));
  const indice = new Map(meses.map((m, i) => [m, i]));

  for (const p of pessoas) {
    const hoje = noQuadroHoje(p);
    if (!hoje && !p.dismissalDate) continue;
    const admissao = p.admissionDate ? mesDe(p.admissionDate) : null;
    const entrada = admissao === null ? null : admissao > atual ? atual : admissao;
    const saidaReal = !hoje && p.dismissalDate ? mesDe(p.dismissalDate) : null;
    const saida = saidaReal === null ? null : saidaReal > atual ? atual : saidaReal;
    if (entrada !== null && saida !== null && saida < entrada) continue;

    for (const l of linhas) {
      const entrou = entrada === null || entrada <= l.mes;
      const ficou = saida === null || l.mes < saida;
      if (entrou && ficou) l.headcount++;
    }
    if (admissao !== null && admissao <= atual) {
      const i = indice.get(admissao);
      if (i !== undefined) linhas[i].admissoes++;
    }
    if (saida !== null) {
      const i = indice.get(saida);
      if (i !== undefined) linhas[i].desligamentos++;
    }
  }
  return linhas;
}

/** Quanto o quadro mudou nos últimos `meses` meses: o de hoje menos o do fim do mês de `meses` atrás. */
export function variacaoDoQuadro(quadro: readonly MesDoQuadro[], meses: number): number | null {
  if (quadro.length <= meses) return null;
  return quadro[quadro.length - 1].headcount - quadro[quadro.length - 1 - meses].headcount;
}

/**
 * Turnover do período, em %: os desligamentos dos meses dividido pelo
 * headcount médio (a média dos fins de mês). Era "demissões dos últimos 30
 * dias ÷ headcount de hoje", que num escritório pequeno pulava de 0 a 10% de
 * um mês para o outro. Sem ninguém no quadro, não há o que dividir.
 */
export function turnover(quadro: readonly MesDoQuadro[]): number | null {
  if (quadro.length === 0) return null;
  const medio = quadro.reduce((s, m) => s + m.headcount, 0) / quadro.length;
  if (medio === 0) return null;
  const saidas = quadro.reduce((s, m) => s + m.desligamentos, 0);
  return (saidas / medio) * 100;
}

// ─── Férias ────────────────────────────────────────────────────────────────

export type FeriasDoHistorico = {
  concessivePeriodEnd: Date | null;
  status: string;
  returnDate: Date | null;
  updatedAt: Date;
};

export type MesDasFerias = { mes: Mes; vencidas: number; aVencer: number };

/**
 * Se as férias estavam em aberto num instante. Em aberto hoje (planejada a
 * em gozo) estava em aberto antes também. Concluída estava em aberto até a
 * volta (sem a volta lançada, até a última alteração do registro). Cancelada
 * fica de fora: não se sabe quando foi cancelada.
 */
function emAbertoEm(f: FeriasDoHistorico, ref: Date, agora: Date): boolean {
  if (f.status === "CANCELADA") return false;
  if (f.status !== "CONCLUIDA") return true;
  if (ref.getTime() >= agora.getTime()) return false;
  return (f.returnDate ?? f.updatedAt).getTime() > ref.getTime();
}

/**
 * Vencidas e a vencer no fim de cada mês, com a regra de `contarFerias` (a da
 * Home e de /indicadores-rh/ferias). O mês atual é contado hoje, e não no fim
 * do mês: é o mesmo número das outras telas.
 */
export function feriasMensais(ferias: readonly FeriasDoHistorico[], meses: readonly Mes[], agora: Date): MesDasFerias[] {
  const atual = meses[meses.length - 1];
  return meses.map((mes) => {
    const ref = mes === atual ? agora : fimDoMes(mes);
    const c = contarFerias(ferias.filter((f) => emAbertoEm(f, ref, agora)), ref);
    return { mes, vencidas: c.vencidas, aVencer: c.aVencer };
  });
}

// ─── Horas extras ──────────────────────────────────────────────────────────

export type HorasDoDia = { date: Date; horas: number };

/** As horas extras somadas por mês (o dia do lançamento, em São Paulo). */
export function horasExtrasMensais(dias: readonly HorasDoDia[], meses: readonly Mes[]): { mes: Mes; horas: number }[] {
  const soma = new Map(meses.map((m) => [m, 0]));
  for (const d of dias) {
    const mes = mesDe(d.date);
    const atual = soma.get(mes);
    if (atual !== undefined) soma.set(mes, atual + d.horas);
  }
  return meses.map((mes) => ({ mes, horas: Math.round((soma.get(mes) ?? 0) * 10) / 10 }));
}

// ─── Absenteísmo ───────────────────────────────────────────────────────────

/** Os dias úteis (segunda a sexta, sem contar feriado) dos últimos `dias` dias até hoje, em São Paulo. */
export function diasUteisDosUltimos(agora: Date, dias: number): number {
  const [a, m, d] = hojeIso(agora).split("-").map(Number);
  let uteis = 0;
  for (let i = 0; i < dias; i++) {
    const semana = new Date(Date.UTC(a, m - 1, d - i)).getUTCDay();
    if (semana !== 0 && semana !== 6) uteis++;
  }
  return uteis;
}

/**
 * Absenteísmo, em %: os dias perdidos lançados nos afastamentos sobre os dias
 * de trabalho do quadro no período (headcount × dias úteis). O campo "Dias
 * perdidos" do afastamento é preenchido em dias de trabalho.
 */
export function absenteismo(diasPerdidos: number, headcount: number, diasUteis: number): number | null {
  const previstos = headcount * diasUteis;
  return previstos > 0 ? (diasPerdidos / previstos) * 100 : null;
}

// ─── Recrutamento ──────────────────────────────────────────────────────────

export type CandidaturaDoFunil = { stage: string; status: string };

export type EtapaDoFunil = { chave: string; rotulo: string; valor: number };

/**
 * O funil das candidaturas do período, na ordem que o Kauan pediu:
 * candidaturas → triadas → entrevista → proposta → contratados.
 *
 * Toda candidatura nasce na etapa Triagem, então "chegou à triagem" seria o
 * total de novo. "Triadas" é quem já saiu da triagem — avançou, foi reprovada
 * ou desistiu ali; a passagem de "Triadas" para "Entrevista" é a aprovação na
 * triagem. As outras são "chegou a esta etapa ou além", como no funil da Home
 * (`computeFunnelConversion`): a etapa é guardada mesmo de quem foi
 * reprovado. A etapa Teste fica de fora do desenho. Contratada pelo status e
 * não pela etapa conta como tendo passado por todas.
 */
export function funilDoPeriodo(candidaturas: readonly CandidaturaDoFunil[]): EtapaDoFunil[] {
  const ENTREVISTA = stageIndex("ENTREVISTA");
  const PROPOSTA = stageIndex("PROPOSTA");
  const CONTRATADO = stageIndex("CONTRATADO");
  const c = { total: 0, triadas: 0, entrevista: 0, proposta: 0, contratados: 0 };
  for (const x of candidaturas) {
    const nivel = x.status === "CONTRATADO" ? CONTRATADO : stageIndex(x.stage);
    c.total++;
    if (nivel > 0 || x.status !== "EM_ANDAMENTO") c.triadas++;
    if (nivel >= ENTREVISTA) c.entrevista++;
    if (nivel >= PROPOSTA) c.proposta++;
    if (nivel >= CONTRATADO) c.contratados++;
  }
  return [
    { chave: "candidaturas", rotulo: "Candidaturas", valor: c.total },
    { chave: "triadas", rotulo: "Triadas", valor: c.triadas },
    { chave: "entrevista", rotulo: "Entrevista", valor: c.entrevista },
    { chave: "proposta", rotulo: "Proposta", valor: c.proposta },
    { chave: "contratados", rotulo: "Contratados", valor: c.contratados },
  ];
}

/** Dias, em média, entre a candidatura e a contratação. Sem contratação com data, `null`. */
export function tempoMedioDeContratacao(contratadas: readonly { createdAt: Date; hiredAt: Date | null }[]): number | null {
  const comData = contratadas.filter((c): c is { createdAt: Date; hiredAt: Date } => c.hiredAt !== null);
  if (comData.length === 0) return null;
  const total = comData.reduce((s, c) => s + (c.hiredAt.getTime() - c.createdAt.getTime()), 0);
  return Math.round(total / comData.length / 86_400_000);
}
