// A data de conclusão dos itens que vieram do Quadro do Obsidian (05/11/2026).
//
// O registro de tarefas da Tech morava no Quadro.md do vault e foi trazido para
// o Controle interno pelo MCP do Connect. Os itens já concluídos lá nascem aqui
// como Concluído, e o histórico grava a conclusão no momento da criação: sem
// correção, as Entregas e a Produtividade contariam agosto a outubro inteiros
// como entregues no dia da importação.
//
// Cada item importado traz na descrição a origem e, se estava concluído, o dia
// em que o Quadro o deu por feito:
//
//   Veio do Quadro do Obsidian: seção "…", linha N. …
//   Concluído no Quadro em 28/10/2026.
//
// O script `scripts/datar-itens-do-quadro.ts` lê essa marca e leva para esse
// dia a criação do item e a mudança do histórico que o concluiu. Aqui fica só a
// regra — o que muda e o que fica de fora —, sem banco.

import { SITUACOES } from "./regras";

export const MARCA_DO_QUADRO = "Veio do Quadro do Obsidian";
const DATA_NO_QUADRO = /Concluído no Quadro em (\d{2})\/(\d{2})\/(\d{4})/;

/** O dia que a descrição diz (AAAA-MM-DD), ou null sem a marca ou com data impossível. */
export function diaDaConclusaoNoQuadro(descricao: string | null): string | null {
  if (!descricao?.includes(MARCA_DO_QUADRO)) return null;
  const m = DATA_NO_QUADRO.exec(descricao);
  if (!m) return null;
  const [, d, mes, ano] = m;
  const dia = `${ano}-${mes}-${d}`;
  const t = new Date(`${dia}T12:00:00-03:00`);
  // 31/02 vira 03/03 no Date: a volta tem de dar o mesmo dia.
  return Number.isNaN(t.getTime()) || t.toISOString().slice(0, 10) !== dia ? null : dia;
}

/**
 * Meio-dia em São Paulo: longe da virada do dia em qualquer fuso, então a
 * semana e o mês das Entregas são os do dia escrito no Quadro.
 */
export function momentoDoDia(dia: string): Date {
  return new Date(`${dia}T12:00:00-03:00`);
}

type Alteracao = { field: string; before: string | null; after: string | null };
export type MudancaLida = { id: string; version: number; createdAt: Date; changes: unknown };
export type ItemLido = {
  id: string;
  title: string;
  status: string;
  version: number;
  description: string | null;
  createdAt: Date;
  updatedAt: Date;
  changes: MudancaLida[];
};

export type Datacao = {
  id: string;
  title: string;
  dia: string;
  para: Date;
  /** A leitura, para a gravação conferir que nada mudou no meio. */
  criadoEm: Date;
  atualizadoEm: Date;
  /** A mudança do histórico que concluiu (a da criação) e a data dela. */
  mudancaId: string;
  mudancaEm: Date;
  /** Sem edição depois da criação: a "última mexida" também vai para o dia. */
  levaAtualizacao: boolean;
};
export type Pulado = { id: string; title: string; motivo: string };

const alteracoes = (m: MudancaLida): Alteracao[] => (Array.isArray(m.changes) ? (m.changes as Alteracao[]) : []);
const mexeNaSituacao = (m: MudancaLida) => alteracoes(m).some((c) => c.field === "Situação");

/**
 * Separa o que pode ser datado do que fica como está. Só data quando o item
 * nasceu concluído e a situação nunca mais mudou: aí a única conclusão do
 * histórico é a da criação, e levá-la para o dia do Quadro não reescreve nada
 * que alguém tenha feito no Connect.
 */
export function planejarDatas(itens: ItemLido[], agora = new Date()): { datar: Datacao[]; pular: Pulado[]; jaDatados: number } {
  const datar: Datacao[] = [];
  const pular: Pulado[] = [];
  let jaDatados = 0;
  for (const item of itens) {
    const fora = (motivo: string) => pular.push({ id: item.id, title: item.title, motivo });
    if (!item.description?.includes(MARCA_DO_QUADRO)) continue;
    if (item.status !== "DONE") {
      if (DATA_NO_QUADRO.test(item.description)) fora(`está ${SITUACOES[item.status as keyof typeof SITUACOES] ?? item.status} no Connect`);
      continue;
    }
    const dia = diaDaConclusaoNoQuadro(item.description);
    if (!dia) { fora("sem \"Concluído no Quadro em DD/MM/AAAA\" válido na descrição"); continue; }
    const para = momentoDoDia(dia);
    if (para > agora) { fora(`a data do Quadro (${dia}) está no futuro`); continue; }
    const ordem = [...item.changes].sort((a, b) => a.version - b.version);
    const criacao = ordem[0];
    if (!criacao) { fora("sem histórico de criação"); continue; }
    if (!alteracoes(criacao).some((c) => c.field === "Situação" && c.after === SITUACOES.DONE)) {
      fora("não nasceu Concluído: a conclusão foi feita no Connect"); continue;
    }
    if (ordem.slice(1).some(mexeNaSituacao)) { fora("a situação mudou depois da criação"); continue; }
    if (item.createdAt.getTime() === para.getTime() && criacao.createdAt.getTime() === para.getTime()) { jaDatados++; continue; }
    if (para > item.createdAt) { fora(`a data do Quadro (${dia}) é depois da criação no Connect`); continue; }
    datar.push({
      id: item.id, title: item.title, dia, para,
      criadoEm: item.createdAt, atualizadoEm: item.updatedAt,
      mudancaId: criacao.id, mudancaEm: criacao.createdAt,
      levaAtualizacao: ordem.length === 1 && item.version === criacao.version,
    });
  }
  datar.sort((a, b) => a.dia.localeCompare(b.dia) || a.title.localeCompare(b.title, "pt-BR"));
  return { datar, pular, jaDatados };
}
