// O relatório baixável do Planejamento tributário (05/11/2026): o Markdown com
// a memória reproduzível e o CSV da transição 2027–2033. Portados de
// `report()` (components/studies/workspace.tsx) e `exportCSV()`
// (components/studies/results.tsx) do Connect Tributário, commit 0fcc797.
//
// O que saiu na Fase 1: a seção "Documentos" e os fatos extraídos, que só
// existem com a fila de documentos (Fase 2). Textos e números são os do original.

import { assess } from "./avaliacao/assessment";
import { fieldLabels, type Study } from "./avaliacao/model";
import { brl, years } from "./motor/fiscal";

export type DadosDoRelatorio = {
  estudo: Study;
  /** Ano da projeção escolhido na tela (2027–2033). */
  ano: number;
  /** Revisão salva; `null` num rascunho nunca salvo. */
  revisao: number | null;
  alteracoesNaoSalvas: boolean;
  /** Id da avaliação no Connect, para a memória reproduzível. */
  avaliacaoId: string | null;
};

export function nomeDoArquivoDoRelatorio(estudo: Study): string {
  return `Connect_Tributario_Avaliacao_${estudo.cnpj || "rascunho"}.md`;
}

export function relatorioEmMarkdown({ estudo, ano, revisao, alteracoesNaoSalvas, avaliacaoId }: DadosDoRelatorio): string {
  const resultado = assess(estudo, [], ano);
  const linhas = resultado.cards
    .map((c) => `| ${c.name} | ${c.value === null ? "—" : brl(c.value)} | ${c.status} | ${c.pending.join(" ")} |`)
    .join("\n");
  const valores = Object.entries(resultado.fields)
    .filter(([, v]) => v.value !== null)
    .map(([k, v]) => `| ${fieldLabels[k]} | ${String(v.value)} | ${v.source.replaceAll("|", "/")} | ${v.issue || ""} |`)
    .join("\n");
  const periodo =
    estudo.periodMode === "monthly-projection" ? "Média mensal multiplicada por 12; hipótese explícita." : "Base do período informado.";
  const folha = !estudo.base.payrollConfig.enabled
    ? "Os encargos informados são mantidos nos quatro cenários. Configure a folha detalhada para variar os encargos por regime."
    : "";
  const memoria = JSON.stringify({ study: estudo, year: ano, studyId: avaliacaoId, revision: revisao }, null, 2);
  return `# Connect Tributário — avaliação

${estudo.name} · ${estudo.cnpj || "CNPJ não informado"}

Período: ${estudo.start} a ${estudo.end}. Projeção: ${ano}. ${periodo}

Revisão salva: ${revisao || "rascunho"}${alteracoesNaoSalvas ? " — contém alterações ainda não salvas" : ""}.

| Cenário | Tributos e encargos estimados | Situação | Pendências |
|---|---:|---|---|
${linhas}

## Dados e origem

| Campo | Valor original | Origem | Divergência |
|---|---:|---|---|
${valores}

## Premissas

CBS integral: ${estudo.base.cbs}%; IBS integral: ${estudo.base.ibs}%; ano comparado: ${ano}. Hipóteses configuráveis; não são alíquotas oficiais confirmadas.

${folha}

${estudo.notes}

## Memória reproduzível

\`\`\`json
${memoria}
\`\`\`

Simulação parametrizada. Elegibilidade e tratamentos específicos dependem das informações fornecidas. O motor anual não realiza apuração trimestral nem compensação automática de prejuízos acumulados.
`;
}

export function nomeDoArquivoDaTransicao(estudo: Study): string {
  return `Connect_Transicao_${estudo.cnpj || "rascunho"}.csv`;
}

/** As linhas do CSV da transição: um regime por ano, de 2027 a 2033. */
export function linhasDaTransicao(estudo: Study): (string | number)[][] {
  return [
    ["Ano", "Regime", "Valor anual", "Situação", "Pendências"],
    ...years.flatMap((ano) =>
      assess(estudo, [], ano).cards.map((c) => [
        ano,
        c.name,
        c.value === null ? "" : c.value.toFixed(2).replace(".", ","),
        c.status,
        c.pending.join(" "),
      ]),
    ),
  ];
}
