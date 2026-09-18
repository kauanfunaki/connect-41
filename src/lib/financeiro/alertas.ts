// Os alertas do financeiro — as regras, puras. Quem busca no banco e notifica é
// o motor de alertas (`src/lib/alerts.ts`), que roda dentro do próprio servidor
// a cada 15 minutos e não repete o mesmo aviso no mesmo dia.
//
// ─── Por que um aviso por dia, e não um por conta ────────────────────────────
//
// São 396 empresas. Uma notificação por título venceria o sino no primeiro dia e
// ensinaria o setor a ignorar o resto. O aviso é um resumo: quantas e quanto, com
// o link para a tela que já sabe filtrar.
//
// ─── Por que só contas a PAGAR ───────────────────────────────────────────────
//
// O que a empresa deve gera multa e juros se passar, e ninguém além do escritório
// está olhando. A receber já tem fila própria e régua de e-mail na Cobrança —
// avisar de novo aqui seria a terceira vez que o mesmo vencido aparece.

import { GRUPOS } from "@/lib/dre/estrutura";
import { moeda } from "./formato";

export type ContasDoDia = {
  venceHoje: number;
  totalHoje: number;
  venceramOntem: number;
  totalOntem: number;
};

/**
 * O aviso do dia sobre contas a pagar, ou `null` quando não há o que dizer.
 *
 * "Venceu ontem" e não "está vencida": o aviso é do que **mudou** hoje. Conta
 * parada há três meses viraria o mesmo texto todo dia, e o dia em que ela de
 * fato venceu é o dia em que alguém precisa agir.
 */
export function avisoDeContasAPagar(c: ContasDoDia): string | null {
  const partes: string[] = [];
  if (c.venceHoje > 0) {
    partes.push(
      c.venceHoje === 1
        ? `1 conta a pagar vence hoje (${moeda(c.totalHoje)})`
        : `${c.venceHoje} contas a pagar vencem hoje (${moeda(c.totalHoje)})`
    );
  }
  if (c.venceramOntem > 0) {
    partes.push(
      c.venceramOntem === 1
        ? `1 venceu ontem e segue em aberto (${moeda(c.totalOntem)})`
        : `${c.venceramOntem} venceram ontem e seguem em aberto (${moeda(c.totalOntem)})`
    );
  }
  if (partes.length === 0) return null;
  return `${partes.join("; ")}.`;
}

/** O aviso de pendências que venceram sem o cliente responder. */
export function avisoDePendenciasVencidas(quantidade: number): string | null {
  if (quantidade <= 0) return null;
  return quantidade === 1
    ? "1 pendência sua venceu sem resposta do cliente."
    : `${quantidade} pendências suas venceram sem resposta do cliente.`;
}

export type EstouroDeOrcamento = {
  grupo: string;
  rotulo: string;
  /** Em magnitude de gasto, positivos. */
  orcado: number;
  realizado: number;
  excedente: number;
};

/** Grupos de despesa da DRE: são os únicos que "estouram". */
const DESPESAS = GRUPOS.filter((g) => g.origem === "pagamento");

/**
 * O grupo de despesa que mais passou do orçado no mês, ou `null`.
 *
 * Os dois lados chegam na convenção de sinal da DRE (despesa negativa), e a
 * comparação é em **magnitude de gasto** — a mesma leitura de `avaliar` em
 * `orcamento/variacao.ts`.
 *
 * Grupo sem orçado não estoura: orçado zero costuma ser linha que a empresa não
 * preencheu, e avisar sobre ela transformaria o alerta em ruído no primeiro mês
 * de uso. `minimo` protege do estouro de centavos.
 */
export function maiorEstouro(
  realizadoPorGrupo: Record<string, number>,
  orcadoPorGrupo: Record<string, number>,
  minimo = 0
): EstouroDeOrcamento | null {
  let pior: EstouroDeOrcamento | null = null;
  for (const g of DESPESAS) {
    const orcado = -(orcadoPorGrupo[g.code] ?? 0);
    const realizado = -(realizadoPorGrupo[g.code] ?? 0);
    if (orcado <= 0) continue;
    const excedente = realizado - orcado;
    if (excedente <= minimo) continue;
    if (!pior || excedente > pior.excedente) {
      pior = { grupo: g.code, rotulo: g.label, orcado, realizado, excedente };
    }
  }
  return pior;
}

/** O texto do aviso de orçamento estourado. */
export function avisoDeOrcamento(empresa: string, competencia: string, e: EstouroDeOrcamento): string {
  return `${empresa}: ${e.rotulo} passou do orçado em ${competencia} — ${moeda(e.realizado)} contra ${moeda(e.orcado)} (${moeda(e.excedente)} a mais).`;
}
