// Testes do relatório e da validade da execução, portados de `tests/review-state.test.mjs` do original
// (AudTool R_12 provisório, commit 92658a2). As asserções são as do original; ficam de fora as de backup e
// sessão do navegador, que não vêm para o Connect. A frase da identificação mudou (sem a marca KPMG).

import { describe, expect, test } from "vitest";
import { contextKey, IDENTIFICACAO, inputKey, reportMarkdown, validRun } from "./relatorio";
import type { ItemDoManual, Teste } from "./tipos";

const co = { id: "company", name: "Teste", cnpj: "123", sector: "Não informado" };
const cl = { id: "closing", companyId: "company", start: "2026-01-01", end: "2026-06-30", regime: "Não informado", framework: "A confirmar", purpose: "Teste" };
const state = () => ({ processed: [{ id: "doc", sha256: "a".repeat(64), extractedAt: "t", active: true }], corrections: {}, tolerance: 0.01 });
const teste = (t: Partial<Teste> & Pick<Teste, "id" | "title" | "status" | "source">): Teste => ({ difference: null, formula: "", reason: "", ...t });

describe("validade da execução", () => {
  test("dados de empresa, período e regime nunca reutilizam relatório anterior", () => {
    const s = state();
    const r = { contextKey: contextKey(co, cl), inputKey: inputKey(s) };
    expect(validRun(r, co, cl, s)).toBe(true);
    for (const [obj, k, v] of [
      ["co", "cnpj", "999"],
      ["co", "name", "Outro"],
      ["cl", "start", "2025-01-01"],
      ["cl", "end", "2026-09-30"],
      ["cl", "regime", "Lucro Real"],
    ] as const)
      expect(validRun(r, obj === "co" ? { ...co, [k]: v } : co, obj === "cl" ? { ...cl, [k]: v } : cl, s)).toBe(false);
  });

  test("nova extração, seleção e tolerância invalidam assinatura das entradas", () => {
    const s = state();
    const r = { contextKey: contextKey(co, cl), inputKey: inputKey(s) };
    const mudancas: ((x: ReturnType<typeof state>) => void)[] = [
      (x) => (x.processed[0].active = false),
      (x) => (x.processed[0].extractedAt = "novo"),
      (x) => (x.tolerance = 0.02),
      (x) => (x.corrections = { "doc:0": { closing: 1 } }),
    ];
    for (const change of mudancas) {
      const copy = structuredClone(s);
      change(copy);
      expect(validRun(r, co, cl, copy)).toBe(false);
    }
  });
});

describe("relatório em Markdown", () => {
  const base = { company: co, closing: cl, runId: "r", executedAt: "agora", conclusion: "Inconclusivo" as const };

  test("MD contém valor, diferença, fórmula e fonte", () => {
    const r = { ...base, version: "R_11", summary: { assets: 10000 }, documents: [], tests: [teste({ id: "R06", title: "PL", difference: 639641, formula: "PL - resultado", status: "Pendente", source: "DRE" })] };
    const md = reportMarkdown(
      r,
      [{ id: "G01", title: "Pendência", value: 439981.94, kind: "Suporte", fact: "Fato", source: "Balancete", action: "Obter razão", owner: "Contabilidade", status: "Aberto", impact: "A confirmar" }],
      {},
    );
    expect(md).toContain("6.396,41");
    expect(md).toContain("439.981,94");
    expect(md).toContain("PL - resultado");
    expect(md).toContain("Balancete");
  });

  test("MD informa a origem da receita e do resultado lidos sem DRE e o PL sem o resultado não encerrado", () => {
    const r = {
      ...base,
      version: "R_11",
      summary: { equity: -40335021, openResult: -27300401, grossRevenue: 2690200, grossRevenueSource: "razão" as const, result: -27300401, resultSource: "balancete" as const },
      documents: [],
      tests: [],
    };
    const md = reportMarkdown(r, [], {});
    expect(md).toMatch(/Patrimônio líquido: -R\$\s403\.350,21 \(sem o resultado não encerrado\)/);
    expect(md).toMatch(/Receita bruta: R\$\s26\.902,00 \(razão\)/);
    expect(md).toMatch(/Resultado: -R\$\s273\.004,01 \(balancete, antes do encerramento\)/);
    expect(md).toMatch(/Ativo: Não identificado\n/);
    const plain = reportMarkdown({ ...r, summary: { equity: 100, result: 5000 } }, [], {});
    expect(plain.includes("antes do encerramento") || plain.includes("não encerrado")).toBe(false);
  });

  test("MD traz a conferência por item do manual e a leitura de cada documento", () => {
    const manual: ItemDoManual[] = [
      { item: "2.1", section: "Folha de pagamento e encargos", title: "Folha no Domínio", status: "Conferência manual", refs: [], note: "Conferir em: Domínio." },
      { item: "2.3", section: "Folha de pagamento e encargos", title: "Baixa de salários", status: "Confere no escopo", refs: [{ id: "C06-C11", title: "Folha: baixa", status: "Confere no escopo" }], note: "" },
      {
        item: "3.1",
        section: "Despesas e apropriações mensais",
        title: "Despesas fixas",
        status: "Pendente",
        refs: [
          { id: "C12-C15", title: "Recorrentes", status: "Pendente", parts: [{ name: "Água", status: "Pendente" }, { name: "Telefone", status: "Confere no escopo" }] },
          { id: "C29", title: "Saldos diários", status: "Confere no escopo", parts: [{ name: "Saldo final", status: "Confere no escopo" }] },
        ],
        note: "",
      },
    ];
    const r = {
      ...base,
      version: "R_12",
      summary: {},
      manual,
      documents: [
        { name: "Balancete.pdf", sha256: "a", kind: "Balancete", interpreted: true },
        { name: "Outro.txt", sha256: "b", kind: "Texto", interpreted: false },
        { name: "Antigo.pdf", sha256: "c", kind: "Balancete", interpreted: true },
        { name: "Sem tipo.pdf", sha256: "d" },
      ],
      tests: [teste({ id: "R01", title: "Antigo.pdf · identidade/período", status: "Bloqueado", source: "Antigo.pdf" })],
    };
    const md = reportMarkdown(r, [], {});
    expect(md).toContain("## Conferência por item do manual\n\n3 itens: 1 conferem no escopo, 1 pendentes, 1 de conferência manual.");
    expect(md).toContain(
      "### 2. Folha de pagamento e encargos\n\n- 2.1 Folha no Domínio: Conferência manual. Conferir em: Domínio.\n- 2.3 Baixa de salários: Confere no escopo. Base: C06-C11 · Folha: baixa · Confere no escopo.\n\n### 3. Despesas",
    );
    expect(md).toContain(
      "- 3.1 Despesas fixas: Pendente. Base: C12-C15 · Recorrentes — Água: Pendente, Telefone: Confere no escopo · Pendente; C29 · Saldos diários — Saldo final · Confere no escopo.",
    );
    for (const s of ["- Balancete.pdf · Balancete · interpretado |", "- Outro.txt · Texto · não interpretado (só arquivado) |", "- Antigo.pdf · Balancete · em quarentena (R01) |", "- Sem tipo.pdf | SHA-256 d"])
      expect(md).toContain(s);
    expect(md.indexOf("## Conferência por item")).toBeLessThan(md.indexOf("## Testes e diferenças"));
    const old = reportMarkdown({ ...r, manual: undefined }, [], {});
    expect(old).toContain("Execução anterior ao relatório por item do manual");
  });

  test("identificação do roteiro sem marca de terceiros", () => {
    const md = reportMarkdown({ ...base, version: "R_12", summary: {}, documents: [], tests: [] }, [], {});
    expect(md).toContain(IDENTIFICACAO);
    expect(md).not.toMatch(/KPMG/i);
  });
});
