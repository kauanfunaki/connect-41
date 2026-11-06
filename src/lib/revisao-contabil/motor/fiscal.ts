// Documentos fiscais × contabilidade (bloco 3 do original; manual do time, seção 1): C01 faturamento ×
// receitas, separando serviços e vendas; C03 entradas; C04 tributos só nos meses com faturamento.
// Portado de `dist/engine.py` (AudTool R_12 provisório, commit 92658a2), função `fiscal_checks`.
// Cópia fiel: só totais e CFOPs; nomes de clientes e de signatários nunca entram em testes ou achados.

import { brl, monthLabel, periodMonths } from "./base";
import type { ContextoDeReceita } from "./razao";
import { ordenados, soma, strip } from "./py";
import type { Documento, RegistraAchado, RegistraTeste, TotalFiscal } from "./tipos";

export const FISCAL_LINES: [string, string][] = [
  ["C01", "Faturamento: soma dos meses × total"],
  ["C01", "Faturamento × receita (mensal)"],
  ["C01", "Faturamento × receita bruta (total)"],
  ["C01", "Serviços: soma das linhas × Total Geral"],
  ["C01", "Serviços × receita de serviços"],
  ["C01", "Vendas × receita de vendas"],
  ["C03", "Entradas: soma das linhas × Total Geral"],
  ["C03", "Entradas × fornecedores"],
  ["C04", "Tributos sobre receita × meses com faturamento"],
];
export const FISCAL_DOCS: Record<string, [string, string]> = {
  Faturamento: ["declaração de faturamento", "Declaração de faturamento não fornecida."],
  Serviços: ["relatório de serviços", "Relatório de serviços não fornecido."],
  Entradas: ["relatório de entradas", "Relatório de entradas não fornecido."],
};
export const REGIME_NOTE = " Regime de caixa, notas canceladas ou emitidas em outro mês podem explicar diferenças; o regime não é presumido.";

/** Referência contábil: (valor, fonte, como, ressalva). */
export type Referencia = [number, string, string, string];

export function fiscalChecks(
  docs: Documento[],
  ctx: ContextoDeReceita | null,
  ref: { gross: Referencia | null; services: Referencia | null; suppliers: Referencia | null },
  closing: { start: string; end: string },
  tolerance: number,
  test: RegistraTeste,
  finding: RegistraAchado,
): void {
  const by = new Map<string, Documento[]>();
  const months = periodMonths(closing.start, closing.end);
  for (const d of docs) {
    const r = d.facts.fiscal!.report;
    if (!by.has(r)) by.set(r, []);
    by.get(r)!.push(d);
  }
  const pick = (report: string): [Documento | null, string] => {
    const ds = by.get(report) ?? [];
    const [label, absent] = FISCAL_DOCS[report];
    return ds.length === 1 ? [ds[0], ""] : [null, ds.length ? `Mais de um ${label} no fechamento; selecione uma versão.` : absent];
  };
  const where = (d: Documento, t: TotalFiscal | null) => d.name + (t ? ` p. ${t.page} linha ${t.line}` : "");
  const [fat, whyF] = pick("Faturamento");
  const [srv, whyS] = pick("Serviços");
  const [ent, whyE] = pick("Entradas");
  // Integridade: meses ou linhas somam o total do próprio documento.
  for (const [d, why, id, title, unit] of [
    [fat, whyF, "C01", "Faturamento: soma dos meses × total", ["dos meses", "mês(es) lido(s)"]],
    [srv, whyS, "C01", "Serviços: soma das linhas × Total Geral", ["das linhas", "linha(s) lida(s)"]],
    [ent, whyE, "C03", "Entradas: soma das linhas × Total Geral", ["das linhas", "linha(s) lida(s)"]],
  ] as [Documento | null, string, string, string, [string, string]][]) {
    if (d === null) {
      test(id, title, "Não executado", "Documentos", null, "", why);
      continue;
    }
    const x = d.facts.fiscal!;
    if (x.total === null) {
      test(id, title, "Não executado", d.name, null, "", "Total do documento não identificado; conferir leitura.");
      continue;
    }
    const diff = x.itemsTotal - x.total.value;
    test(id, title, Math.abs(diff) > tolerance ? "Divergência" : "Confere no escopo", d.name, diff, `Soma ${unit[0]} - total do documento`, `${x.items} ${unit[1]}.`);
    if (Math.abs(diff) <= tolerance) continue;
    if (x.report === "Faturamento")
      finding(
        "Declaração de faturamento: soma dos meses difere do total",
        "Faturamento",
        Math.abs(diff),
        "Erro aritmético",
        where(d, x.total),
        `Soma dos valores mensais (${brl(x.itemsTotal)}) difere do total declarado (${brl(x.total.value)}).`,
        "Conferir a declaração com o relatório do sistema fiscal antes de usar o total.",
        "Média",
      );
    else
      finding(
        `Relatório de ${x.report.toLowerCase()}: soma das linhas difere do Total Geral`,
        "Leitura",
        Math.abs(diff),
        "Evidência insuficiente",
        where(d, x.total),
        `Soma das linhas lidas (${brl(x.itemsTotal)}) difere do Total Geral (${brl(x.total.value)}); pode haver linha não lida ou repetida.`,
        "Conferir a leitura do relatório no original.",
        "Média",
      );
  }
  // Faturamento mensal × receita do razão.
  let title = "Faturamento × receita (mensal)";
  if (fat === null) test("C01", title, "Não executado", "Documentos", null, "", whyF);
  else if (!ctx) test("C01", title, "Não executado", fat.name, null, "", "Receita mensal exige razão com o grupo de resultado confirmado pelo balancete e contas de receita.");
  else {
    const diffs: [string, number, number][] = [];
    let seen = 0;
    for (const [m, v] of fat.facts.fiscal!.months) {
      if (!months.includes(m)) continue;
      seen += 1;
      const r = ctx.revenueMonths.get(m) ?? 0;
      if (Math.abs(v - r) > tolerance) diffs.push([m, v, r]);
    }
    const total = soma(diffs.map(([, v, r]) => Math.abs(v - r)));
    test(
      "C01",
      title,
      diffs.length ? "Pendente" : "Confere no escopo",
      fat.name + " / " + ctx.source,
      total,
      "Faturamento do mês - receita do mês no razão (créditos - débitos fora do encerramento)",
      `${seen} meses comparados, ${diffs.length} com diferença.` + REGIME_NOTE,
    );
    if (diffs.length)
      finding(
        "Faturamento difere da receita contábil no mês",
        "Faturamento",
        total,
        "Divergência entre demonstrações",
        fat.name + " / " + ctx.source,
        "Diferença em " + diffs.map(([m, v, r]) => `${monthLabel(m)} (faturamento ${brl(v)}, receita ${brl(r)})`).join("; ") + ".",
        "Conferir notas emitidas e canceladas no mês e o critério de reconhecimento da receita; não ajustar sem documento.",
        "Média",
      );
  }
  const against = (
    id: string,
    titulo: string,
    d: Documento | null,
    why: string,
    target: Referencia | null,
    missing: string,
    label: string,
    area: string,
    severity: string,
    action: string,
    note = "",
  ) => {
    if (d === null) {
      test(id, titulo, "Não executado", "Documentos", null, "", why);
      return;
    }
    const x = d.facts.fiscal!;
    if (x.total === null) {
      test(id, titulo, "Não executado", d.name, null, "", "Total do documento não identificado; conferir leitura.");
      return;
    }
    if (target === null) {
      test(id, titulo, "Não executado", d.name, null, "", missing);
      return;
    }
    const [value, src, how, caveat] = target;
    const diff = x.total.value - value;
    test(id, titulo, Math.abs(diff) > tolerance ? "Pendente" : "Confere no escopo", d.name + " / " + src, diff, "Total do documento - " + how, strip(caveat + note));
    if (Math.abs(diff) > tolerance)
      finding(
        label,
        area,
        Math.abs(diff),
        "Divergência entre demonstrações",
        where(d, x.total) + " / " + src,
        `Total do documento ${brl(x.total.value)}; contabilidade ${brl(value)} (${how}).`,
        action,
        severity,
      );
  };
  against(
    "C01",
    "Faturamento × receita bruta (total)",
    fat,
    whyF,
    ref.gross ?? null,
    "Receita bruta não localizada no balancete, no razão ou na DRE.",
    "Faturamento difere da receita bruta",
    "Faturamento",
    "Alta",
    "Conferir notas emitidas e canceladas, receitas lançadas em outra conta e o critério de reconhecimento; não ajustar sem documento.",
    REGIME_NOTE,
  );
  against(
    "C01",
    "Serviços × receita de serviços",
    srv,
    whyS,
    ref.services ?? null,
    "Receita de serviços não localizada separadamente no balancete ou no razão.",
    "Serviços diferem da receita de serviços",
    "Faturamento",
    "Alta",
    "Conferir notas de serviço emitidas e canceladas e a conta de receita usada; não ajustar sem documento.",
    REGIME_NOTE,
  );
  test("C01", "Vendas × receita de vendas", "Não executado", "Documentos", null, "", "Relatório de saídas (vendas) sem leitor nesta versão; a amostra disponível só tem serviços.");
  against(
    "C03",
    "Entradas × fornecedores",
    ent,
    whyE,
    ref.suppliers ?? null,
    "Conta de fornecedores não localizada no balancete.",
    "Entradas diferem dos créditos em fornecedores",
    "Entradas",
    "Média",
    "Conferir compras à vista (que não passam por fornecedores), notas lançadas em outro período e devoluções; não ajustar sem documento.",
  );
  // Tributos sobre receita só nos meses faturados; IRPJ/CSLL dependem do regime, que não é presumido.
  title = "Tributos sobre receita × meses com faturamento";
  if (fat === null) test("C04", title, "Não executado", "Documentos", null, "", whyF);
  else if (!ctx || ctx.taxMonths === null)
    test(
      "C04",
      title,
      "Não executado",
      fat.name,
      null,
      "",
      "Contas de tributo sobre receita (Simples, ISS, ICMS, PIS, COFINS) não localizadas no razão, ou grupo de resultado não confirmado.",
    );
  else {
    const billed = new Set(fat.facts.fiscal!.months.filter(([m, v]) => months.includes(m) && v > tolerance).map(([m]) => m));
    const taxed = new Set([...ctx.taxMonths].filter((m) => months.includes(m)));
    const extra = ordenados([...taxed].filter((m) => !billed.has(m)));
    const lacking = ordenados([...billed].filter((m) => !taxed.has(m)));
    const src = fat.name + " / " + ctx.source;
    test(
      "C04",
      title,
      extra.length || lacking.length ? "Pendente" : "Confere no escopo",
      src,
      null,
      "Meses com tributo sobre receita = meses com faturamento",
      `${billed.size} meses com faturamento (${ordenados(billed).map(monthLabel).join(", ") || "nenhum"}); ${taxed.size} com tributo lançado. IRPJ/CSLL não conferidos: periodicidade depende do regime.`,
    );
    if (extra.length)
      finding(
        "Tributo lançado em mês sem faturamento",
        "Tributos",
        null,
        "Evidência insuficiente",
        src,
        "Tributo sobre receita lançado em mês sem faturamento declarado: " + extra.map(monthLabel).join(", ") + ".",
        "Confirmar a competência do tributo e o faturamento do mês.",
        "Média",
      );
    if (lacking.length)
      finding(
        "Faturamento sem tributo provisionado no mês",
        "Tributos",
        null,
        "Evidência insuficiente",
        src,
        "Mês com faturamento declarado sem tributo sobre receita lançado: " + lacking.map(monthLabel).join(", ") + ".",
        "Confirmar se o tributo do mês foi provisionado (ou se o regime é de caixa).",
        "Média",
      );
  }
}
