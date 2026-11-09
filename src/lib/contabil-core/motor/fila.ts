// A fila do NEO por padrão de histórico, a sugestão de regra pela seleção e a conferência da
// composição manual (Fase 3, 09/11/2026). Porte das partes puras de `src/domain/neo/consultas.py` e
// `src/domain/neo/composicao.py`.

import { cmp, len, split } from "./unicodePy";
import { igual, modulo, soma, decimal, NAO_FINITO, type Dec } from "./decimal";
import { chaveAgrupamentoHistorico, normalizarParaMatch } from "./texto";

// ─── Sugestão de regra ────────────────────────────────────────────────────

/**
 * O maior PREFIXO de palavras da primeira linha que ainda está contido em todas as outras, na forma
 * canônica. Prefixo, e não interseção de palavras soltas, porque a estratégia `substring` exige o
 * trecho contíguo: palavras comuns fora de ordem casariam por `todas_palavras`, a mais permissiva, e
 * alcançariam lançamentos que o contador não viu. Volta o texto CRU da primeira linha, que é o que ele
 * lê e edita antes de confirmar.
 */
export function prefixoComumDePalavras(historicos: readonly string[]): string {
  if (!historicos.length) return "";
  const palavras = split(historicos[0] || "");
  const canonicos = historicos.map((h) => normalizarParaMatch(h));
  let melhor = 0;
  for (let quantas = 1; quantas <= palavras.length; quantas++) {
    const alvo = normalizarParaMatch(palavras.slice(0, quantas).join(" "));
    // Prefixo que falha não volta a casar ao crescer: o mais longo contém o mais curto.
    if (alvo && canonicos.every((c) => c.includes(alvo))) melhor = quantas;
    else break;
  }
  return palavras.slice(0, melhor).join(" ");
}

// ─── Fila agrupada ────────────────────────────────────────────────────────

export type PendenciaParaAgrupar = {
  readonly id: string;
  readonly historico: string;
  readonly dc: string;
  readonly valor: Dec;
  /** "AAAA-MM-DD" */
  readonly data: string;
  readonly agenciaId: string;
};

export type GrupoDePendencias = {
  padrao: string;
  /** O histórico mais frequente do grupo (o que o contador mais viu). */
  rotulo: string;
  dc: string;
  quantidade: number;
  valorTotal: Dec;
  dataInicio: string;
  dataFim: string;
  agenciaIds: string[];
  amostras: string[];
  transacaoIds: string[];
};

/**
 * Agrupa a fila por padrão textual e lado D/C. A agência não entra na chave: fragmentar esconderia que
 * o mesmo padrão ocorre em várias contas (`agenciaIds` diz quantas regras seriam necessárias). D/C
 * entra, porque uma regra nunca cobre os dois lados. Ordem: mais transações, maior valor, padrão, lado.
 */
export function agruparPendencias(pendencias: readonly PendenciaParaAgrupar[], tokens = 3): GrupoDePendencias[] {
  type Acumulado = { padrao: string; dc: string; total: Dec; ini: string; fim: string; agencias: Set<string>; historicos: Map<string, number>; ids: string[] };
  const grupos = new Map<string, Acumulado>();
  for (const t of pendencias) {
    const padrao = chaveAgrupamentoHistorico(t.historico, tokens);
    const chave = `${padrao}\u0000${t.dc}`;
    let g = grupos.get(chave);
    if (!g) grupos.set(chave, (g = { padrao, dc: t.dc, total: { negativo: false, coeficiente: BigInt(0), expoente: 0 }, ini: t.data, fim: t.data, agencias: new Set(), historicos: new Map(), ids: [] }));
    g.total = soma(g.total, t.valor);
    if (t.data < g.ini) g.ini = t.data;
    if (t.data > g.fim) g.fim = t.data;
    g.agencias.add(t.agenciaId);
    g.historicos.set(t.historico, (g.historicos.get(t.historico) ?? 0) + 1);
    g.ids.push(t.id);
  }
  const lista = [...grupos.values()].map((g) => {
    // Frequência primeiro, texto (por ponto de código, como o Python) no empate: rótulo estável.
    const historicos = [...g.historicos.keys()].sort((a, b) => g.historicos.get(b)! - g.historicos.get(a)! || cmp(a, b));
    return {
      padrao: g.padrao, rotulo: historicos[0], dc: g.dc, quantidade: g.ids.length, valorTotal: g.total,
      dataInicio: g.ini, dataFim: g.fim, agenciaIds: [...g.agencias].sort(), amostras: historicos.slice(0, 5), transacaoIds: g.ids,
    };
  });
  return lista.sort((a, b) => {
    if (a.quantidade !== b.quantidade) return b.quantidade - a.quantidade;
    const v = compararDec(b.valorTotal, a.valorTotal);
    if (v) return v;
    return cmp(a.padrao, b.padrao) || cmp(a.dc, b.dc);
  });
}

function compararDec(a: Dec, b: Dec): number {
  const d = soma(a, { ...b, negativo: !b.negativo });
  return d.coeficiente === BigInt(0) ? 0 : d.negativo ? -1 : 1;
}

// ─── Composição manual (ADR-017) ──────────────────────────────────────────

export type ComponenteDaComposicao = { contaId: string; historico: string; valor: Dec };

/** Valor de um componente: positivo, finito e com no máximo dois decimais (`NeoComponenteInput`). */
export function valorDoComponente(texto: string): Dec | null {
  const d = decimal(brParaPonto(texto));
  if (d === null || d === NAO_FINITO) return null;
  if (d.negativo || d.coeficiente === BigInt(0) || d.expoente < -2) return null;
  return d;
}

/** "1.234,56" ou "1234.56" → "1234.56". */
function brParaPonto(texto: string): string {
  const t = texto.trim();
  if (t.includes(",")) return t.replace(/\./g, "").replace(",", ".");
  return t;
}

/**
 * Confere a composição antes de gravar: ao menos um componente, histórico de 2 a 500 caracteres e a
 * soma dos valores exatamente igual ao valor da transação (sem tolerância: um centavo de diferença
 * é um centavo a mais ou a menos no razão).
 */
export function conferirComposicao(componentes: readonly ComponenteDaComposicao[], valorDaTransacao: Dec): string | null {
  if (!componentes.length) return "Informe ao menos um componente.";
  for (const c of componentes) {
    const h = c.historico.trim();
    if (len(h) < 2 || len(h) > 500) return "Cada componente precisa de um histórico de 2 a 500 caracteres.";
    if (c.valor.negativo || c.valor.coeficiente === BigInt(0) || c.valor.expoente < -2) return "Informe um valor positivo com no máximo dois decimais.";
  }
  const total = componentes.reduce<Dec>((s, c) => soma(s, c.valor), { negativo: false, coeficiente: BigInt(0), expoente: 0 });
  if (!igual(total, modulo(valorDaTransacao))) return "A soma dos componentes deve ser igual ao valor da transação.";
  return null;
}
