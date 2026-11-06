// Comprovantes de arrecadação do e-CAC × baixas no razão (bloco 4 do original; manual do time, seção 4).
// Portado de `dist/engine.py` (AudTool R_12 provisório, commit 92658a2), função `payment_checks`.
// Cópia fiel: razão social, banco, código de controle e histórico nunca entram em testes ou achados.

import { brl, dateBr, dias, identifier, norm } from "./base";
import { escapar, re, cmpTupla, soma, strip, unicos } from "./py";
import { inGroup, mark, PRINCIPAL, type Divisao, type Grupos, type Partes } from "./razao";
import type { ContaRazao, Documento, Empresa, Guia, Lancamento, RegistraAchado, RegistraTeste } from "./tipos";

export const PAYMENT_LINES: [string, string][] = [
  ["C16-C20", "e-CAC: composição × total das guias"],
  ["C16-C20", "Guias do e-CAC × baixas no razão"],
  ["C16-C20", "Baixas de tributos federais × guias do e-CAC"],
];
export const PAYMENT_WINDOW = 5;
const FEDERAL = re(
  String.raw`\b(IRRF|IRPJ|CSLL|PIS|COFINS|INSS|CSRF|PCC|IOF|IPI|SIMPLES NACIONAL|CONTRIBUIC\w* (PREVIDENCIARI\w*|SOCIAIS)|IMPOSTO DE RENDA|RECEITA FEDERAL|PGFN|DIVIDA ATIVA)\b`,
);
const NOT_FEDERAL = re(String.raw`\b(PROVIS\w*|FGTS|ISS|ISSQN|ICMS)\b`);
const PARCEL = re(String.raw`\bPARCELAMENT\w*|\bDIVIDA ATIVA\b|\bD ATIVA\b`);
// Os mesmos padrões para a descrição do código na guia e para o nome da conta; vale o primeiro.
export const TAX_FAMILIES: [string, string][] = [
  ["CSRF", String.raw`\b(CSRF|PCC)\b|\bRETENC\w* (DE )?CONTRIBUIC`],
  ["IRRF", String.raw`\bIRRF\b|\bRENDA RETID`],
  ["Previdência", String.raw`\b(INSS|CP)\b|\bPREV`],
  ["IRPJ", String.raw`\bIRPJ\b`],
  ["CSLL", String.raw`\bCSLL\b`],
  ["PIS", String.raw`\bPIS\b`],
  ["COFINS", String.raw`\bCOFINS\b`],
  ["Simples Nacional", String.raw`\bSIMPLES\b`],
];

export function taxFamily(text: string): string | null {
  const n = norm(text);
  return TAX_FAMILIES.find(([, p]) => re(p).search(n))?.[0] ?? null;
}

type ChaveDoLote = [string, string]; // (data, lote)
type Item = [ContaRazao, Lancamento];

export function paymentChecks(
  docs: Documento[],
  company: Empresa,
  split: Divisao | null,
  g: Grupos | null,
  clearing: Set<string>,
  lsrc: string | null,
  why: string | null,
  closing: { start: string; end: string },
  tolerance: number,
  test: RegistraTeste,
  finding: RegistraAchado,
): void {
  const [, t1] = PAYMENT_LINES[0];
  const [, t2] = PAYMENT_LINES[1];
  const [, t3] = PAYMENT_LINES[2];
  if (!docs.length) {
    for (const [id, title] of PAYMENT_LINES) test(id, title, "Não executado", "Documentos", null, "", "Comprovantes de arrecadação do e-CAC não fornecidos.");
    return;
  }
  const names = unicos(docs.map((d) => d.name)).join(", ");
  const cnpj = identifier(company.cnpj);
  const where = (d: Documento, x: Guia) => d.name + ` p. ${x.page} linha ${x.line}`;
  const label = (x: Guia) => `${x.type} nº ${x.number || "s/ número"}` + (x.paid ? " de " + dateBr(x.paid) : "");
  // O mesmo comprovante pode vir em mais de um arquivo: uma guia por número de documento.
  const seen = new Map<string, [Documento, Guia]>();
  let dup = 0;
  for (const d of docs) {
    for (const x of d.facts.payments!.guides) {
      const key = x.number ? "n" + JSON.stringify(x.number) : "t" + JSON.stringify(["id" in d ? d.id : d.name, x.page, x.line]);
      if (seen.has(key)) dup += 1;
      else seen.set(key, [d, x]);
    }
  }
  // Integridade: os itens somam os totais da guia, e cada item o próprio total.
  const bad: [Documento, Guia, number][] = [];
  let checked = 0;
  for (const [d, x] of seen.values()) {
    if (x.total === null || !x.items.length) continue;
    checked += 1;
    const cols = [2, 3, 4, 5].map((k) => soma(x.items.map((i) => i[k] as number)));
    const tot = [x.principal, x.fine, x.interest, x.total] as number[];
    const diff = Math.max(...cols.map((a, i) => Math.abs(a - tot[i])), ...x.items.map((i) => Math.abs(i[2] + i[3] + i[4] - i[5])));
    if (diff > tolerance) bad.push([d, x, diff]);
  }
  if (!checked) test("C16-C20", t1, "Não executado", names, null, "", "Totais dos comprovantes não identificados; conferir leitura.");
  else {
    test(
      "C16-C20",
      t1,
      bad.length ? "Divergência" : "Confere no escopo",
      names,
      soma(bad.map(([, , v]) => v)),
      "Soma dos itens - totais da guia; principal + multa + juros - total de cada item",
      `${checked} guia(s) conferida(s), ${bad.length} com diferença.` + (dup ? ` ${dup} repetida(s) em mais de um arquivo, contada(s) uma vez.` : ""),
    );
    if (bad.length)
      finding(
        "Comprovante do e-CAC: composição difere do total",
        "Leitura",
        soma(bad.map(([, , v]) => v)),
        "Evidência insuficiente",
        where(bad[0][0], bad[0][1]),
        "Itens que não somam os totais em: " +
          bad
            .slice(0, 8)
            .map(([, x]) => label(x))
            .join(", ") +
          ".",
        "Conferir a leitura do comprovante no original.",
        "Média",
      );
  }
  if (split === null || g === null || !(g.asset && g.liability && g.result.size)) {
    for (const title of [t2, t3])
      test(
        "C16-C20",
        title,
        "Não executado",
        lsrc || "Documentos",
        null,
        "",
        why || "Grupos do razão não confirmados pelo balancete (ativo, passivo e resultado); pagamentos e tributos não são presumidos.",
      );
    return;
  }
  const lsrcTexto = lsrc as string;
  const member = (a: ContaRazao, grp: "asset" | "liability" | "result") => inGroup(g, clearing, a, grp);
  const nm = (a: ContaRazao) => strip(norm(a.name));
  const cash = (a: ContaRazao, e: Lancamento) => e[6] === "C" && member(a, "asset") && !nm(a).startsWith("(-)");
  const usable = split.filter(([a]) => !a.issues.length && a.opening !== null);
  // Lotes do razão indexados uma vez: (data, lote) → lançamentos, e valor pago → lotes.
  const chave = (k: ChaveDoLote) => k[0] + "\u0000" + k[1];
  const lots = new Map<string, { k: ChaveDoLote; itens: Item[] }>();
  for (const [a, es] of usable) {
    for (const e of es) {
      if (e[6] && !e[8]) {
        const k: ChaveDoLote = [e[2], e[3]];
        let l = lots.get(chave(k));
        if (!l) lots.set(chave(k), (l = { k, itens: [] }));
        l.itens.push([a, e]);
      }
    }
  }
  const paid = new Map<string, number>();
  for (const [c, l] of lots) paid.set(c, soma(l.itens.filter(([a, e]) => cash(a, e)).map(([, e]) => e[5])));
  const whole = new Map<number, ChaveDoLote[]>();
  const single = new Map<number, ChaveDoLote[]>();
  for (const [c, l] of lots) {
    const p = paid.get(c) as number;
    if (p) {
      if (!whole.has(p)) whole.set(p, []);
      whole.get(p)!.push(l.k);
    }
    for (const [a, e] of l.itens) {
      if (cash(a, e)) {
        if (!single.has(e[5])) single.set(e[5], []);
        single.get(e[5])!.push(l.k);
      }
    }
  }
  const used = new Set<string>();
  const near = (amount: number, day: string): [ChaveDoLote, boolean] | null => {
    const d0 = dias(day);
    let best: [[boolean, number, ChaveDoLote], ChaveDoLote, boolean] | null = null;
    for (const [exact, index] of [
      [true, whole],
      [false, single],
    ] as const) {
      for (const k of index.get(amount) ?? []) {
        const gap = Math.abs(dias(k[0]) - d0);
        const ordem: [boolean, number, ChaveDoLote] = [!exact, gap, k];
        if (!used.has(chave(k)) && gap <= PAYMENT_WINDOW && (best === null || cmpTupla(ordem, best[0]) < 0)) best = [ordem, k, exact];
      }
    }
    return best && [best[1], best[2]];
  };
  const guides: [Documento, Guia][] = [];
  let other = 0;
  let outside = 0;
  let unread = 0;
  for (const [d, x] of seen.values()) {
    if (x.cnpj && x.cnpj !== cnpj) other += 1;
    else if (!x.paid || !(closing.start <= x.paid && x.paid <= closing.end)) outside += 1;
    else if (x.total === null) unread += 1;
    else guides.push([d, x]);
  }
  guides.sort(([, a], [, b]) => cmpTupla([a.paid, a.number || ""], [b.paid, b.number || ""]));
  type Casada = [[Documento, Guia][], ChaveDoLote, boolean];
  const matched: Casada[] = [];
  const pending: [Documento, Guia][] = [];
  for (const [d, x] of guides) {
    const hit = near(x.total as number, x.paid as string);
    if (hit) {
      used.add(chave(hit[0]));
      matched.push([[[d, x]], hit[0], hit[1]]);
    } else pending.push([d, x]);
  }
  // Guias pagas juntas: um lote para a soma das guias do mesmo dia.
  const unbooked: [Documento, Guia][] = [];
  const byday = new Map<string, [Documento, Guia][]>();
  for (const [d, x] of pending) {
    if (!byday.has(x.paid as string)) byday.set(x.paid as string, []);
    byday.get(x.paid as string)!.push([d, x]);
  }
  for (const [day, grp] of byday) {
    const hit = grp.length > 1 ? near(soma(grp.map(([, x]) => x.total as number)), day) : null;
    if (hit) {
      used.add(chave(hit[0]));
      matched.push([grp, hit[0], hit[1]]);
    } else unbooked.push(...grp);
  }
  const composition = (xs: Guia[], k: ChaveDoLote): string | null => {
    const items = lots.get(chave(k))!.itens;
    const liab = items.filter(([a, e]) => e[6] === "D" && member(a, "liability"));
    const expense = soma(items.filter(([a, e]) => e[6] === "D" && member(a, "result")).map(([, e]) => e[5]));
    // Parcelamentos: a parcela consolidada vai para a conta do parcelamento (a que traz o número da referência, se houver).
    if (xs.some((x) => x.reference || x.items.some((i) => PARCEL.search(norm(i[1]))))) {
      const refs = xs.filter((x) => x.reference).map((x) => x.reference as string);
      const named = new Set(
        usable.filter(([a]) => member(a, "liability") && refs.some((r) => re(String.raw`\b` + escapar(r) + String.raw`\b`).search(a.name))).map(([a]) => a.id),
      );
      if (!liab.some(([a]) => PRINCIPAL.search(nm(a)))) return "parcelamento sem débito em conta de parcelamento";
      if (named.size && !liab.some(([a]) => named.has(a.id))) return `parcelamento nº ${refs.join(", ")} baixado em conta sem esse número`;
      return null;
    }
    const exp = new Map<string | null, number>();
    const got = new Map<string | null, number>();
    for (const x of xs) {
      for (const i of x.items) {
        const f = taxFamily(i[1]);
        exp.set(f, (exp.get(f) ?? 0) + i[2]);
      }
    }
    for (const [a, e] of liab) {
      const f = taxFamily(a.name);
      got.set(f, (got.get(f) ?? 0) + e[5]);
    }
    const diffs: string[] = [];
    if (exp.has(null) || got.has(null)) {
      const p = soma(exp.values());
      const q = soma(got.values());
      if (Math.abs(p - q) > tolerance) diffs.push(`principal na guia ${brl(p)}, baixado no passivo ${brl(q)}`);
    } else {
      const familias = [...new Set([...exp.keys(), ...got.keys()])] as string[];
      familias.sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
      for (const f of familias)
        if (Math.abs((exp.get(f) ?? 0) - (got.get(f) ?? 0)) > tolerance) diffs.push(`${f} na guia ${brl(exp.get(f) ?? 0)}, baixado ${brl(got.get(f) ?? 0)}`);
    }
    const extra = soma(xs.map((x) => (x.fine as number) + (x.interest as number)));
    if (Math.abs(extra - expense) > tolerance) diffs.push(`multa e juros na guia ${brl(extra)}, em despesa ${brl(expense)}`);
    return diffs.join("; ") || null;
  };
  let mixed = 0;
  const differ: [[Documento, Guia][], ChaveDoLote, string][] = [];
  for (const [grp, k, exact] of matched) {
    if (!exact) {
      mixed += 1;
      continue;
    }
    const text = composition(
      grp.map(([, x]) => x),
      k,
    );
    if (text) differ.push([grp, k, text]);
  }
  const lotWhere = (k: ChaveDoLote) => {
    const e = lots.get(chave(k))!.itens[0][1];
    return lsrcTexto + ` p. ${e[0]} linha ${e[1]}`;
  };
  const scope = guides.map(([, x]) => x);
  const late = scope.filter((x) => x.due && (x.paid as string) > x.due).length;
  const shifted = matched.filter(([grp, k]) => k[0] !== grp[0][1].paid).length;
  let reason = `${scope.length} guia(s) com arrecadação no fechamento: ${soma(matched.map(([grp]) => grp.length))} baixada(s) no razão, ${unbooked.length} sem baixa, ${soma(differ.map(([grp]) => grp.length))} com composição diferente; ${late} paga(s) após o vencimento; ${shifted} baixada(s) em outra data (até ${PAYMENT_WINDOW} dias, critério interno).`;
  if (mixed) reason += ` ${mixed} lote(s) com outros pagamentos: composição não conferida.`;
  for (const [n, text] of [
    [other, "de outro CNPJ"],
    [outside, "com arrecadação fora do fechamento ou sem data"],
    [unread, "sem total lido"],
  ] as const)
    if (n) reason += ` ${n} guia(s) ${text} não conferida(s).`;
  test(
    "C16-C20",
    t2,
    unbooked.length || differ.length ? "Pendente" : matched.length ? "Confere no escopo" : "Não executado",
    names + " / " + lsrcTexto,
    null,
    "Créditos no ativo do lote = total da guia, na data da arrecadação; principal por tributo, multa e juros em despesa",
    scope.length ? reason : "Nenhuma guia com arrecadação no fechamento e total lido.",
  );
  if (unbooked.length) {
    const items = unbooked.map(([, x]) => `${label(x)} (${brl(x.total as number)})`);
    finding(
      "Guias pagas sem baixa no razão",
      "Tributos",
      soma(unbooked.map(([, x]) => x.total as number)),
      "Divergência entre demonstrações",
      where(...unbooked[0]) + " / " + lsrcTexto,
      `${items.length} guia(s) paga(s) sem lançamento no razão com o mesmo valor até ${PAYMENT_WINDOW} dias da arrecadação: ${items.slice(0, 8).join("; ")}${items.length > 8 ? `; e mais ${items.length - 8}` : ""}.`,
      "Conferir o pagamento no extrato e a baixa do tributo no razão; o comprovante do e-CAC é o documento de suporte. Não ajustar sem conferir.",
      "Alta",
    );
  }
  if (differ.length) {
    const items = differ.map(([grp, , text]) => `${grp.map(([, x]) => label(x)).join(", ")}: ${text}`);
    finding(
      "Baixa com composição diferente da guia",
      "Tributos",
      soma(differ.flatMap(([grp]) => grp.map(([, x]) => x.total as number))),
      "Indício para revisão",
      where(...differ[0][0][0]) + " / " + lotWhere(differ[0][1]),
      items.slice(0, 6).join("; ") + (items.length > 6 ? `; e mais ${items.length - 6}` : "") + ".",
      "Conferir em quais contas o pagamento foi baixado (principal na conta do tributo, multa e juros em despesa); não reclassificar sem documento.",
      "Média",
    );
  }
  // Inverso: pagamentos de tributos federais no razão sem comprovante entre os arquivos fornecidos.
  const federal = (a: ContaRazao) => member(a, "liability") && !nm(a).startsWith("(-)") && Boolean(FEDERAL.search(nm(a))) && !NOT_FEDERAL.search(nm(a));
  if (!scope.length) {
    test("C16-C20", t3, "Não executado", names, null, "", "Nenhuma guia com arrecadação no fechamento para confrontar com o razão.");
    return;
  }
  if (!usable.some(([a]) => federal(a))) {
    test("C16-C20", t3, "Não executado", lsrcTexto, null, "", "Nenhuma conta de tributo federal no passivo do razão.");
    return;
  }
  const orphans: [ChaveDoLote, ContaRazao[]][] = [];
  let total = 0;
  const parts: Partes = {};
  const ordenadosLotes = [...lots.values()].sort((a, b) => cmpTupla(a.k, b.k));
  for (const { k, itens } of ordenadosLotes) {
    if (!paid.get(chave(k)) || !(closing.start <= k[0] && k[0] <= closing.end)) continue;
    const taxes = itens.filter(([a, e]) => e[6] === "D" && federal(a)).map(([a]) => a);
    if (!taxes.length) continue;
    total += 1;
    // Partes para o manual: baixas de parcelamentos (item 4.4) separadas dos demais tributos federais.
    for (const p of new Set(taxes.map((a) => (PARCEL.search(nm(a)) ? "Baixas de parcelamentos" : "Baixas de tributos"))))
      mark(parts, p, used.has(chave(k)) ? "Confere no escopo" : "Pendente");
    if (!used.has(chave(k))) orphans.push([k, taxes]);
  }
  const span = scope.map((x) => x.paid as string).sort();
  const reason3 = `${total} baixa(s) de tributos federais no razão (crédito no ativo e débito no tributo), ${orphans.length} sem guia nos comprovantes fornecidos${span.length ? `; guias com arrecadação de ${dateBr(span[0])} a ${dateBr(span[span.length - 1])}` : ""}. Comprovantes não fornecidos (por exemplo, DAS do Simples) podem explicar a falta; ISS, ICMS e FGTS não fazem parte do e-CAC.`;
  test("C16-C20", t3, orphans.length ? "Pendente" : "Confere no escopo", lsrcTexto + " / " + names, null, "Lotes com pagamento de tributo federal × guias do e-CAC", reason3, parts);
  if (orphans.length) {
    const items = orphans.map(([k, taxes]) => `${dateBr(k[0])} ${unicos(taxes.map((a) => a.code + " " + a.name)).join(", ")} (${brl(paid.get(chave(k)) as number)})`);
    finding(
      "Baixas de tributos sem comprovante no e-CAC",
      "Tributos",
      soma(orphans.map(([k]) => paid.get(chave(k)) as number)),
      "Evidência insuficiente",
      lotWhere(orphans[0][0]),
      `${items.length} baixa(s) no razão sem guia correspondente nos comprovantes fornecidos: ${items.slice(0, 8).join("; ")}${items.length > 8 ? `; e mais ${items.length - 8}` : ""}.`,
      "Obter no e-CAC os comprovantes de arrecadação (DARF ou DAS) desses pagamentos e confirmar valor e data; não ajustar sem documento.",
      "Média",
    );
  }
}
