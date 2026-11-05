// Produtividade da Tech (05/11/2026, opção A da tela 7 escolhida pelo Kauan —
// "Time, fluxo e GitHub como contexto"). O Controle interno e as Entregas
// dizem o que vamos fazer e o que já fizemos; esta tela mede o time e a
// gestão dele. A unidade é a entrega validada pesada pelo tamanho (estudo 14,
// 04/11): commit, PR e token medem atividade e se inflam, e por isso o GitHub
// fica numa aba à parte, como contexto.
//
// Puro — testado em `produtividade.test.ts`; quem busca é `fluxoAberto`.

import { getPrisma } from "@/lib/prisma";
import { SITUACOES, TAMANHOS, type Alteracao } from "./regras";
import { entregasDoPeriodo, PERIODOS_DAS_ENTREGAS, type ItemEntregue, type MudancaParaEntregas, type PeriodoDasEntregas } from "./entregas";

const DIA_MS = 24 * 60 * 60 * 1000;
/** Sem mexer (situação, campo ou comentário) há mais disto, o item está parado. */
export const DIAS_PARADO = 5;
/** Brasília, sem horário de verão desde 2019: a semana começa na segunda daqui, não na de Greenwich. */
const FUSO_MS = -3 * 60 * 60 * 1000;

function mediana(valores: number[]): number | null {
  if (!valores.length) return null;
  const o = [...valores].sort((a, b) => a - b);
  const m = Math.floor(o.length / 2);
  return o.length % 2 ? o[m] : (o[m - 1] + o[m]) / 2;
}

// ─── Os quatro números do time ──────────────────────────────────────────────

export type ResumoDoTime = {
  pontos: number;
  entregas: number;
  validadas: number;
  /** Mediana do ciclo de cada entrega (do primeiro "Em andamento" ao "Concluído"), não a mediana das medianas. */
  cicloMedianoDias: number | null;
  /** Itens que vieram de uma entrega do período. */
  retrabalho: number;
  chamados: number;
  chamadosNoPrazo: number;
};

export function resumoDoTime(entregues: ItemEntregue[], chamados: { total: number; noPrazo: number }): ResumoDoTime {
  const ciclo = mediana(entregues.flatMap((e) => (e.cicloDias === null ? [] : [e.cicloDias])));
  return {
    pontos: entregues.reduce((s, e) => s + e.pontos, 0),
    entregas: entregues.length,
    validadas: entregues.filter((e) => e.validado).length,
    cicloMedianoDias: ciclo === null ? null : Math.round(ciclo * 10) / 10,
    retrabalho: entregues.reduce((s, e) => s + e.retrabalho, 0),
    chamados: chamados.total,
    chamadosNoPrazo: chamados.noPrazo,
  };
}

// ─── Pontos por semana, por pessoa ──────────────────────────────────────────

export type SemanaDePontos = {
  /** A segunda-feira, "AAAA-MM-DD". */
  chave: string;
  /** "06/10" — embaixo da coluna. */
  rotulo: string;
  /** "Semana de 06/10 a 12/10" — na dica e na tabela acessível. */
  rotuloLongo: string;
  /** Pontos da semana por pessoa (a chave da pessoa); quem não pontuou fica de fora. */
  porPessoa: Record<string, number>;
  total: number;
};
export type PessoaDoGrafico = { chave: string; nome: string; total: number };

/** A chave da pessoa nas contas: o id dela, ou "" para o que está sem responsável. */
export const chaveDaPessoa = (assigneeId: string | null) => assigneeId ?? "";

const diaLocal = (d: Date) => new Date(d.getTime() + FUSO_MS);
const iso = (d: Date) => d.toISOString().slice(0, 10);
const ddmm = (d: Date) => `${String(d.getUTCDate()).padStart(2, "0")}/${String(d.getUTCMonth() + 1).padStart(2, "0")}`;

/** A segunda-feira (em Brasília) da semana do instante, como data UTC à meia-noite. */
export function segundaDaSemana(d: Date): Date {
  const local = diaLocal(d);
  const dia = new Date(Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate()));
  const recuo = (dia.getUTCDay() + 6) % 7;
  return new Date(dia.getTime() - recuo * DIA_MS);
}

/**
 * Uma coluna por semana do período (de segunda a domingo, em Brasília), com os
 * pontos de cada pessoa. Só a entrega validada e com tamanho pontua — a mesma
 * regra do número de cima. As pessoas vêm por nome: a cor segue a pessoa, não
 * a posição dela no ranking.
 */
export function pontosPorSemana(entregues: ItemEntregue[], inicio: Date, fim: Date): { semanas: SemanaDePontos[]; pessoas: PessoaDoGrafico[] } {
  const semanas: SemanaDePontos[] = [];
  const indice = new Map<string, SemanaDePontos>();
  const ultima = segundaDaSemana(fim).getTime();
  for (let s = segundaDaSemana(inicio); s.getTime() <= ultima; s = new Date(s.getTime() + 7 * DIA_MS)) {
    const domingo = new Date(s.getTime() + 6 * DIA_MS);
    const semana = { chave: iso(s), rotulo: ddmm(s), rotuloLongo: `Semana de ${ddmm(s)} a ${ddmm(domingo)}`, porPessoa: {}, total: 0 };
    semanas.push(semana);
    indice.set(semana.chave, semana);
  }
  const pessoas = new Map<string, PessoaDoGrafico>();
  for (const e of entregues) {
    if (e.pontos <= 0) continue;
    const semana = indice.get(iso(segundaDaSemana(e.concluidoEm)));
    if (!semana) continue;
    const chave = chaveDaPessoa(e.assigneeId);
    semana.porPessoa[chave] = (semana.porPessoa[chave] ?? 0) + e.pontos;
    semana.total += e.pontos;
    const p = pessoas.get(chave) ?? { chave, nome: e.assigneeName, total: 0 };
    p.total += e.pontos;
    pessoas.set(chave, p);
  }
  return { semanas, pessoas: [...pessoas.values()].sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR")) };
}

// ─── Saúde do fluxo ─────────────────────────────────────────────────────────

/** Um item em aberto (Pendente, Em andamento ou Em validação), como a saúde do fluxo o lê. */
export type ItemAberto = {
  id: string;
  title: string;
  status: "PENDING" | "IN_PROGRESS" | "VALIDATION";
  size: keyof typeof TAMANHOS | null;
  assigneeId: string | null;
  assigneeName: string | null;
  createdAt: Date;
  /** A última mexida: edição, mudança de situação ou comentário. */
  ultimaMexidaEm: Date;
};

export type ItemDoFluxo = { id: string; title: string; status: ItemAberto["status"]; assigneeName: string; dias: number };

export type SaudeDoFluxo = {
  /** Em aberto sem tamanho; `comecados` são os que já saíram de Pendente (o tamanho trava ali). */
  semTamanho: { total: number; comecados: number; itens: ItemDoFluxo[] };
  /** Em andamento ou em validação sem mexer há mais de `DIAS_PARADO` dias. */
  parados: { total: number; itens: ItemDoFluxo[] };
  /** Em validação, com os dias desde que entrou nela. */
  esperandoValidacao: { total: number; maisAntigoDias: number | null; itens: ItemDoFluxo[] };
  /** Em andamento agora, por pessoa, do maior para o menor. */
  emAndamentoPorPessoa: { chave: string; nome: string; total: number }[];
  /** Voltas da validação por entrega do período (null sem entrega). */
  mediaDeVoltas: number | null;
  voltas: number;
  entregas: number;
};

/** Quando o item entrou na situação de agora: a última mudança de "Situação" para ela; sem histórico, a criação. */
export function entrouNaSituacao(item: Pick<ItemAberto, "id" | "status" | "createdAt">, mudancas: MudancaParaEntregas[]): Date {
  const rotulo = SITUACOES[item.status];
  let quando: Date | null = null;
  for (const m of mudancas) {
    if (m.itemId !== item.id) continue;
    if (m.changes.some((c) => c.field === "Situação" && c.after === rotulo) && (!quando || m.createdAt > quando)) quando = m.createdAt;
  }
  return quando ?? item.createdAt;
}

const diasEntre = (de: Date, ate: Date) => Math.max(0, Math.floor((ate.getTime() - de.getTime()) / DIA_MS));
const doMaisVelho = (a: ItemDoFluxo, b: ItemDoFluxo) => b.dias - a.dias || a.title.localeCompare(b.title, "pt-BR");

export function saudeDoFluxo(abertos: ItemAberto[], mudancas: MudancaParaEntregas[], entregues: ItemEntregue[], agora: Date): SaudeDoFluxo {
  const nome = (i: ItemAberto) => i.assigneeName ?? "Sem responsável";
  const semTamanho = abertos
    .filter((i) => !i.size)
    .map((i) => ({ id: i.id, title: i.title, status: i.status, assigneeName: nome(i), dias: diasEntre(i.createdAt, agora) }))
    .sort(doMaisVelho);
  const parados = abertos
    .filter((i) => i.status !== "PENDING" && diasEntre(i.ultimaMexidaEm, agora) > DIAS_PARADO)
    .map((i) => ({ id: i.id, title: i.title, status: i.status, assigneeName: nome(i), dias: diasEntre(i.ultimaMexidaEm, agora) }))
    .sort(doMaisVelho);
  const emValidacao = abertos
    .filter((i) => i.status === "VALIDATION")
    .map((i) => ({ id: i.id, title: i.title, status: i.status, assigneeName: nome(i), dias: diasEntre(entrouNaSituacao(i, mudancas), agora) }))
    .sort(doMaisVelho);
  const andamento = new Map<string, { chave: string; nome: string; total: number }>();
  for (const i of abertos) {
    if (i.status !== "IN_PROGRESS") continue;
    const chave = chaveDaPessoa(i.assigneeId);
    const l = andamento.get(chave) ?? { chave, nome: nome(i), total: 0 };
    l.total++;
    andamento.set(chave, l);
  }
  const voltas = entregues.reduce((s, e) => s + e.voltasDaValidacao, 0);
  return {
    semTamanho: { total: semTamanho.length, comecados: semTamanho.filter((i) => i.status !== "PENDING").length, itens: semTamanho },
    parados: { total: parados.length, itens: parados },
    esperandoValidacao: { total: emValidacao.length, maisAntigoDias: emValidacao[0]?.dias ?? null, itens: emValidacao },
    emAndamentoPorPessoa: [...andamento.values()].sort((a, b) => b.total - a.total || a.nome.localeCompare(b.nome, "pt-BR")),
    mediaDeVoltas: entregues.length ? Math.round((voltas / entregues.length) * 100) / 100 : null,
    voltas,
    entregas: entregues.length,
  };
}

/** Busca os itens em aberto com o histórico de situação e a última mexida de cada um. */
export async function fluxoAberto(tenantId: string): Promise<{ abertos: ItemAberto[]; mudancas: MudancaParaEntregas[] }> {
  const prisma = getPrisma();
  const itens = await prisma.techInternalItem.findMany({
    where: { tenantId, status: { in: ["PENDING", "IN_PROGRESS", "VALIDATION"] } },
    select: { id: true, title: true, status: true, size: true, assigneeId: true, createdAt: true, updatedAt: true, assignee: { select: { name: true } } },
    take: 2000,
  });
  const ids = itens.map((i) => i.id);
  if (!ids.length) return { abertos: [], mudancas: [] };
  const [mudancas, comentarios] = await Promise.all([
    prisma.techInternalChange.findMany({ where: { tenantId, itemId: { in: ids } }, select: { itemId: true, createdAt: true, changes: true } }),
    prisma.techInternalComment.groupBy({ by: ["itemId"], where: { tenantId, itemId: { in: ids } }, _max: { createdAt: true } }),
  ]);
  const ultimoComentario = new Map(comentarios.map((c) => [c.itemId, c._max.createdAt]));
  const ultimaMudanca = new Map<string, Date>();
  for (const m of mudancas) if (!ultimaMudanca.has(m.itemId) || m.createdAt > ultimaMudanca.get(m.itemId)!) ultimaMudanca.set(m.itemId, m.createdAt);
  const maisRecente = (...datas: (Date | null | undefined)[]) => new Date(Math.max(...datas.filter((d): d is Date => !!d).map((d) => d.getTime())));
  return {
    abertos: itens.map((i) => ({
      id: i.id,
      title: i.title,
      status: i.status as ItemAberto["status"],
      size: i.size,
      assigneeId: i.assigneeId,
      assigneeName: i.assignee?.name ?? null,
      createdAt: i.createdAt,
      ultimaMexidaEm: maisRecente(i.updatedAt, ultimaMudanca.get(i.id), ultimoComentario.get(i.id)),
    })),
    mudancas: mudancas.map((m) => ({ itemId: m.itemId, createdAt: m.createdAt, changes: (Array.isArray(m.changes) ? m.changes : []) as unknown as Alteracao[] })),
  };
}

// ─── Carga da tela ──────────────────────────────────────────────────────────

/** O período da URL (`?periodo=`), ou o trimestre corrente. */
export function lerPeriodo(bruto: string | string[] | undefined): PeriodoDasEntregas {
  return PERIODOS_DAS_ENTREGAS.some((p) => p.chave === bruto) ? (bruto as PeriodoDasEntregas) : "trimestre";
}

/** Tudo o que Time e Pessoas leem, numa ida só. */
export async function carregarProdutividade(tenantId: string, periodo: PeriodoDasEntregas, agora = new Date()) {
  const [entregas, fluxo] = await Promise.all([entregasDoPeriodo(tenantId, periodo, agora), fluxoAberto(tenantId)]);
  return {
    ...entregas,
    resumo: resumoDoTime(entregas.entregues, entregas.chamados),
    semanal: pontosPorSemana(entregas.entregues, entregas.inicio, entregas.fim),
    saude: saudeDoFluxo(fluxo.abertos, fluxo.mudancas, entregas.entregues, agora),
  };
}
