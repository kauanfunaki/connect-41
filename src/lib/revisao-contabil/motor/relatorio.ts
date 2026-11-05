// Validade de uma execução e relatório em Markdown.
// Portado de `dist/review-state.mjs` (AudTool R_12 provisório, commit 92658a2). O que ficou no navegador
// (localStorage, invalidação da sessão, limpeza de correções) não vem: no Connect isso é do banco.
//
// Mudança deliberada (05/11/2026): o original citava um "roteiro interno KPMG", com a ressalva de que não
// havia vínculo com a KPMG. Era o nome de uma skill usada para montar a ferramenta, sem relação com a
// empresa; num módulo que pode ser vendido a escritórios, a marca sai. O texto passa a "roteiro interno
// de revisão documental".

import type { Analise, Documento, Empresa, Fechamento, ItemDoManual, Resumo } from "./tipos";

export const IDENTIFICACAO = "Roteiro interno de revisão documental. Não constitui auditoria independente.";

/** Assinatura do cadastro: mudar empresa ou fechamento invalida a execução. */
export function contextKey(co: Empresa | null | undefined, cl: Fechamento | null | undefined): string {
  return JSON.stringify({
    company: (["id", "name", "cnpj", "sector"] as const).map((k) => co?.[k] ?? ""),
    closing: (["id", "companyId", "start", "end", "regime", "framework", "purpose"] as const).map((k) => cl?.[k] ?? ""),
  });
}

export type EstadoDasEntradas = {
  processed?: { id: string; sha256: string; extractedAt: string; active?: boolean }[];
  corrections?: Record<string, unknown>;
  tolerance?: number;
};

/** Assinatura das entradas: documentos ativos (id, hash, extração), correções e tolerância. */
export function inputKey(s: EstadoDasEntradas): string {
  return JSON.stringify({
    documents: (s.processed ?? [])
      .filter((d) => d.active !== false)
      .map((d) => [d.id, d.sha256, d.extractedAt])
      .sort((a, b) => a[0].localeCompare(b[0])),
    corrections: Object.entries(s.corrections ?? {}).sort(([a], [b]) => a.localeCompare(b)),
    tolerance: s.tolerance,
  });
}

export function validRun(
  run: { contextKey?: string; inputKey?: string } | null | undefined,
  co: Empresa | null | undefined,
  cl: Fechamento | null | undefined,
  s: EstadoDasEntradas,
): boolean {
  return !!run && run.contextKey === contextKey(co, cl) && run.inputKey === inputKey(s);
}

export function moneyBR(v: number): string {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v);
}

/** O PL do balancete exclui o resultado ainda não encerrado; sem DRE, receita e resultado podem vir do balancete ou do razão. */
export function positionNote(summary: Resumo | null | undefined, key: string): string {
  if (key === "equity" && summary?.openResult) return " (sem o resultado não encerrado)";
  const s = (summary as Record<string, unknown> | null | undefined)?.[key + "Source"];
  return s === "balancete" ? " (balancete, antes do encerramento)" : s === "razão" ? " (razão)" : "";
}

const MANUAL_STATES: [string, string][] = [
  ["Confere no escopo", "conferem no escopo"],
  ["Confere em parte", "conferem em parte"],
  ["Pendente", "pendentes"],
  ["Divergência", "com divergência"],
  ["Não executado", "não executados"],
  ["Conferência manual", "de conferência manual"],
];

export function manualSummary(manual: ItemDoManual[]): string {
  return (
    `${manual.length} itens: ` +
    MANUAL_STATES.map(([s, label]) => [manual.filter((m) => m.status === s).length, label] as const)
      .filter(([n]) => n)
      .map(([n, label]) => `${n} ${label}`)
      .join(", ")
  );
}

type DocumentoDaExecucao = { name: string; sha256: string; kind?: string; interpreted?: boolean };

/** Como cada documento foi lido: interpretado, só arquivado ou em quarentena (R01). */
export function documentReading(r: Pick<Analise, "tests">, d: DocumentoDaExecucao): string {
  if (!d.kind) return "";
  const blocked = r.tests.some((t) => t.id === "R01" && t.status === "Bloqueado" && t.source === d.name);
  return ` · ${d.kind} · ${blocked ? "em quarentena (R01)" : d.interpreted ? "interpretado" : "não interpretado (só arquivado)"}`;
}

export const MANUAL_NOTE = 'Itens na ordem do "Manual de Conferência do Balanço" do time; "Conferência manual" depende de sistema externo e não é aprovação.';

/** Linha do motor por trás de um item; as partes dizem o que deu o estado, porque a mesma linha pode diferir entre itens. */
export function manualRef(x: ItemDoManual["refs"][number]): string {
  const p = x.parts ?? [];
  return `${x.id} · ${x.title}` + (p.length ? " — " + p.map((q) => (p.length > 1 ? `${q.name}: ${q.status}` : q.name)).join(", ") : "") + ` · ${x.status}`;
}

function manualMarkdown(r: { manual?: ItemDoManual[] }): string {
  if (!r.manual) return "Execução anterior ao relatório por item do manual: execute a análise novamente.";
  const manual = r.manual;
  return (
    manualSummary(manual) +
    ". " +
    MANUAL_NOTE +
    "\n\n" +
    [...new Set(manual.map((m) => m.section))]
      .map((s) => {
        const items = manual.filter((m) => m.section === s);
        return (
          `### ${items[0].item.split(".")[0]}. ${s}\n\n` +
          items.map((m) => `- ${m.item} ${m.title}: ${m.status}.` + (m.refs.length ? ` Base: ${m.refs.map(manualRef).join("; ")}.` : "") + (m.note ? ` ${m.note}` : "")).join("\n")
        );
      })
      .join("\n\n")
  );
}

type ExecucaoParaRelatorio = Pick<Analise, "tests" | "summary" | "conclusion" | "version"> & {
  manual?: ItemDoManual[];
  company: Pick<Empresa, "name" | "cnpj">;
  closing: Pick<Fechamento, "start" | "end" | "regime">;
  runId: string;
  executedAt: string;
  documents: DocumentoDaExecucao[];
};

type AchadoParaRelatorio = {
  id: string;
  title: string;
  kind: string;
  value: number;
  fact: string;
  source: string;
  action: string;
  owner: string;
  status: string;
  impact: string;
};

/** Relatório de inconsistências em Markdown: posição, itens do manual, testes, pendências e rastreabilidade. */
export function reportMarkdown(r: ExecucaoParaRelatorio, findings: AchadoParaRelatorio[], notes: Record<string, string>): string {
  const testDifference = (t: Analise["tests"][number]) =>
    t.difference == null ? "Não quantificada" : t.id === "R04" ? String(t.difference) + " linha(s)" : moneyBR(t.difference / 100);
  const summary = r.summary as Record<string, number | undefined>;
  return (
    `# Relatório de inconsistências - ${r.company.name}\n\nCNPJ ${r.company.cnpj} | ${r.closing.start} a ${r.closing.end}\nRegime declarado: ${r.closing.regime}\nVersão ${r.version} | Execução ${r.runId} | ${r.executedAt}\n\nConclusão: ${r.conclusion}. Revisão parcial; nenhum ajuste lançado.\n\n## Posição identificada\n\n` +
    Object.entries({ Ativo: "assets", "Patrimônio líquido": "equity", "Receita bruta": "grossRevenue", Resultado: "result" })
      .map(([k, key]) => `- ${k}: ${summary[key] == null ? "Não identificado" : moneyBR((summary[key] as number) / 100) + positionNote(r.summary, key)}`)
      .join("\n") +
    "\n\n## Conferência por item do manual\n\n" +
    manualMarkdown(r) +
    "\n\n## Testes e diferenças\n\n" +
    r.tests
      .map(
        (t) =>
          `### ${t.id} - ${t.title}\n\nEstado: ${t.status}\nDiferença/exceções: ${testDifference(t)}\nFórmula: ${t.formula || "Não aplicável"}\nMotivo/limite: ${t.reason || "Conforme o escopo do teste"}\nFonte: ${t.source}`,
      )
      .join("\n\n") +
    "\n\n## Pendências e providências\n\n" +
    findings
      .map(
        (f) =>
          `### ${f.id} - ${f.title}\n\nNatureza: ${f.kind}\nValor sob revisão: ${f.value ? moneyBR(f.value) : "Não quantificado"}\nFato: ${f.fact}\nFonte: ${f.source}\nAção: ${f.action}\nResponsável: ${f.owner} | Estado: ${f.status}\nEfeito: ${f.impact}\nNota: ${notes[f.id] || "Nenhuma"}`,
      )
      .join("\n\n") +
    "\n\n## Rastreabilidade\n\n" +
    r.documents.map((d) => `- ${d.name}${documentReading(r, d)} | SHA-256 ${d.sha256}`).join("\n") +
    `\n\n${IDENTIFICACAO} Testes não executados não equivalem a aprovação. Valores sob revisão não são perdas confirmadas.`
  );
}

export type { Documento };
