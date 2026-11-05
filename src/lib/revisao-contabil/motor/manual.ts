// Relatório por item do "Manual de Conferência do Balanço" do time contábil (bloco 6 do original).
// Portado de `dist/engine.py` (AudTool R_12 provisório, commit 92658a2): `MANUAL`, `manual_status`,
// `manual_matrix` e `interpreted`. O mapeamento item → regras é uma proposta para o time revisar: itens e
// lacunas mudam aqui, sem mexer nas regras.

import { unicos, verdade } from "./py";
import type { EstadoDoItem, Fatos, ItemDoManual, Teste } from "./tipos";

export const MANUAL_SECTIONS: Record<string, string> = {
  "1": "Faturamento, receitas, notas fiscais e custos",
  "2": "Folha de pagamento e encargos",
  "3": "Despesas e apropriações mensais",
  "4": "Tributos e parcelamentos",
  "5": "Regime tributário e patrimônio líquido",
  "6": "Saldos, natureza das contas e ativo imobilizado",
  "7": "Contas a receber, fornecedores e caixa",
  "8": "Conferência final",
};

/** (código, título da linha do motor[, partes da linha]) */
export type Referencia = [string, string] | [string, string, string[]];
export type ItemManual = { item: string; title: string; refs: Referencia[]; gap: string | null; manual: string | null; derived: string[] };

function manualItem(item: string, title: string, o: { refs?: Referencia[]; gap?: string; manual?: string; derived?: string[] } = {}): ItemManual {
  return { item, title, refs: o.refs ?? [], gap: o.gap ?? null, manual: o.manual ?? null, derived: o.derived ?? [] };
}

const DAILY = "Saldos diários contrários à natureza";
const MONTHLY = "Lançamentos mensais recorrentes";
const PROVISIONS = "Provisões mensais de férias e 13º";
const PAYROLL_LINE = "Folha: baixa de salários, pró-labore, férias e 13º";
const INSTALMENTS = "Parcelamentos: juros e LP→CP";
const AGED_LINE = "Saldos antigos em aberto (fornecedores e adiantamentos)";

export const MANUAL: ItemManual[] = [
  manualItem("1.1", "Faturamento × receitas, separando serviços e vendas", {
    refs: [
      ["C01", "Faturamento: soma dos meses × total"],
      ["C01", "Faturamento × receita (mensal)"],
      ["C01", "Faturamento × receita bruta (total)"],
      ["C01", "Serviços: soma das linhas × Total Geral"],
      ["C01", "Serviços × receita de serviços"],
      ["C01", "Vendas × receita de vendas"],
    ],
  }),
  manualItem("1.2", "Redução do pedágio, quando aplicável", { gap: "Sem regra nesta versão." }),
  manualItem("1.3", "Notas fiscais de entrada e de saída por CFOP", {
    refs: [
      ["C03", "Entradas: soma das linhas × Total Geral"],
      ["C03", "Entradas × fornecedores"],
      ["C03", "XML/CFOP"],
    ],
    gap: "Saídas (vendas) sem relatório.",
  }),
  manualItem("1.4", "Tributos provisionados em todos os meses e só nos meses com faturamento", {
    refs: [
      ["C04", "Tributos sobre receita × meses com faturamento"],
      ["C16-C20", "Tributos sobre receita × meses com receita"],
    ],
  }),
  manualItem("1.5", "Baixa do estoque e apuração do CMV (indústria e comércio)", { gap: "Sem regra nesta versão." }),
  manualItem("2.1", "Folha de pagamento da empresa no Domínio", { manual: "Domínio" }),
  manualItem("2.2", "Resumo da folha de janeiro a dezembro", { manual: "Domínio" }),
  manualItem("2.3", "Baixa de salários, férias, 13º e pró-labore", {
    refs: [["C06-C11", PAYROLL_LINE, ["Salários a pagar", "Férias a pagar", "13º salário a pagar", "Pró-labore a pagar"]]],
  }),
  manualItem("2.4", "Baixa dos adiantamentos de férias e de 13º", {
    refs: [["C06-C11", PAYROLL_LINE, ["Adiantamento de 13º salário"]]],
    gap: "Adiantamento de férias não conferido.",
  }),
  manualItem("2.5", "Provisões mensais de férias e do FGTS e INSS sobre férias, sem variação significativa", {
    refs: [["C06-C11", PROVISIONS, ["Provisão de férias", "FGTS sobre provisão de férias", "INSS sobre provisão de férias"]]],
    gap: "Variação significativa não conferida: limite a definir pelo time.",
  }),
  manualItem("2.6", "Provisões de 13º e do INSS e FGTS sobre 13º zeradas no fechamento anual", {
    refs: [["C06-C11", "Provisões de 13º zeradas no fechamento anual", ["Provisão de 13º salário", "FGTS sobre provisão de 13º", "INSS sobre provisão de 13º"]]],
  }),
  manualItem("2.7", "Guias pagas no FGTS Digital baixadas", {
    refs: [["C06-C11", "Folha: encargos, resumo e FGTS Digital"]],
    manual: "FGTS Digital; guia em aberto deve ser comunicada ao Departamento Pessoal",
  }),
  manualItem("3.1", "Despesas fixas mensais provisionadas em todos os meses", {
    refs: [["C12-C15", MONTHLY, ["Água e esgoto", "Aluguel", "Energia elétrica", "Telefone", "Internet", "Assistência médica", "Vale-transporte"]]],
  }),
  manualItem("3.2", "Honorários contábeis provisionados em todos os meses", { refs: [["C12-C15", MONTHLY, ["Honorários contábeis"]]] }),
  manualItem("3.3", "Juros de financiamentos e parcelamentos apropriados mensalmente", { refs: [["C16-C20", INSTALMENTS, ["Juros"]]] }),
  manualItem("3.4", "Quotas do Sicredi e parcelas de consórcio em todos os meses", { refs: [["C12-C15", MONTHLY, ["Cotas de cooperativa", "Consórcio"]]] }),
  manualItem("4.1", "Impostos federais baixados conforme o e-CAC, sem saldo descoberto", {
    refs: [
      ["C16-C20", "e-CAC: composição × total das guias"],
      ["C16-C20", "Guias do e-CAC × baixas no razão"],
      ["C16-C20", "Baixas de tributos federais × guias do e-CAC"],
      ["C29", DAILY, ["Tributos"]],
    ],
  }),
  manualItem("4.2", "Parcelamentos da pasta do servidor provisionados", { manual: "Pasta de parcelamentos no servidor" }),
  manualItem("4.3", "Apropriação mensal do parcelamento do longo para o curto prazo", { refs: [["C16-C20", INSTALMENTS, ["LP→CP"]]] }),
  manualItem("4.4", "Juros mensais e baixas dos parcelamentos conforme o e-CAC", {
    refs: [
      ["C16-C20", INSTALMENTS, ["Juros"]],
      ["C16-C20", "Guias do e-CAC × baixas no razão"],
      ["C16-C20", "Baixas de tributos federais × guias do e-CAC", ["Baixas de parcelamentos"]],
    ],
  }),
  manualItem("4.5", "Parcelamento não pago: rescisão e retorno do saldo ao tributo", { refs: [["C16-C20", "Retenções e rescisão de parcelamentos"]] }),
  manualItem("4.6", "Retenções provisionadas", { refs: [["C16-C20", "Retenções e rescisão de parcelamentos"]] }),
  manualItem("4.7", "Simples, ICMS, PIS, COFINS, IRPJ e CSLL provisionados mensalmente, quando aplicável", {
    refs: [["C16-C20", "Tributos sobre receita × meses com receita"]],
    gap: "IRPJ e CSLL não conferidos: a periodicidade depende do regime.",
  }),
  manualItem("5.1", "Regime tributário confirmado; no Lucro Real, lucro no período", {
    manual: "Enquadramento da empresa (o regime do cadastro é declarado, não comprovado)",
  }),
  manualItem("5.2", "Alteração do capital social contabilizada", { refs: [["C22", "Alteração do capital social"]] }),
  manualItem("5.3", "Origem dos lançamentos em ajustes de exercícios anteriores", {
    refs: [
      ["R06", "Ajustes de exercícios anteriores"],
      ["R06", "Ponte do PL sem demais movimentos"],
    ],
  }),
  manualItem("5.4", "Tratamento dos ajustes (tributos ou saldos de clientes nas próprias contas)", { manual: "Julgamento do revisor sobre cada ajuste do item 5.3" }),
  manualItem("6.1", "Saldos de acordo com a natureza das contas", {
    refs: [
      ["C25", "Natureza dos saldos no balancete"],
      ["C29", DAILY, ["Saldo final"]],
    ],
  }),
  manualItem("6.2", "Bens do ativo imobilizado lançados", { refs: [["C25", "Cadastro do imobilizado"]] }),
  manualItem("6.3", "Depreciação contabilizada em todos os meses", { refs: [["C25", "Depreciação mensal"]] }),
  manualItem("7.1", "Fornecedores antigos em aberto", { refs: [["R16", AGED_LINE, ["Fornecedores"]]] }),
  manualItem("7.2", "Saldos de adiantamentos de clientes, a fornecedores e de empréstimos de sócios", {
    refs: [
      ["C27", "Adiantamentos e empréstimos de sócios"],
      ["R16", AGED_LINE, ["Adiantamentos"]],
    ],
  }),
  manualItem("7.3", "Exceção para empresas com BPO ou controle financeiro com a equipe", { manual: "Procedimento de BPO da empresa, antes de transferir saldos (item 7.2)" }),
  manualItem("7.4", "Caixa, fornecedores e clientes sem saldo negativo em nenhum dia", { refs: [["C29", DAILY, ["Caixa e bancos", "Clientes", "Fornecedores"]]] }),
  manualItem("8.1", "Provisões mensais aplicáveis registradas", { derived: ["2.5", "3.1", "3.2", "3.4", "4.7"] }),
  manualItem("8.2", "Baixas de pagamentos contabilizadas", { derived: ["2.3", "2.4", "4.1", "4.4"] }),
  manualItem("8.3", "Saldos de acordo com a natureza", { derived: ["6.1", "7.4"] }),
  manualItem("8.4", "Diferenças e saldos antigos esclarecidos ou encaminhados para validação", { manual: "Revisão dos achados pelo time" }),
];

/** Estado de um item pelo pior caso das suas linhas; parte não executada ou lacuna conhecida limitam a "Confere em parte". */
export function manualStatus(statuses: string[], gap: string | null = null): EstadoDoItem {
  if (statuses.includes("Divergência")) return "Divergência";
  if (statuses.includes("Pendente")) return "Pendente";
  if (!statuses.some((s) => s === "Confere no escopo" || s === "Confere em parte")) return "Não executado";
  return gap || statuses.some((s) => s !== "Confere no escopo") ? "Confere em parte" : "Confere no escopo";
}

/** Relatório por item do manual (bloco 6). Itens que dependem de sistema externo são "Conferência manual", nunca aprovação. */
export function manualMatrix(tests: Pick<Teste, "id" | "title" | "status" | "reason" | "parts">[], findings: unknown[], closing: { regime?: string }): ItemDoManual[] {
  const lines = new Map<string, Pick<Teste, "id" | "title" | "status" | "reason" | "parts">>();
  for (const t of tests) {
    const k = t.id + "\u0000" + t.title;
    if (!lines.has(k)) lines.set(k, t);
  }
  const out: ItemDoManual[] = [];
  const done = new Map<string, EstadoDoItem>();
  for (const m of MANUAL) {
    const refs: ItemDoManual["refs"] = [];
    const notes: string[] = m.gap ? [m.gap] : [];
    for (const ref of m.refs) {
      const [id, title] = ref;
      const t = lines.get(id + "\u0000" + title);
      let used: { name: string; status: string }[] | null = null;
      let st: string;
      if (t === undefined) {
        st = "Não executado";
        notes.push(`${id} ${title}: teste não gerado nesta execução.`);
      } else if (ref.length > 2 && t.status !== "Não executado" && t.parts !== undefined) {
        const parts = t.parts ?? {};
        const ps = (ref[2] as string[]).map((p) => [p, Object.prototype.hasOwnProperty.call(parts, p) ? parts[p] : "Não localizado"] as const);
        used = ps.filter(([, s]) => s !== "Não localizado").map(([p, s]) => ({ name: p, status: s }));
        const missing = ps.filter(([, s]) => s === "Não localizado").map(([p]) => p);
        st = used.length ? manualStatus(used.map((u) => u.status)) : "Não executado";
        if (missing.length) notes.push(`Não localizado (conferir se aplicável): ${missing.join(", ")}.`);
      } else {
        st = t.status === "Bloqueado" ? "Não executado" : t.status;
        if (st === "Não executado" && t.reason) notes.push(id + ": " + t.reason);
      }
      // As partes dizem por que a mesma linha tem estado diferente em cada item.
      refs.push({ id, title, status: st, ...(used && used.length ? { parts: used } : {}) });
    }
    let status: EstadoDoItem;
    if (m.manual) {
      status = "Conferência manual";
      notes.unshift(`Conferir em: ${m.manual}.`);
      if (m.item === "5.1") notes.push(`Regime declarado no cadastro: ${closing.regime || "Não informado"}.`);
      if (m.item === "8.4") notes.push(`${findings.length} achado(s) nesta execução a esclarecer ou encaminhar.`);
    } else if (m.derived.length) {
      status = manualStatus(m.derived.map((x) => done.get(x) as string));
      notes.push(`Resume os itens ${m.derived.join(", ")}.`);
    } else status = manualStatus(refs.map((r) => r.status), m.gap);
    done.set(m.item, status);
    out.push({ item: m.item, section: MANUAL_SECTIONS[m.item.split(".")[0]], title: m.title, status, refs, note: unicos(notes).join(" ") });
  }
  return out;
}

/** Documento interpretado pelo motor (balancete, razão, relatório fiscal, comprovantes, DRE ou balanço com rubricas); os demais ficam só arquivados. */
export function interpreted(f: Partial<Fatos>): boolean {
  return Boolean(
    verdade(f.accounts) ||
      verdade(f.ledger?.accounts) ||
      verdade(f.fiscal) ||
      verdade(f.payments) ||
      ((f.kind === "DRE" || f.kind === "Balanço") && verdade(f.statements)),
  );
}
