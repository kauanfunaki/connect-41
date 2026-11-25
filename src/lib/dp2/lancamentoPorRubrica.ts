// Lançar por rubrica e em grupo, e a consulta por rubrica (25/11/2026,
// funcionalidade-767, parte 1.1): "Por Rubrica", "Em Grupo" e "Consulta" de
// Processos › Lançamentos na Domínio. Uma rubrica, vários colaboradores numa
// tela só; e os lançamentos do mês somados por rubrica.
//
// Puro, sem banco.

import { lerNumero } from "./entrada";

/** Prefixo dos campos do formulário: `item_<personId>` = horas, dias ou valor da pessoa. */
export const PREFIXO_DO_ITEM = "item_";
export const MAXIMO_POR_LANCAMENTO = 500;

export type ItemPorRubrica = { personId: string; quantidade: number | null; valor: number | null };

/**
 * Lê o que se digitou por colaborador para uma rubrica. Campo vazio = a pessoa
 * fica de fora; nenhum preenchido = erro. Um número inválido ou zero aponta o
 * nome de quem está errado, sem lançar nada (tudo ou nada).
 */
export function lerLancamentoPorRubrica(
  campos: readonly { personId: string; texto: string }[],
  porQuantidade: boolean,
  nomeDe: (personId: string) => string
): { ok: true; itens: ItemPorRubrica[] } | { ok: false; erro: string } {
  const preenchidos = campos.filter((c) => c.texto.trim() !== "");
  if (preenchidos.length === 0) return { ok: false, erro: `Preencha ${porQuantidade ? "as horas ou os dias" : "o valor"} de ao menos um colaborador.` };
  if (preenchidos.length > MAXIMO_POR_LANCAMENTO) return { ok: false, erro: `No máximo ${MAXIMO_POR_LANCAMENTO} colaboradores por lançamento.` };
  const vistos = new Set<string>();
  const errados: string[] = [];
  const itens: ItemPorRubrica[] = [];
  for (const c of preenchidos) {
    if (vistos.has(c.personId)) continue;
    vistos.add(c.personId);
    const n = lerNumero(c.texto);
    if (n === null || !Number.isFinite(n) || n <= 0) {
      errados.push(nomeDe(c.personId));
      continue;
    }
    itens.push({ personId: c.personId, quantidade: porQuantidade ? n : null, valor: porQuantidade ? null : n });
  }
  if (errados.length) {
    const lista = errados.length > 3 ? `${errados.slice(0, 3).join(", ")} e mais ${errados.length - 3}` : errados.join(", ");
    return { ok: false, erro: `${porQuantidade ? "Horas ou dias" : "Valor"} inválido para ${lista}. Nada foi lançado.` };
  }
  return { ok: true, itens };
}

/** Os campos `item_<personId>` de um FormData (ou de qualquer lista de pares). */
export function camposDoFormulario(pares: Iterable<[string, unknown]>): { personId: string; texto: string }[] {
  const campos: { personId: string; texto: string }[] = [];
  for (const [k, v] of pares) {
    if (!k.startsWith(PREFIXO_DO_ITEM) || typeof v !== "string") continue;
    const personId = k.slice(PREFIXO_DO_ITEM.length);
    if (personId) campos.push({ personId, texto: v });
  }
  return campos;
}

type RubricaDaLinha = { id: string; codigo: string; nome: string; tipo?: string | null };
type LinhaDoMes = { personId: string; quantidade: unknown; valor: unknown; rubrica: RubricaDaLinha };

export type TotalDaRubrica = {
  rubricaId: string;
  codigo: string;
  nome: string;
  tipo: string | null;
  /** Colaboradores diferentes com a rubrica no mês. */
  pessoas: number;
  /** Linhas: lançamentos do mês + fixas que entram. */
  lancamentos: number;
  fixas: number;
  quantidade: number | null;
  valor: number | null;
};

const numero = (v: unknown): number | null => (v === null || v === undefined ? null : Number(v));
const somar = (a: number | null, b: number | null) => (b === null ? a : Math.round(((a ?? 0) + b) * 100) / 100);

/**
 * A consulta por rubrica: os lançamentos do mês e as fixas que entram (as
 * substituídas já ficam de fora), somados por rubrica, em ordem de código.
 * Horas/dias e valor somam separados; null = nenhuma linha com aquele campo.
 */
export function totaisPorRubrica(lancados: readonly LinhaDoMes[], fixas: readonly LinhaDoMes[]): TotalDaRubrica[] {
  const porRubrica = new Map<string, TotalDaRubrica & { _pessoas: Set<string> }>();
  const juntar = (l: LinhaDoMes, fixa: boolean) => {
    let t = porRubrica.get(l.rubrica.id);
    if (!t) {
      t = { rubricaId: l.rubrica.id, codigo: l.rubrica.codigo, nome: l.rubrica.nome, tipo: l.rubrica.tipo ?? null, pessoas: 0, lancamentos: 0, fixas: 0, quantidade: null, valor: null, _pessoas: new Set() };
      porRubrica.set(l.rubrica.id, t);
    }
    t._pessoas.add(l.personId);
    t.lancamentos++;
    if (fixa) t.fixas++;
    t.quantidade = somar(t.quantidade, numero(l.quantidade));
    t.valor = somar(t.valor, numero(l.valor));
  };
  for (const l of lancados) juntar(l, false);
  for (const f of fixas) juntar(f, true);
  return [...porRubrica.values()]
    .map(({ _pessoas, ...t }) => ({ ...t, pessoas: _pessoas.size }))
    .sort((a, b) => a.codigo.localeCompare(b.codigo, "pt-BR", { numeric: true }) || a.nome.localeCompare(b.nome, "pt-BR"));
}
