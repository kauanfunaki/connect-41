// Regras sobre os saldos finais do balancete (bloco 5 do original; manual do time, seções 2, 5, 6 e 7).
// Portado de `dist/engine.py` (AudTool R_12 provisório, commit 92658a2), funções `trial_tree`,
// `disjoint`, `pick`, `result_nature` e `trial_checks`. Cópia fiel: os testes-gabarito comparam com o original.

import { brl, dateBr, dc, norm, under } from "./base";
import { re, soma, strip } from "./py";
import {
  accountLabel,
  describeEntries,
  matchPrefix,
  NATURE_SKIP,
  prefixTotals,
  RECURRING,
  type Divisao,
  type Grupos,
  type Partes,
} from "./razao";
import type { ContaBalancete, ContaRazao, Documento, EstadoDaParte, RegistraAchado, RegistraTeste } from "./tipos";

export const TRIAL_LINES: [string, string][] = [
  ["C25", "Natureza dos saldos no balancete"],
  ["R11", "Patrimônio líquido negativo (passivo a descoberto)"],
  ["C06-C11", "Provisões de 13º zeradas no fechamento anual"],
  ["C22", "Alteração do capital social"],
  ["C27", "Adiantamentos e empréstimos de sócios"],
];
// Natureza do resultado pelo nome da conta e dos grupos acima dela; grupo misto (resultado, apuração) não é presumido.
const NATURE_HEAD = re(String.raw`\(-\)|(RECEITAS?|DESPESAS?|CUSTOS?|RESULTADOS?|APURACAO|CONTAS DE)\b`);
const RESULT_CREDIT = re(String.raw`RECEITAS?\b`);
const RESULT_DEBIT = re(String.raw`(DESPESAS?|CUSTOS?)\b`);
const RESULT_MIXED = re(String.raw`(RESULTADOS?|APURACAO|CONTAS DE)\b`);
export const THIRTEENTH_PROVISIONS: [string, string][] = RECURRING.filter(([, label]) => label.includes("13")).map(([, label, , pattern]) => [label, pattern]);
export const CAPITAL = String.raw`(\(-\) )?CAPITAL\b`;
export const CAPITAL_ROWS = ["CAPITAL SOCIAL", "CAPITAL SUBSCRITO", "CAPITAL REALIZADO", "CAPITAL INTEGRALIZADO"];
// Manual, seção 7: (conceito, padrão, padrão do saldo que pode ser compensado, descrição dele); nos sócios, saldos a receber × a pagar.
export const ADVANCES: [string, string, string | null, string | null][] = [
  ["Adiantamentos de clientes", String.raw`ADIANTAMENTOS? (DE |A |RECEBIDOS? DE )?CLIENTES?\b`, String.raw`(CLIENTES|DUPLICATAS A RECEBER)\b`, "clientes a receber"],
  ["Adiantamentos a fornecedores", String.raw`(ADIANTAMENTOS?|ADTOS?) (A |AOS? |DE )?FORNECEDOR`, "FORNECEDOR", "fornecedores a pagar"],
  ["Empréstimos e adiantamentos de sócios", String.raw`(EMPRESTIMOS?|MUTUOS?|ADIANTAMENTOS?|ADTOS?|CONTA CORRENTE|OUTROS DEBITOS|OUTROS CREDITOS|DEBITOS|CREDITOS)\b.*\bSOCI[OA]S?\b`, null, null],
];

/** Classificação de cada linha do balancete e se ela é analítica. */
export type Arvore = { source: "balancete" | "razão"; code: (i: number) => string | null; analytic: (i: number) => boolean };

type Linha = Pick<ContaBalancete, "id" | "code" | "name" | "opening" | "debit" | "credit" | "closing">;

/**
 * Classificação de cada linha do balancete e se ela é analítica; `null` quando não há como saber.
 * Com classificação, o próprio código (analítica = sem filhas). Sem ela, um razão de grupos confirmados: o código do razão para as analíticas (código reduzido, como na R15) e, sob demanda, o prefixo cujas contas somam SI, D, C e SF para as sintéticas.
 */
export function trialTree(rows: Linha[], classified: boolean, accounts: ContaRazao[] | null, separate: boolean, end: string, tolerance: number): Arvore | null {
  if (classified) {
    const parents = new Set<string>();
    for (const r of rows) {
      const p = r.code.split(".");
      for (let k = 1; k < p.length; k++) parents.add(p.slice(0, k).join("."));
    }
    return { source: "balancete", code: (i) => rows[i].code, analytic: (i) => !parents.has(rows[i].code) };
  }
  const byid = new Map((accounts ?? []).map((a) => [a.id, a] as const));
  if (!rows.some((r) => byid.has(r.id))) return null;
  const totals = prefixTotals(accounts ?? [], separate, end);
  const cache = new Map<number, string | null>();
  const code = (i: number): string | null => {
    const a = byid.get(rows[i].id);
    if (a) return a.code;
    if (!cache.has(i)) {
      const hit = matchPrefix(totals, rows[i], tolerance);
      cache.set(i, hit ? hit[0] : null);
    }
    return cache.get(i) as string | null;
  };
  return { source: "razão", code, analytic: (i) => byid.has(rows[i].id) };
}

/** Linhas sem ancestral entre elas (nível mais alto), para nunca somar sintética e analítica. */
export function disjoint(code: (i: number) => string | null, idx: Iterable<number>): number[] {
  const out: number[] = [];
  const ordem = [...idx].sort((a, b) => (code(a) as string).length - (code(b) as string).length || a - b);
  for (const i of ordem) if (!out.some((j) => under(code(i) as string, code(j) as string))) out.push(i);
  return out.sort((a, b) => a - b);
}

/**
 * Linhas de um conceito. Com a classificação das linhas com saldo ou movimento, as de nível mais alto aceitas por keep; sem ela, só a primeira ocorrência (de fallback, quando informado). Linhas zeradas só indicam que o conceito existe. names: nomes já normalizados.
 */
export function pick(
  tree: Arvore | null,
  rows: Linha[],
  match: (n: string) => unknown,
  keep: ((c: string) => boolean) | null = null,
  fallback: ((n: string) => unknown) | null = null,
  names: string[] | null = null,
): number[] {
  const code = tree ? tree.code : () => null;
  const nomes = names ?? rows.map((r) => strip(norm(r.name)));
  const nm = (i: number) => nomes[i];
  const hits = rows.map((_, i) => i).filter((i) => match(nm(i)));
  const live = hits.filter((i) => (["opening", "debit", "credit", "closing"] as const).some((k) => rows[i][k]));
  if (tree && live.every((i) => code(i) !== null)) {
    const sel = live.filter((i) => keep === null || keep(code(i) as string));
    if (sel.length) return disjoint(code, sel);
    return hits.filter((i) => (code(i) !== null ? keep === null || keep(code(i) as string) : (fallback ?? match)(nm(i)))).slice(0, 1);
  }
  const first = rows.findIndex((_, i) => (fallback ?? match)(nm(i)));
  return first < 0 ? [] : [first];
}

/** "D" ou "C" de uma conta de resultado pelos nomes, da própria conta ao grupo mais alto: receita credora, despesa ou custo devedor; "(-)" inverte; grupo misto ou nomes em conflito: null. */
export function resultNature(levels: string[][]): "D" | "C" | null {
  let flip = false;
  for (const names of levels) {
    const kinds = new Set<"D" | "C">();
    for (const n of names) {
      const red = n.startsWith("(-)");
      const t = red ? strip(n.slice(3)) : n;
      flip = flip || red;
      if (RESULT_MIXED.match(t)) return null;
      if (RESULT_CREDIT.match(t)) kinds.add("C");
      else if (RESULT_DEBIT.match(t)) kinds.add("D");
    }
    if (kinds.size > 1) return null;
    if (kinds.size) {
      const k = [...kinds][0];
      return flip ? (k === "C" ? "D" : "C") : k;
    }
  }
  return null;
}

export type Balancete = {
  doc: Documento;
  rows: ContaBalancete[];
  classified: boolean;
  row: (code: string) => ContaBalancete | null;
  results: ContaBalancete[];
  openresult: number;
};

export type RazaoConfirmado = { split: Divisao; g: Grupos; clearing: Set<string>; nature: Set<string> };

export const GROUP_NAMES: Record<string, string[]> = {
  "1": ["ATIVO"],
  "2": ["PASSIVO"],
  "1.1": ["ATIVO CIRCULANTE"],
  "1.2": ["ATIVO NAO-CIRCULANTE", "ATIVO NAO CIRCULANTE"],
  "2.1": ["PASSIVO CIRCULANTE"],
  "2.2": ["PASSIVO NAO-CIRCULANTE", "PASSIVO NAO CIRCULANTE"],
  "2.3": ["PATRIMONIO LIQUIDO"],
};

/** Regras sobre os saldos finais do balancete (bloco 5). O razão só dá a classificação (balancete sem ela) e as contas já conferidas pela C29. */
export function trialChecks(
  tb: Balancete | null,
  ledger: RazaoConfirmado | null,
  closing: { end: string },
  tolerance: number,
  test: RegistraTeste,
  finding: RegistraAchado,
): void {
  if (tb === null) {
    for (const [id, title] of TRIAL_LINES) test(id, title, "Não executado", "Documentos", null, "", "Balancete não fornecido.");
    return;
  }
  const rows = tb.rows;
  const src = tb.doc.name;
  const row = tb.row;
  const end = closing.end;
  const openresult = tb.openresult;
  const g = ledger ? ledger.g : null;
  const where = (r: ContaBalancete) => src + ` p. ${r.page} linha ${r.line} conta ${r.id}`;
  const names = rows.map((r) => strip(norm(r.name)));
  const nm = (r: ContaBalancete) => strip(norm(r.name));
  const listed = (rs: ContaBalancete[]) =>
    rs
      .slice(0, 8)
      .map((r) => accountLabel(r) + " " + dc(r.closing))
      .join("; ") + (rs.length > 8 ? `; e mais ${rs.length - 8}` : "");
  let tree: Arvore | null;
  let asset: boolean;
  let liability: boolean;
  let roots: Set<string>;
  if (tb.classified) {
    tree = trialTree(rows, true, null, false, end, tolerance);
    const named = (c: string) => row(c) !== null && GROUP_NAMES[c].includes(nm(row(c) as ContaBalancete));
    asset = named("1");
    liability = named("2") && named("2.3");
    roots = new Set(tb.results.map((r) => r.code));
  } else if (g) {
    tree = trialTree(
      rows,
      false,
      (ledger as RazaoConfirmado).split.map(([a]) => a),
      Boolean(openresult),
      end,
      tolerance,
    );
    asset = g.asset;
    liability = g.liability && g.equity;
    roots = new Set(g.result);
  } else {
    tree = null;
    asset = liability = false;
    roots = new Set();
  }
  // C25: saldo final × natureza; contas já conferidas dia a dia (C29) não se repetem.
  let title = TRIAL_LINES[0][1];
  if (tree === null)
    test("C25", title, "Não executado", src, null, "", "Balancete sem classificação e sem razão de grupos confirmados: grupos e contas sintéticas não identificados; a natureza não é presumida pelo nome.");
  else {
    const arvore: Arvore = tree;
    const heads = new Map<string, string[]>();
    rows.forEach((_, i) => {
      if (!arvore.analytic(i) && NATURE_HEAD.match(names[i])) {
        const c = arvore.code(i);
        if (c) {
          if (!heads.has(c)) heads.set(c, []);
          heads.get(c)!.push(names[i]);
        }
      }
    });
    const levels = (i: number): string[][] => {
      const parts = (arvore.code(i) as string).split(".");
      const out: string[][] = [[names[i]]];
      for (let k = parts.length - 1; k > 0; k--) {
        const p = parts.slice(0, k).join(".");
        if (heads.has(p)) out.push(heads.get(p) as string[]);
      }
      return out;
    };
    let patr = 0;
    let res = 0;
    let flagged = 0;
    let covered = 0;
    let skipped = 0;
    let reducers = 0;
    let unknown = 0;
    let resrows = 0;
    let total = 0;
    rows.forEach((r, i) => {
      if (!arvore.analytic(i) || (ledger && ledger.clearing.has(r.id))) return;
      const c = arvore.code(i) as string;
      const top = c.split(".")[0];
      let side: "D" | "C";
      let group: string;
      if (roots.has(top)) {
        resrows += 1;
        if (Math.abs(r.closing) <= tolerance) return;
        const s = resultNature(levels(i));
        group = "resultado";
        if (s === null) {
          unknown += 1;
          return;
        }
        side = s;
        res += 1;
      } else if ((top === "1" || top === "2") && Math.abs(r.closing) > tolerance) {
        if (ledger && ledger.nature.has(r.id)) {
          covered += 1;
          return;
        }
        if (under(c, "2.3") || NATURE_SKIP.search(names[i])) {
          skipped += 1;
          return;
        }
        if (!(top === "1" ? asset : liability)) return;
        side = top === "1" ? "D" : "C";
        group = top === "1" ? "ativo" : "passivo";
        if (levels(i).some((ns) => ns.some((x) => x.startsWith("(-)")))) {
          side = side === "D" ? "C" : "D";
          group += ", redutora";
          reducers += 1;
        }
        patr += 1;
      } else return;
      if ((side === "D" && r.closing < -tolerance) || (side === "C" && r.closing > tolerance)) {
        flagged += 1;
        total += Math.abs(r.closing);
        finding(
          "Saldo contrário à natureza no balancete: " + accountLabel(r),
          "Balancete",
          Math.abs(r.closing),
          "Indício para revisão",
          where(r),
          `Saldo ${side === "D" ? "credor" : "devedor"} de ${brl(Math.abs(r.closing))} em ${dateBr(end)} numa conta de natureza ${side === "D" ? "devedora" : "credora"} (${group}).`,
          "Conferir a classificação da conta e os lançamentos e estornos no razão; redutoras devem ter saldo contrário ao da conta que reduzem. Não ajustar o saldo sem documento.",
          "Média",
        );
      }
    });
    let reason = `${patr + res} contas analíticas com saldo conferidas (${patr} patrimoniais e ${res} de resultado), ${flagged} com saldo contrário à natureza.`;
    if (reducers) reason += ` ${reducers} redutoras (-) com natureza invertida.`;
    if (covered) reason += ` ${covered} contas patrimoniais já conferidas pela C29 (saldos diários do razão), sem repetir achado.`;
    if (skipped) reason += ` ${skipped} do PL ou de resultados acumulados fora do teste.`;
    if (unknown) reason += ` ${unknown} de resultado sem natureza identificada (grupo misto ou sem receita, despesa ou custo no nome), não conferidas.`;
    if (resrows && !res && !unknown) reason += " Resultado encerrado no balancete: receitas e despesas zeradas.";
    const missing = (
      [
        ["ativo", asset],
        ["passivo e PL", liability],
      ] as const
    )
      .filter(([, ok]) => !ok)
      .map(([x]) => x);
    if (missing.length) reason += ` Grupos não identificados (${missing.join(", ")}): contas desses grupos não conferidas.`;
    if (arvore.source === "razão") reason += " Balancete sem classificação: classificação tirada do razão pelo código reduzido.";
    test(
      "C25",
      title,
      flagged ? "Divergência" : patr + res + covered ? "Confere no escopo" : "Não executado",
      src,
      flagged ? total : null,
      "Saldo final × natureza (ativo e despesas devedores; passivo e receitas credores; redutoras invertidas)",
      reason,
    );
  }
  // R11: o PL inclui o resultado do período ainda não encerrado no balancete, com o sinal registrado.
  title = TRIAL_LINES[1][1];
  const pl = row("2.3");
  if (pl === null) test("R11", title, "Não executado", src, null, "", "Patrimônio líquido não localizado no balancete.");
  else {
    const start = -pl.opening;
    const final = -pl.closing + openresult;
    const note = openresult ? ` Inclui o resultado do período ainda não encerrado no balancete (${brl(openresult)}).` : "";
    const neg = final < -tolerance;
    if (neg)
      finding(
        "Patrimônio líquido negativo (passivo a descoberto)",
        "Patrimônio líquido",
        -final,
        "Indício para revisão",
        where(pl),
        `PL de ${brl(final)} em ${dateBr(end)}; no início do período, ${brl(start)}.${note}`,
        "Confirmar com o responsável a situação (aportes, empréstimos de sócios a capitalizar e continuidade da empresa) e a apresentação no balanço. Não ajustar o PL sem documento.",
        "Média",
      );
    test("R11", title, neg ? "Pendente" : "Confere no escopo", src, neg ? final : null, "PL do balancete + resultado não encerrado", `PL de ${brl(final)} em ${dateBr(end)} (início do período: ${brl(start)}).${note}`);
  }
  // Provisões de 13º: o 13º vence até 20/12, então o fechamento anual (31/12) tem de mostrá-las baixadas.
  title = TRIAL_LINES[2][1];
  if (end.slice(5) !== "12-31")
    test(
      "C06-C11",
      title,
      "Não executado",
      src,
      null,
      "",
      `Fechamento termina em ${dateBr(end)}; a conferência é do fechamento anual em 31/12, depois do pagamento do 13º até 20/12 (Lei 4.749/1965, art. 1º).`,
    );
  else {
    const found: string[] = [];
    const absent: string[] = [];
    const idx = new Set<number>();
    const parts: Partes = {};
    for (const [label, pattern] of THIRTEENTH_PROVISIONS) {
      const hit = pick(tree, rows, (n) => re(pattern).search(n), (c) => under(c, "2"), null, names);
      (hit.length ? found : absent).push(label);
      hit.forEach((i) => idx.add(i));
      if (hit.length) parts[label] = (hit.some((i) => Math.abs(rows[i].closing) > tolerance) ? "Pendente" : "Confere no escopo") as EstadoDaParte;
    }
    const known = Boolean(tree) && [...idx].every((i) => verdadeiro((tree as Arvore).code(i)));
    const ordem = known ? disjoint((tree as Arvore).code, idx) : [...idx].sort((a, b) => a - b);
    const live = ordem.map((i) => rows[i]).filter((r) => Math.abs(r.closing) > tolerance);
    if (live.length)
      finding(
        "Provisão de 13º com saldo no fechamento anual",
        "Balancete",
        known ? soma(live.map((r) => Math.abs(r.closing))) : Math.max(...live.map((r) => Math.abs(r.closing))),
        "Indício para revisão",
        where(live[0]),
        `Saldo em ${dateBr(end)}: ${listed(live)}.`,
        "Conferir o pagamento do 13º e dos encargos e a baixa da provisão; o saldo pode ser provisão a reverter ou valor ainda a pagar. Não ajustar sem documento.",
        "Média",
      );
    const reason = found.length
      ? (live.length ? `${live.length} conta(s) com saldo em ${dateBr(end)}.` : `Zeradas em ${dateBr(end)}.`) +
        ` Localizados: ${found.join(", ")}.` +
        (absent.length ? ` Não localizados (conferir se aplicável): ${absent.join(", ")}.` : "")
      : "Nenhuma conta de provisão de 13º no balancete.";
    test(
      "C06-C11",
      title,
      live.length ? "Pendente" : found.length ? "Confere no escopo" : "Não executado",
      src,
      null,
      "Saldo em 31/12 das provisões de 13º e do INSS e FGTS sobre elas = 0",
      reason,
      parts,
    );
  }
  // Capital: movimento no período tem de corresponder a uma alteração registrada, que não é fornecida.
  title = TRIAL_LINES[3][1];
  const idxCapital = pick(
    tree,
    rows,
    (n) => re(CAPITAL).match(n),
    (c) => under(c, "2.3"),
    (n) => CAPITAL_ROWS.includes(n),
    names,
  );
  if (!idxCapital.length) test("C22", title, "Não executado", src, null, "", "Conta de capital social não localizada no balancete.");
  else {
    const moved = idxCapital.filter((i) => rows[i].debit > tolerance || rows[i].credit > tolerance || Math.abs(rows[i].opening - rows[i].closing) > tolerance);
    const byid = new Map((ledger ? ledger.split : []).map(([a]) => [a.id, a] as const));
    for (const i of moved) {
      const r = rows[i];
      const c = tree ? tree.code(i) : null;
      let extra = "";
      const live = (ledger ? ledger.split : []).flatMap(([a, es]) => ((c ? under(a.code, c) : a.id === r.id) ? es.filter((e) => !e[8]) : []));
      if (live.length) extra = " No razão: " + describeEntries(live, byid)[2];
      finding(
        "Movimento no capital social: " + accountLabel(r),
        "Patrimônio líquido",
        Math.max(r.debit, r.credit, Math.abs(r.closing - r.opening)),
        "Evidência insuficiente",
        where(r),
        `Saldo anterior ${dc(r.opening)}, débitos ${brl(r.debit)}, créditos ${brl(r.credit)} e saldo final ${dc(r.closing)} no período.${extra}`,
        "Obter a alteração contratual (ou ata) registrada e conferir valor, data e integralização com os lançamentos; não ajustar sem documento.",
        "Média",
      );
    }
    test(
      "C22",
      title,
      moved.length ? "Pendente" : "Confere no escopo",
      src,
      null,
      "Movimento e saldo inicial × final das contas de capital social",
      (moved.length ? `${moved.length} conta(s) de capital com movimento no período.` : `Capital social sem movimento no período (saldo ${idxCapital.map((i) => dc(rows[i].closing)).join(", ")}).`) +
        " Alteração contratual não fornecida: não conferida.",
    );
  }
  // C27: saldos a analisar; saldo oposto no mesmo fechamento pode indicar compensação (por pessoa, não conferida).
  title = TRIAL_LINES[4][1];
  const patrimonial = (c: string) => ["1", "2"].includes(c.split(".")[0]) && !under(c, "2.3");
  const found: string[] = [];
  let flagged = 0;
  for (const [label, pattern, other, otherLabel] of ADVANCES) {
    const idx = pick(tree, rows, (n) => re(pattern).match(n), patrimonial, null, names);
    if (!idx.length) continue;
    const live = idx.map((i) => rows[i]).filter((r) => Math.abs(r.closing) > tolerance);
    const own = soma(live.map((r) => r.closing));
    found.push(label[0].toLowerCase() + label.slice(1) + " " + (live.length ? dc(own) : "sem saldo"));
    if (!live.length) continue;
    flagged += 1;
    let note = "";
    if (other) {
      const ob = soma(pick(tree, rows, (n) => re(other).match(n), patrimonial, null, names).map((i) => rows[i].closing));
      if (Math.abs(ob) > tolerance && ob > 0 !== own > 0)
        note = ` No mesmo fechamento, ${otherLabel} com saldo de ${dc(ob)}: se houver adiantamento e título da mesma pessoa, avaliar a compensação.`;
    } else {
      const d = soma(live.filter((r) => r.closing > 0).map((r) => r.closing));
      const c = -soma(live.filter((r) => r.closing < 0).map((r) => r.closing));
      if (d && c) note = ` Há saldos a receber de sócios (${brl(d)}) e a pagar a sócios (${brl(c)}): avaliar a compensação por sócio.`;
    }
    finding(
      label,
      "Suporte",
      soma(live.map((r) => Math.abs(r.closing))),
      "Evidência insuficiente",
      where(live[0]),
      `Saldo em ${dateBr(end)}: ${listed(live)}.${note}`,
      "Analisar a composição por cliente, fornecedor ou sócio e avaliar se é necessário transferir valores entre essas contas para regularizar os saldos. Em empresas com BPO ou controle financeiro feito com a equipe, seguir o procedimento aplicável antes de transferir. Não transferir sem documento.",
      "Média",
    );
  }
  test(
    "C27",
    title,
    flagged ? "Pendente" : found.length ? "Confere no escopo" : "Não executado",
    src,
    null,
    "Saldos de adiantamentos de clientes, a fornecedores e de sócios em " + dateBr(end),
    (found.length ? `Saldos: ${found.join("; ")}.` : "Nenhuma conta de adiantamentos de clientes, a fornecedores ou de sócios no balancete.") +
      " Composição por cliente, fornecedor ou sócio não conferida.",
  );
}

function verdadeiro(v: string | null): boolean {
  return v !== null && v !== "";
}
