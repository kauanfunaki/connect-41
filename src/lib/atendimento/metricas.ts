// As métricas do Atendimento (12/11/2026, pedido do Victor): o que a
// Controladoria acompanha — volume, tempo até a primeira resposta, tempo até
// encerrar, a nota do cliente, por setor e por pessoa, e os desfechos.
//
// Tudo aqui é cálculo puro sobre os atendimentos abertos no período (testado
// em `metricas.test.ts`); a leitura do banco fica em `metricasDoAtendimento`.

import { getPrisma } from "@/lib/prisma";
import type { Situacao } from "./regras";

export type CicloParaMetrica = {
  id: string;
  situacao: Situacao;
  sectorCode: string | null;
  assignedToId: string | null;
  encerradoPorId: string | null;
  abertoEm: Date;
  encerradoEm: Date | null;
  desfechoTexto: string | null;
  nota: number | null;
  notaPedidaEm: Date | null;
  /** A primeira mensagem da equipe ao cliente (sem nota interna nem automática). */
  primeiraResposta: Date | null;
};

export type LinhaDoGrupo = {
  chave: string | null;
  total: number;
  encerrados: number;
  /** Em minutos; nulo sem nenhuma resposta. */
  primeiraResposta: number | null;
  ateEncerrar: number | null;
  notaMedia: number | null;
  notas: number;
};

export type Resumo = {
  total: number;
  encerrados: number;
  emAberto: number;
  primeiraResposta: number | null;
  ateEncerrar: number | null;
  respondidos: number;
  nota: { media: number | null; quantas: number; pedidas: number; distribuicao: [number, number, number, number, number] };
  porSetor: LinhaDoGrupo[];
  porPessoa: LinhaDoGrupo[];
  desfechos: { texto: string; n: number }[];
};

const MINUTO = 60_000;

/** A mediana: o tempo "do meio", que um atendimento esquecido não distorce. */
export function mediana(valores: readonly number[]): number | null {
  if (valores.length === 0) return null;
  const v = [...valores].sort((a, b) => a - b);
  const meio = Math.floor(v.length / 2);
  return v.length % 2 ? v[meio]! : (v[meio - 1]! + v[meio]!) / 2;
}

function media(valores: readonly number[]): number | null {
  return valores.length ? valores.reduce((s, x) => s + x, 0) / valores.length : null;
}

const minutos = (de: Date, ate: Date | null) => (ate ? Math.max(0, (ate.getTime() - de.getTime()) / MINUTO) : null);

function linha(chave: string | null, ciclos: readonly CicloParaMetrica[]): LinhaDoGrupo {
  const notas = ciclos.map((c) => c.nota).filter((n): n is number => n !== null);
  return {
    chave,
    total: ciclos.length,
    encerrados: ciclos.filter((c) => c.situacao === "ENCERRADO").length,
    primeiraResposta: mediana(ciclos.map((c) => minutos(c.abertoEm, c.primeiraResposta)).filter((x): x is number => x !== null)),
    ateEncerrar: mediana(ciclos.map((c) => minutos(c.abertoEm, c.encerradoEm)).filter((x): x is number => x !== null)),
    notaMedia: media(notas),
    notas: notas.length,
  };
}

function agrupar(ciclos: readonly CicloParaMetrica[], chaveDe: (c: CicloParaMetrica) => string | null | undefined): LinhaDoGrupo[] {
  const grupos = new Map<string | null, CicloParaMetrica[]>();
  for (const c of ciclos) {
    const k = chaveDe(c);
    if (k === undefined) continue;
    grupos.set(k, [...(grupos.get(k) ?? []), c]);
  }
  return [...grupos.entries()].map(([k, l]) => linha(k, l)).sort((a, b) => b.total - a.total);
}

export function resumir(ciclos: readonly CicloParaMetrica[]): Resumo {
  const geral = linha(null, ciclos);
  const distribuicao: [number, number, number, number, number] = [0, 0, 0, 0, 0];
  for (const c of ciclos) if (c.nota !== null && c.nota >= 1 && c.nota <= 5) distribuicao[c.nota - 1]!++;
  const desfechos = new Map<string, number>();
  for (const c of ciclos) if (c.situacao === "ENCERRADO" && c.desfechoTexto) desfechos.set(c.desfechoTexto, (desfechos.get(c.desfechoTexto) ?? 0) + 1);
  return {
    total: geral.total,
    encerrados: geral.encerrados,
    emAberto: geral.total - geral.encerrados,
    primeiraResposta: geral.primeiraResposta,
    ateEncerrar: geral.ateEncerrar,
    respondidos: ciclos.filter((c) => c.primeiraResposta).length,
    nota: { media: geral.notaMedia, quantas: geral.notas, pedidas: ciclos.filter((c) => c.notaPedidaEm).length, distribuicao },
    // O setor final da conversa; nulo = resolvida na triagem.
    porSetor: agrupar(ciclos, (c) => c.sectorCode),
    // Quem encerrou; sem encerrar, quem está com ela. Sem ninguém, fica de fora.
    porPessoa: agrupar(ciclos, (c) => c.encerradoPorId ?? c.assignedToId ?? undefined),
    desfechos: [...desfechos.entries()].map(([texto, n]) => ({ texto, n })).sort((a, b) => b.n - a.n || a.texto.localeCompare(b.texto)),
  };
}

/** "8 min", "2 h 05", "3 d 4 h": o tempo legível, para os cartões e as tabelas. */
export function duracaoLegivel(min: number | null): string {
  if (min === null) return "—";
  if (min < 1) return "menos de 1 min";
  if (min < 60) return `${Math.round(min)} min`;
  const h = Math.floor(min / 60);
  if (h < 24) return `${h} h ${String(Math.round(min % 60)).padStart(2, "0")}`;
  const d = Math.floor(h / 24);
  return `${d} d${h % 24 ? ` ${h % 24} h` : ""}`;
}

/** Os períodos da tela, em dias. */
export const PERIODOS = [7, 30, 90] as const;
export type Periodo = (typeof PERIODOS)[number];
export function periodoValido(v: string | undefined): Periodo {
  const n = Number(v);
  return (PERIODOS as readonly number[]).includes(n) ? (n as Periodo) : 30;
}

/** O começo do período: agora menos os dias escolhidos. */
export function inicioDoPeriodo(dias: number, agora = new Date()): Date {
  return new Date(agora.getTime() - dias * 24 * 60 * 60 * 1000);
}

/** Até quantos atendimentos a tela lê de uma vez — acima disso, o período é longo demais. */
const TETO = 5_000;

/**
 * Os atendimentos abertos no período, com a primeira resposta de cada um, e os
 * dados do histórico (contato, quem encerrou).
 */
export async function metricasDoAtendimento(tenantId: string, desde: Date) {
  const prisma = getPrisma();
  const ciclos = await prisma.atendimentoCiclo.findMany({
    where: { tenantId, abertoEm: { gte: desde } },
    orderBy: { abertoEm: "desc" },
    take: TETO,
    select: {
      id: true,
      situacao: true,
      sectorCode: true,
      assignedToId: true,
      encerradoPorId: true,
      abertoEm: true,
      encerradoEm: true,
      desfechoTexto: true,
      nota: true,
      notaPedidaEm: true,
      conversa: { select: { contato: { select: { waPhone: true, nomeNoWhatsapp: true, nome: true, companyId: true, personId: true, tipo: true } } } },
    },
  });
  const ids = ciclos.map((c) => c.id);
  const primeiras = ids.length
    ? await prisma.atendimentoMensagem.groupBy({
        by: ["cicloId"],
        where: { cicloId: { in: ids }, direcao: "SAIDA", interna: false, automatica: false },
        _min: { createdAt: true },
      })
    : [];
  const primeiraDe = new Map(primeiras.map((p) => [p.cicloId, p._min.createdAt]));
  return {
    ciclos: ciclos.map((c) => ({ ...c, situacao: c.situacao as Situacao, primeiraResposta: primeiraDe.get(c.id) ?? null })),
    cortado: ciclos.length === TETO,
  };
}
