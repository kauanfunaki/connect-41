// Os números do topo da auditoria e as contagens dos filtros — a partir das
// contagens por código de ação que a tela tira do banco (um `groupBy`).
//
// Puro, sem banco.

import { formatInstantTime } from "@/lib/format";
import { AREAS_DA_AUDITORIA, areaDaAcao, descricaoDaAcao, type ChaveDaAreaDaAuditoria, type TipoDaAcao } from "./acoes";
import { diaEmSaoPaulo } from "./dias";
import { dataBR, somarDias } from "@/lib/datas/calendario";

export type ContagemPorAcao = { acao: string; total: number };

/** Quantas ações de cada tipo, para os botões "Tudo / Criou / Editou / Excluiu". */
export function contagemPorTipo(porAcao: readonly ContagemPorAcao[]): Record<"tudo" | TipoDaAcao, number> {
  const out = { tudo: 0, criou: 0, editou: 0, excluiu: 0, outro: 0 };
  for (const { acao, total } of porAcao) {
    out.tudo += total;
    out[descricaoDaAcao(acao).tipo] += total;
  }
  return out;
}

export type OpcaoDeArea = { chave: ChaveDaAreaDaAuditoria; rotulo: string; cor: string; total: number };

/** As áreas que têm ação no recorte, da que tem mais para a que tem menos. */
export function opcoesDeArea(porAcao: readonly ContagemPorAcao[]): OpcaoDeArea[] {
  const n = new Map<ChaveDaAreaDaAuditoria, number>();
  for (const { acao, total } of porAcao) {
    const a = areaDaAcao(acao);
    n.set(a, (n.get(a) ?? 0) + total);
  }
  return [...n.entries()]
    .map(([chave, total]) => ({ chave, total, ...AREAS_DA_AUDITORIA[chave] }))
    .sort((a, b) => b.total - a.total || a.rotulo.localeCompare(b.rotulo, "pt-BR"));
}

/** "hoje, 14:32" / "ontem, 09:15" / "06/10, 17:20" / "06/10/2025". */
export function quandoCurto(instante: Date, agora: Date): string {
  const dia = diaEmSaoPaulo(instante);
  const hoje = diaEmSaoPaulo(agora);
  const hora = formatInstantTime(instante, { hour: "2-digit", minute: "2-digit" });
  if (dia === hoje) return `hoje, ${hora}`;
  if (dia === somarDias(hoje, -1)) return `ontem, ${hora}`;
  if (dia.slice(0, 4) === hoje.slice(0, 4)) return `${dataBR(dia).slice(0, 5)}, ${hora}`;
  return dataBR(dia);
}

export type MetricasDaAuditoria = {
  acoes: number;
  pessoas: number;
  exclusoes: number;
  /** "a última ontem, 09:15" — `null` sem exclusão no período. */
  ultimaExclusao: string | null;
  hoje: number;
};

/**
 * Os quatro números: ações no período, pessoas que agiram, exclusões (com a
 * última) e as ações de hoje até agora. Seguem o período, a pessoa, a área e a
 * busca — não o botão de tipo, para "Exclusões" continuar valendo quando a
 * lista mostra só o que foi criado.
 */
export function metricasDaAuditoria(dados: {
  porAcao: readonly ContagemPorAcao[];
  pessoas: number;
  ultimaExclusao: Date | null;
  hoje: number;
  agora: Date;
}): MetricasDaAuditoria {
  const tipos = contagemPorTipo(dados.porAcao);
  return {
    acoes: tipos.tudo,
    pessoas: dados.pessoas,
    exclusoes: tipos.excluiu,
    ultimaExclusao: tipos.excluiu > 0 && dados.ultimaExclusao ? `a última ${quandoCurto(dados.ultimaExclusao, dados.agora)}` : null,
    hoje: dados.hoje,
  };
}

export type Ator = { userId: string | null; nome: string | null; total: number };

export type OpcaoDePessoa = { valor: string; rotulo: string; total: number; excluido: boolean };

/**
 * Quem agiu, uma vez por pessoa: o mesmo usuário com nomes diferentes (trocou
 * de nome) soma numa linha só, com o nome atual. Quem foi excluído (sem
 * `userId`) entra pelo nome guardado, com o valor "nome:<nome>".
 */
export function pessoasQueAgiram(atores: readonly Ator[], nomeAtual: ReadonlyMap<string, string>): OpcaoDePessoa[] {
  const porChave = new Map<string, OpcaoDePessoa>();
  for (const a of atores) {
    const valor = a.userId ?? (a.nome ? `nome:${a.nome}` : null);
    if (!valor) continue;
    const rotulo = (a.userId && nomeAtual.get(a.userId)) || a.nome || "Sem nome";
    const atual = porChave.get(valor);
    if (atual) atual.total += a.total;
    else porChave.set(valor, { valor, rotulo, total: a.total, excluido: !a.userId });
  }
  return [...porChave.values()].sort((a, b) => a.rotulo.localeCompare(b.rotulo, "pt-BR", { sensitivity: "base" }));
}
