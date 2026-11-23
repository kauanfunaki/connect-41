// Rubricas fixas do contrato no DP 2 (19/11/2026, funcionalidade-767): o que se
// repete todo mês para a pessoa (gratificação de função, quebra de caixa,
// desconto de plano de saúde…). Ficam no contrato — zero, uma ou várias — e o
// cálculo da folha mensal as lança sozinho de `inicio` até `fim`, junto com os
// eventos lançados no mês.
//
// Puro, sem banco.

import { lerNumero } from "./entrada";
import { regraDeLancamento } from "./rubricas";

export type RubricaFixa = {
  rubricaId: string;
  quantidade: number | null;
  valor: number | null;
  /** "AAAA-MM": a primeira competência em que entra. */
  inicio: string;
  /** "AAAA-MM": a última; null = sem fim. */
  fim: string | null;
  observacao: string | null;
};

/** O que o formulário manda por linha (texto, como a pessoa digitou). */
export type LinhaDaRubricaFixa = { rubricaId?: string; quantidade?: string; valor?: string; inicio?: string; fim?: string; observacao?: string };

type RubricaDoEscritorio = { id: string; nome: string; papel: string | null; tipo: string; lancamento: string; ativa: boolean };

const MES = /^\d{4}-(0[1-9]|1[0-2])$/;
export const MAXIMO_DE_RUBRICAS_FIXAS = 30;

/** A rubrica fixa vale na competência "AAAA-MM"? */
export function vigenteEm(f: { inicio: string; fim: string | null }, competencia: string): boolean {
  return f.inicio <= competencia && (!f.fim || competencia <= f.fim);
}

/**
 * Lê e confere as linhas do formulário (o JSON do campo `rubricasFixas`).
 * Linha toda vazia é ignorada; nenhuma linha = nenhuma rubrica fixa.
 */
export function lerRubricasFixas(json: string, rubricas: readonly RubricaDoEscritorio[]): { ok: true; fixas: RubricaFixa[] } | { ok: false; erro: string } {
  let linhas: LinhaDaRubricaFixa[];
  try {
    const bruto = json.trim() ? JSON.parse(json) : [];
    if (!Array.isArray(bruto)) return { ok: false, erro: "Rubricas fixas em formato inválido." };
    linhas = bruto as LinhaDaRubricaFixa[];
  } catch {
    return { ok: false, erro: "Rubricas fixas em formato inválido." };
  }
  const preenchidas = linhas.filter((l) => l && (l.rubricaId || l.quantidade || l.valor));
  if (preenchidas.length > MAXIMO_DE_RUBRICAS_FIXAS) return { ok: false, erro: `No máximo ${MAXIMO_DE_RUBRICAS_FIXAS} rubricas fixas por contrato.` };
  const porId = new Map(rubricas.map((r) => [r.id, r]));
  const fixas: RubricaFixa[] = [];
  for (const [i, l] of preenchidas.entries()) {
    const n = `Rubrica fixa ${i + 1}`;
    const r = l.rubricaId ? porId.get(l.rubricaId) : undefined;
    if (!r || !r.ativa) return { ok: false, erro: `${n}: escolha a rubrica.` };
    const regra = regraDeLancamento(r);
    if (!regra.lancavel) return { ok: false, erro: `${n}: ${r.nome} é calculada pelo motor, não pode ser fixa.` };
    const quantidade = regra.porQuantidade ? lerNumero(l.quantidade ?? "") : null;
    const valor = regra.porQuantidade ? null : lerNumero(l.valor ?? "");
    if (regra.porQuantidade && (quantidade === null || quantidade <= 0)) return { ok: false, erro: `${n} (${r.nome}): informe ${r.lancamento === "HORAS" ? "as horas" : "os dias"}.` };
    if (!regra.porQuantidade && (valor === null || valor <= 0)) return { ok: false, erro: `${n} (${r.nome}): informe o valor.` };
    const inicio = (l.inicio ?? "").trim();
    const fim = (l.fim ?? "").trim() || null;
    if (!MES.test(inicio)) return { ok: false, erro: `${n} (${r.nome}): informe o mês em que começa.` };
    if (fim && (!MES.test(fim) || fim < inicio)) return { ok: false, erro: `${n} (${r.nome}): o mês final vem depois do inicial.` };
    fixas.push({ rubricaId: r.id, quantidade, valor, inicio, fim, observacao: (l.observacao ?? "").trim().slice(0, 300) || null });
  }
  return { ok: true, fixas };
}

/** O que a memória do holerite diz de uma linha que veio de rubrica fixa. */
export const MARCA_DA_FIXA = "rubrica fixa do contrato";

/**
 * As fixas que entram no mês e as que o lançamento do mês substituiu (23/11/2026):
 * se o DP lançou no mês a mesma rubrica para a pessoa, vale o lançamento e a
 * fixa fica de fora naquele mês — assim uma gratificação diferente no mês não
 * sai em dobro. As fixas já chegam filtradas pela vigência.
 */
export function separarFixasDoMes<T extends { personId: string; rubricaId: string }>(
  fixas: readonly T[],
  lancados: readonly { personId: string; rubricaId: string }[]
): { entram: T[]; substituidas: T[] } {
  const doMes = new Set(lancados.map((l) => `${l.personId}|${l.rubricaId}`));
  const entram: T[] = [];
  const substituidas: T[] = [];
  for (const f of fixas) (doMes.has(`${f.personId}|${f.rubricaId}`) ? substituidas : entram).push(f);
  return { entram, substituidas };
}
