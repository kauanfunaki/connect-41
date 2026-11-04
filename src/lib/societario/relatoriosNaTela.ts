// Relatórios do Societário, um por vez (Relatórios B, página de opções de
// 04/11/2026): a lista dos relatórios, a troca Gráfico | Tabela, a frase de
// leitura de cada um e as colunas que a exportação leva. Puro, sem banco — a
// página e a rota de exportação leem daqui, e por isso a planilha tem as mesmas
// colunas da tabela da tela.

import type { CelulaDaTabela, ColunaDaTabela } from "@/lib/planilha/tabelaDoExcel";
import { formatarNumero, formatarReaisDeCentavos } from "@/lib/format";
import type { LinhaDeCusto, LinhaDeProdutividade, LinhaDeSla, ResumoDeVoltas, ProcessoParaRelatorio } from "./relatorios";

export const RELATORIOS = [
  {
    chave: "sla",
    rotulo: "SLA por tipo",
    explicacao: "Dias úteis consumidos contra o previsto do tipo. As voltas ficam na mesma linha porque são a causa do estouro.",
  },
  {
    chave: "voltas",
    rotulo: "Processos que mais voltaram",
    explicacao: "Os processos com reapresentação, do que mais voltou para o que menos voltou.",
  },
  {
    chave: "produtividade",
    rotulo: "Produtividade por responsável",
    explicacao:
      "Concluídos no período, ao lado da carteira aberta. O crédito é do responsável atual do processo — não há histórico de redistribuição.",
  },
  {
    chave: "custo",
    rotulo: "Custo em taxas por processo",
    explicacao: "Quanto cada processo custou em taxas, e quanto disso veio de reapresentação.",
  },
] as const;

export type ChaveDoRelatorio = (typeof RELATORIOS)[number]["chave"];
export type VisaoDoRelatorio = "grafico" | "tabela";

export function lerRelatorio(valor: unknown): (typeof RELATORIOS)[number] {
  return RELATORIOS.find((r) => r.chave === valor) ?? RELATORIOS[0];
}

export function lerVisao(valor: unknown): VisaoDoRelatorio {
  return valor === "tabela" ? "tabela" : "grafico";
}

const plural = (n: number, um: string, varios: string) => `${formatarNumero(n, 0)} ${n === 1 ? um : varios}`;

// ─── A frase de leitura ──────────────────────────────────────────────────────

/** O tipo que mais estoura, em proporção — e quanto ele volta. */
export function leituraDoSla(sla: LinhaDeSla[]): string {
  const comPrevisao = sla.filter((l) => l.previstoMax !== null && l.total > 0);
  if (sla.length === 0) return "Nenhum processo no período.";
  const estourados = comPrevisao.reduce((s, l) => s + l.estourados, 0);
  if (estourados === 0) return "Nenhum tipo estourou o prazo no período.";
  const pior = [...comPrevisao].sort((a, b) => b.estourados / b.total - a.estourados / a.total || b.estourados - a.estourados)[0];
  const voltas =
    pior.mediaDeVoltas !== null && pior.mediaDeVoltas > 0
      ? `, com ${formatarNumero(pior.mediaDeVoltas, 1)} ${pior.mediaDeVoltas === 1 ? "volta" : "voltas"} por processo em média`
      : "";
  return `${pior.tipoNome} é o tipo que mais estoura: ${pior.estourados} de ${pior.total}${voltas}. No total, ${plural(estourados, "processo estourou", "processos estouraram")} o previsto.`;
}

export function leituraDasVoltas(resumo: ResumoDeVoltas, mais: ProcessoParaRelatorio[]): string {
  if (resumo.processos === 0) return "Nenhum processo no período.";
  if (resumo.comVolta === 0) return "Nenhum processo voltou com exigência no período.";
  const topo = mais[0];
  const texto = `${resumo.comVolta} de ${resumo.processos} processos tiveram ao menos uma reapresentação (${resumo.percentualComVolta ?? 0}%).`;
  return topo ? `${texto} O que mais voltou: ${topo.tipoNome} — ${topo.empresaNome}, ${plural(topo.voltas, "vez", "vezes")}.` : texto;
}

export function leituraDaProdutividade(linhas: LinhaDeProdutividade[]): string {
  const comConclusao = linhas.filter((l) => l.concluidosNoPeriodo > 0);
  if (linhas.length === 0) return "Nenhum processo no período.";
  const estourados = linhas.reduce((s, l) => s + l.estouradosAbertos, 0);
  const partes: string[] = [];
  if (comConclusao.length > 0) {
    const total = comConclusao.reduce((s, l) => s + l.concluidosNoPeriodo, 0);
    const lider = [...comConclusao].sort((a, b) => b.concluidosNoPeriodo - a.concluidosNoPeriodo)[0];
    partes.push(`${plural(total, "processo concluído", "processos concluídos")}; ${lider.nome} concluiu ${lider.concluidosNoPeriodo}.`);
  } else {
    partes.push("Nenhum processo concluído no período.");
  }
  if (estourados > 0) {
    const mais = [...linhas].sort((a, b) => b.estouradosAbertos - a.estouradosAbertos)[0];
    partes.push(`${plural(estourados, "aberto está estourado", "abertos estão estourados")} — ${mais.estouradosAbertos} com ${mais.nome}.`);
  }
  return partes.join(" ");
}

export function leituraDoCusto(custos: LinhaDeCusto[], totais: { totalCentavos: number; custoDasVoltasCentavos: number }): string {
  if (custos.length === 0) return "Nenhuma taxa registrada nos processos do período.";
  const maisCaro = custos[0];
  const voltas =
    totais.custoDasVoltasCentavos > 0
      ? ` ${formatarReaisDeCentavos(totais.custoDasVoltasCentavos)} (${Math.round((totais.custoDasVoltasCentavos / Math.max(1, totais.totalCentavos)) * 100)}%) vieram de reapresentação.`
      : " Nenhuma taxa veio de reapresentação.";
  return `${formatarReaisDeCentavos(totais.totalCentavos)} em taxas em ${plural(custos.length, "processo", "processos")}; o mais caro foi ${maisCaro.tipoNome} — ${maisCaro.empresaNome}, ${formatarReaisDeCentavos(maisCaro.totalCentavos)}.${voltas}`;
}

// ─── As colunas da exportação ────────────────────────────────────────────────

export type TabelaDoRelatorio = { colunas: ColunaDaTabela[]; linhas: CelulaDaTabela[][] };

const faixaPrevista = (min: number | null, max: number | null) =>
  max === null ? "sem previsão" : min !== null && min !== max ? `${min}–${max}` : String(max);

export function tabelaDoSla(sla: LinhaDeSla[]): TabelaDoRelatorio {
  return {
    colunas: [
      { nome: "Tipo", tipo: "texto", largura: 30 },
      { nome: "Previsto (dias úteis)", tipo: "texto", largura: 14 },
      { nome: "Processos", tipo: "inteiro" },
      { nome: "Concluídos", tipo: "inteiro" },
      { nome: "Dentro", tipo: "inteiro" },
      { nome: "No limite", tipo: "inteiro" },
      { nome: "Estourados", tipo: "inteiro" },
      { nome: "Média de dias", tipo: "decimal" },
      { nome: "Média de voltas", tipo: "decimal" },
    ],
    linhas: sla.map((l) => {
      const semPrevisao = l.previstoMax === null;
      return [
        l.tipoNome,
        faixaPrevista(l.previstoMin, l.previstoMax),
        l.total,
        l.concluidos,
        semPrevisao ? null : l.dentro,
        semPrevisao ? null : l.noLimite,
        semPrevisao ? null : l.estourados,
        l.mediaDeDias,
        l.mediaDeVoltas,
      ];
    }),
  };
}

export function tabelaDasVoltas(mais: ProcessoParaRelatorio[]): TabelaDoRelatorio {
  return {
    colunas: [
      { nome: "Tipo", tipo: "texto" },
      { nome: "Empresa", tipo: "texto", largura: 36 },
      { nome: "Voltas", tipo: "inteiro" },
      { nome: "Dias úteis", tipo: "inteiro" },
      { nome: "Situação", tipo: "texto", largura: 12 },
    ],
    linhas: mais.map((p) => [p.tipoNome, p.empresaNome, p.voltas, p.prazo.dias, p.concluidoEm ? "Concluído" : "Aberto"]),
  };
}

export function tabelaDaProdutividade(linhas: LinhaDeProdutividade[]): TabelaDoRelatorio {
  return {
    colunas: [
      { nome: "Responsável", tipo: "texto" },
      { nome: "Concluídos", tipo: "inteiro" },
      { nome: "Média de dias", tipo: "decimal" },
      { nome: "Voltas nos concluídos", tipo: "inteiro" },
      { nome: "Abertos", tipo: "inteiro" },
      { nome: "Abertos estourados", tipo: "inteiro" },
    ],
    linhas: linhas.map((l) => [l.nome, l.concluidosNoPeriodo, l.mediaDeDiasDosConcluidos, l.voltasDosConcluidos, l.abertos, l.estouradosAbertos]),
  };
}

export function tabelaDoCusto(custos: LinhaDeCusto[]): TabelaDoRelatorio {
  return {
    colunas: [
      { nome: "Tipo", tipo: "texto" },
      { nome: "Empresa", tipo: "texto", largura: 36 },
      { nome: "Voltas", tipo: "inteiro" },
      { nome: "Total", tipo: "reais" },
      { nome: "Pago", tipo: "reais" },
      { nome: "Das voltas", tipo: "reais" },
    ],
    linhas: custos.map((l) => [l.tipoNome, l.empresaNome, l.voltas, l.totalCentavos, l.pagoCentavos, l.custoDasVoltasCentavos]),
  };
}

/**
 * O CSV da mesma tabela: ";" e vírgula decimal, que é o que o Excel em
 * português abre sem pedir nada (como nas horas da Gestão). Reais em reais.
 */
export function csvDaTabela(t: TabelaDoRelatorio): string {
  const cel = (v: string) => `"${v.replace(/"/g, '""')}"`;
  const valor = (c: CelulaDaTabela, tipo: ColunaDaTabela["tipo"]): string => {
    if (c === null || c === "") return "";
    if (typeof c === "number") {
      if (tipo === "reais") return (c / 100).toFixed(2).replace(".", ",");
      if (tipo === "decimal") return String(c).replace(".", ",");
      return String(c);
    }
    return cel(c);
  };
  const cabecalho = t.colunas.map((c) => cel(c.nome)).join(";");
  const corpo = t.linhas.map((l) => t.colunas.map((c, i) => valor(l[i] ?? null, c.tipo)).join(";"));
  return "﻿" + [cabecalho, ...corpo].join("\r\n");
}
