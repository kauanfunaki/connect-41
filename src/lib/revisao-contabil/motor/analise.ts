// A análise de um fechamento: identidade e período (R01), balancete (R04), razão (R15), equação e
// balanço × balancete (R02), DRE (R05), ponte do PL (R06) e os blocos 2 a 6 do original.
// Portado de `dist/engine.py` (AudTool R_12 provisório, commit 92658a2), função `analyse`. Cópia fiel:
// os testes-gabarito comparam com o original; não altere a ordem dos testes nem os textos.

import { brl, identifier, inPrefix, norm, VERSION } from "./base";
import { GROUP_NAMES, trialChecks } from "./balancete";
import { fiscalChecks, type Referencia } from "./fiscal";
import { manualMatrix } from "./manual";
import { paymentChecks } from "./pagamentos";
import { d2, re, soma, strip, verdade } from "./py";
import {
  balanceGroup,
  LEDGER_LINES,
  ledgerChecks,
  ledgerMovement,
  ledgerSplit,
  SUPPLIER_ROWS,
  type ContextoDeReceita,
  type Divisao,
  type Grupos,
} from "./razao";
import type {
  Achado,
  Analise,
  ContaBalancete,
  ContaRazao,
  Documento,
  Empresa,
  EstadoDaParte,
  EstadoDoTeste,
  Fechamento,
  RegistraAchado,
  RegistraTeste,
  Resumo,
  Teste,
} from "./tipos";

export function analyse(company: Empresa, closing: Fechamento, documents: Documento[], tolerance = 1): Analise {
  const tests: Teste[] = [];
  const findings: Achado[] = [];
  const eligible: Documento[] = [];
  let n = 0;
  const test: RegistraTeste = (id, title, status, source, diff = null, formula = "", reason = "", parts = null) => {
    // parts: estado de cada parte de uma linha que cobre mais de um item do manual (bloco 6).
    tests.push({ id, title, status, source, difference: diff ?? null, formula, reason, ...(parts !== null && parts !== undefined ? { parts } : {}) });
  };
  const finding: RegistraAchado = (title, area, value, kind, source, fact, action, severity = "Alta") => {
    n += 1;
    findings.push({
      id: "G" + d2(n),
      title,
      area,
      severity,
      value: value !== null ? value / 100 : 0,
      kind,
      rule: area,
      source,
      fact,
      meaning: "Conclusão limitada às fontes e ao período indicados. A diferença não autoriza lançamento compensatório.",
      action,
      impact: "Impacto a confirmar com suporte; nenhum ajuste foi lançado.",
      owner: "Contabilidade",
      status: "Aberto",
      before: 0,
      after: value !== null ? value / 100 : 0,
    });
  };
  const cnpjEmpresa = () => identifier(company.cnpj);
  for (const d of documents) {
    const f = d.facts;
    const src = d.name;
    const dates = f.positionDates ?? [];
    const mismatch = verdade(f.cnpjs) && !f.cnpjs.includes(cnpjEmpresa());
    const paid = (f.payments?.guides ?? []).filter((x) => x.paid).map((x) => x.paid as string);
    const inside = paid.filter((p) => closing.start <= p && p <= closing.end).length;
    // Período igual ao do fechamento; data-base do balanço igual ao fim; comprovantes com arrecadação dentro do fechamento.
    const badperiod =
      (verdade(f.periods) && !f.periods.some((p) => p.length === 2 && p[0] === closing.start && p[1] === closing.end)) ||
      (!verdade(f.periods) && verdade(dates) && !dates.includes(closing.end)) ||
      (!verdade(f.periods) && !verdade(dates) && verdade(paid) && !inside);
    if (mismatch || badperiod) {
      let wrong = (
        [
          ["CNPJ", mismatch],
          ["período/data-base", badperiod],
        ] as const
      )
        .filter(([, bad]) => bad)
        .map(([x]) => x)
        .join(" e ");
      wrong = wrong[0].toUpperCase() + wrong.slice(1);
      test("R01", src + " · identidade/período", "Bloqueado", src, null, "", wrong + " extraído não corresponde ao fechamento.");
      finding(
        "Documento em quarentena: " + src,
        "Identidade",
        null,
        "Evidência insuficiente",
        src,
        wrong + " divergente; documento excluído dos demais testes.",
        "Confirme a empresa e período corretos ou crie outro fechamento.",
      );
      continue;
    }
    const missing = (
      [
        ["CNPJ", verdade(f.cnpjs)],
        ["período/data-base", verdade(f.periods) || verdade(dates) || verdade(paid)],
      ] as const
    )
      .filter(([, ok]) => !ok)
      .map(([x]) => x)
      .join(" e ");
    eligible.push(d);
    test(
      "R01",
      src + " · identidade/período",
      missing ? "Pendente" : "Confere no escopo",
      src,
      null,
      "",
      missing
        ? "Não identificado no cabeçalho: " + missing + "; vínculo declarado pelo usuário, não comprovado."
        : verdade(f.periods)
          ? "Identidade/período extraídos compatíveis."
          : paid.length
            ? `Identidade compatível; ${inside} guia(s) com arrecadação no fechamento${paid.length > inside ? `, ${paid.length - inside} fora do período (não conferidas)` : ""}.`
            : "Identidade compatível; data-base do balanço igual ao fim do fechamento.",
    );
    if (missing)
      finding(
        "Identificação documental incompleta: " + src,
        "Identidade",
        null,
        "Evidência insuficiente",
        src,
        "Não identificado no cabeçalho: " + missing + ".",
        "Confirme o vínculo com a empresa e obtenha documento identificado.",
      );
    for (const w of f.warnings) finding(w, "Leitura", null, "Evidência insuficiente", src, w, "Conferir a extração ou fornecer outra versão legível.");
    if (verdade(f.accounts)) {
      const errors: ContaBalancete[] = [];
      for (const row of f.accounts) {
        const diff = row.opening + row.debit - row.credit - row.closing;
        if (Math.abs(diff) > tolerance) {
          errors.push(row);
          finding(
            "Movimentação não fecha: " + row.code,
            "Balancete",
            Math.abs(diff),
            "Erro aritmético",
            src + " p./aba " + String(row.page) + " linha " + String(row.line),
            row.name + ": SI + débitos - créditos difere do SF.",
            "Conferir sinais, colunas e lançamentos no razão; corrigir extração se necessário.",
          );
        }
      }
      test(
        "R04",
        String(f.accounts.length) + " linhas de balancete",
        errors.length ? "Divergência" : "Confere no escopo",
        src,
        errors.length,
        "SI assinado + D - C = SF",
        "Contagem de exceções; somente linhas extraídas, sem presumir cobertura integral.",
      );
    }
    const ledger = f.ledger ?? null;
    if (ledger && verdade(ledger.accounts)) {
      let divergent = 0;
      let incomplete = 0;
      let total = 0;
      for (const a of ledger.accounts) {
        // Leitura incompleta já vira achado de aviso; não é contada de novo como aritmética.
        if (a.issues.length || a.opening === null || a.totalDebit === null) {
          incomplete += 1;
          continue;
        }
        const diff = Math.max(
          Math.abs(a.opening + a.debit - a.credit - (a.closing as number)),
          Math.abs(a.debit - a.totalDebit),
          Math.abs(a.credit - (a.totalCredit as number)),
        );
        if (diff > tolerance) {
          divergent += 1;
          total += diff;
          finding(
            "Razão não confere: " + a.code,
            "Razão",
            diff,
            "Erro aritmético",
            src + ` p. ${a.page} linha ${a.line} conta ${a.id}`,
            a.name + ': soma dos lançamentos difere do "Total da conta" ou do saldo final.',
            "Conferir a leitura no original; não ajustar o razão para igualar o balancete.",
          );
        }
      }
      test(
        "R15",
        "Razão · integridade · " + src,
        divergent || incomplete ? "Divergência" : "Confere no escopo",
        src,
        total,
        "SI + D - C = SF; soma dos lançamentos = Total da conta",
        `${ledger.accounts.length} contas, ${ledger.entryCount ?? 0} lançamentos; ${divergent} com diferença, ${incomplete} com leitura incompleta.`,
      );
    }
  }
  // Não misturar versões do mesmo período nem somar documentos independentes.
  const trials = eligible.filter((d) => verdade(d.facts.accounts));
  const dres = eligible.filter((d) => "RECEITA BRUTA" in d.facts.statements);
  if (trials.length > 1 || dres.length > 1) {
    finding(
      "Múltiplas versões exigem seleção",
      "Versões",
      null,
      "Evidência insuficiente",
      "Documentos do fechamento",
      "Há mais de um balancete ou DRE. Testes cruzados não executados.",
      "Selecione uma versão ativa de cada tipo e reexecute.",
    );
    test("R02/R05/R06", "Cruzamentos entre demonstrações", "Não executado", "Conjunto", null, "", "Múltiplas versões sem seleção inequívoca.");
    return {
      tests,
      findings,
      summary: {},
      conclusion: "Inconclusivo",
      documentCount: documents.length,
      version: VERSION,
      manual: manualMatrix(tests, findings, closing),
    };
  }
  const trial = trials[0] ?? null;
  const dre = dres[0] ?? null;
  const rows: ContaBalancete[] = trial ? trial.facts.accounts : [];
  const bycode = new Map<string, ContaBalancete>();
  for (const r of rows) bycode.set(r.code, r);
  const summary: Resumo = {};
  // Sem a coluna de classificação, os grupos são localizados pelo nome exato (primeira ocorrência), nunca pelo código reduzido.
  const classified = rows.every((r) => r.classified ?? true);
  const nomeDe = (r: ContaBalancete) => strip(norm(r.name));
  const row = (code: string): ContaBalancete | null => {
    if (classified) return bycode.get(code) ?? null;
    return rows.find((r) => GROUP_NAMES[code].includes(nomeDe(r))) ?? null;
  };
  const acc = (code: string): number | null => row(code)?.closing ?? null;
  // Grupos de resultado ainda não encerrados no PL (balancete anterior ao encerramento).
  let results: ContaBalancete[];
  if (classified) results = rows.filter((r) => !r.code.includes(".") && r.code !== "1" && r.code !== "2");
  else {
    results = [];
    for (const label of ["RESULTADO DO PERIODO", "RESULTADO DO EXERCICIO", "CONTAS DE RESULTADO", "CONTAS DE APURACAO"]) {
      const r = rows.find((x) => nomeDe(x) === label);
      if (r) results.push(r);
    }
  }
  const openresult = -soma(results.map((r) => r.closing));
  const bp = (label: string): number | null => {
    for (const d of eligible) {
      if (verdade(d.facts.accounts) || d.facts.kind === "Balancete não reconhecido") continue;
      const v = d.facts.statements["BP:" + label];
      if (v) return v.value;
    }
    return null;
  };
  for (const [key, code, label] of [
    ["assets", "1", "ATIVO"],
    ["currentAssets", "1.1", "ATIVO CIRCULANTE"],
    ["currentLiabilities", "2.1", "PASSIVO CIRCULANTE"],
    ["longLiabilities", "2.2", "PASSIVO NAO-CIRCULANTE"],
    ["equity", "2.3", "PATRIMONIO LIQUIDO"],
  ] as const) {
    let v = acc(code);
    v = v === null ? bp(label) : v;
    if (v !== null) summary[key] = Math.abs(v);
  }
  if (summary.assets !== undefined && summary.currentLiabilities !== undefined && summary.longLiabilities !== undefined && summary.equity !== undefined) {
    // O sinal do PL é mantido, inclusive negativo.
    let eq = acc("2.3");
    eq = eq === null ? bp("PATRIMONIO LIQUIDO") : eq;
    summary.equity = -(eq as number);
    if (openresult) summary.openResult = openresult;
    const diff = summary.assets - summary.currentLiabilities - summary.longLiabilities - summary.equity - openresult;
    test(
      "R02",
      "Equação patrimonial",
      Math.abs(diff) > tolerance ? "Divergência" : "Confere no escopo",
      "Balancete/Balanço",
      diff,
      openresult ? "Ativo - PC - PNC - PL - resultado não encerrado" : "Ativo - PC - PNC - PL",
      openresult ? "Resultado do período ainda não transferido ao PL no balancete; incluído com o sinal registrado, sem ajuste." : "",
    );
    if (Math.abs(diff) > tolerance)
      finding(
        "Equação patrimonial não fecha",
        "Balanço",
        Math.abs(diff),
        "Erro aritmético",
        "Balancete/Balanço",
        "Diferença entre ativo e passivos exigíveis + PL.",
        "Conferir composição, sinais e mapeamento; não criar conta compensatória.",
      );
  } else test("R02", "Equação patrimonial", "Não executado", "Documentos", null, "", "Totais não identificados de modo suficiente.");
  // Os totais do balanço têm de ser iguais aos grupos do balancete; o resultado aberto pertence ao PL do balanço.
  if (trial) {
    for (const d of eligible.filter((x) => x.facts.kind === "Balanço")) {
      const st = d.facts.statements;
      const divergent: string[] = [];
      let compared = 0;
      let total = 0;
      for (const [code, label] of [
        ["1", "ATIVO"],
        ["1.1", "ATIVO CIRCULANTE"],
        ["1.2", "ATIVO NAO-CIRCULANTE"],
        ["2.1", "PASSIVO CIRCULANTE"],
        ["2.2", "PASSIVO NAO-CIRCULANTE"],
        ["2.3", "PATRIMONIO LIQUIDO"],
      ]) {
        const r = row(code);
        const b = st["BP:" + label];
        if (r === null || b === undefined || b === null) continue;
        const expected = r.closing - (code === "2.3" ? openresult : 0);
        compared += 1;
        const diff = b.value - expected;
        if (Math.abs(diff) > tolerance) {
          total += Math.abs(diff);
          divergent.push(label);
          finding(
            "Balanço diverge do balancete: " + label,
            "Balanço",
            Math.abs(diff),
            "Divergência entre demonstrações",
            d.name + " p. " + String(b.page) + " / " + trial.name + " conta " + r.code,
            "Total no balanço difere do saldo do grupo no balancete.",
            "Conferir versões, data-base e mapeamento das demonstrações; não ajustar um documento para igualar o outro.",
          );
        }
      }
      if (compared)
        test(
          "R02",
          "Balanço × balancete · " + d.name,
          divergent.length ? "Divergência" : "Confere no escopo",
          d.name + " / " + trial.name,
          total,
          "Total do balanço - saldo do grupo no balancete",
          `${compared} grupos comparados, ${divergent.length} divergentes` + (openresult ? "; PL do balanço inclui o resultado não encerrado do balancete." : "."),
        );
      else test("R02", "Balanço × balancete · " + d.name, "Não executado", d.name, null, "", "Grupos do balanço não localizados no balancete.");
    }
  }
  // Contas do razão são analíticas; linhas do balancete ausentes do razão podem ser grupos sintéticos e só são contadas.
  const ledgers = eligible.filter((d) => verdade(d.facts.ledger?.accounts));
  if (ledgers.length > 1) {
    finding(
      "Múltiplas versões de razão exigem seleção",
      "Versões",
      null,
      "Evidência insuficiente",
      "Documentos do fechamento",
      "Há mais de um razão. Confronto com o balancete não executado.",
      "Selecione uma versão ativa do razão e reexecute.",
    );
    test("R15", "Razão × balancete", "Não executado", "Conjunto", null, "", "Múltiplos razões sem seleção inequívoca.");
  } else if (!ledgers.length) test("R15", "Razão × balancete", "Não executado", "Documentos", null, "", "Razão não fornecido.");
  else if (!trial) test("R15", "Razão × balancete", "Não executado", ledgers[0].name, null, "", "Balancete não fornecido.");
  else if (!(ledgers[0].facts.ledger as { accounts: ContaRazao[] }).accounts.some((a) => rows.some((r) => r.id === a.id)))
    test(
      "R15",
      "Razão × balancete",
      "Não executado",
      ledgers[0].name + " / " + trial.name,
      null,
      "",
      "Nenhuma conta do razão localizada no balancete pelo código reduzido; layouts sem chave comum.",
    );
  else {
    const ld = ledgers[0];
    const lsrc = ld.name;
    const info = ld.facts.ledger!;
    const byid = new Map<string, ContaBalancete>();
    for (const r of rows) byid.set(r.id, r);
    const seen = new Set<string>();
    let compared = 0;
    let divergent = 0;
    let missing = 0;
    let skipped = 0;
    let separated = 0;
    let total = 0;
    // Balancete emitido antes do encerramento: os lançamentos de encerramento do fim do período ficam à parte, nunca compensados.
    const separate = Boolean(openresult);
    for (const a of info.accounts) {
      seen.add(a.id);
      const r = byid.get(a.id);
      if (r === undefined) {
        if (separate && (info.clearing ?? []).includes(a.id)) continue;
        missing += 1;
        finding(
          "Conta do razão ausente no balancete: " + a.code,
          "Razão",
          Math.abs(a.closing || 0),
          "Divergência entre demonstrações",
          lsrc + ` p. ${a.page} linha ${a.line}`,
          a.name + ": conta do razão não localizada no balancete pelo código reduzido " + a.id + ".",
          "Conferir versões, plano de contas e período dos dois relatórios.",
        );
        continue;
      }
      if (a.issues.length || a.opening === null) {
        skipped += 1;
        continue;
      }
      const [debit, credit, count] = ledgerMovement(a, separate, closing.end);
      separated += count;
      compared += 1;
      const diffs = (
        [
          ["saldo anterior", a.opening, r.opening],
          ["débitos", debit, r.debit],
          ["créditos", credit, r.credit],
          ["saldo final", a.opening + debit - credit, r.closing],
        ] as [string, number, number][]
      )
        .filter(([, x, y]) => Math.abs(x - y) > tolerance)
        .map(([k, x, y]) => [k, x - y] as const);
      if (diffs.length) {
        const diff = Math.max(...diffs.map(([, v]) => Math.abs(v)));
        divergent += 1;
        total += diff;
        finding(
          "Razão diverge do balancete: " + a.code,
          "Razão",
          diff,
          "Divergência entre demonstrações",
          lsrc + ` p. ${a.page} linha ${a.line} / ` + trial.name + ` p. ${r.page} linha ${r.line}`,
          a.name + ": diferença em " + diffs.map(([k]) => k).join(", ") + ".",
          "Conferir versões, período e lançamentos; não ajustar um relatório para igualar o outro.",
        );
      }
    }
    const absent = rows.filter((r) => (r.debit || r.credit) && !seen.has(r.id)).length;
    let reason = `${compared} contas comparadas, ${divergent} divergentes, ${missing} ausentes no balancete; ${absent} contas do balancete com movimento não constam do razão (podem ser sintéticas).`;
    if (separated) reason += ` Balancete anterior ao encerramento: ${separated} lançamentos de encerramento do resultado em ${closing.end} separados da comparação, sem ajuste.`;
    if (skipped) reason += ` ${skipped} contas com leitura incompleta não comparadas.`;
    test(
      "R15",
      "Razão × balancete",
      divergent || missing || skipped ? "Divergência" : "Confere no escopo",
      lsrc + " / " + trial.name,
      total,
      "Razão (SI, D, C, SF) - balancete, por código reduzido",
      reason,
    );
  }
  // Regras sobre os lançamentos: um prefixo de classificação só é grupo quando as contas dele somam o grupo do balancete.
  const srow = rows.find((r) => SUPPLIER_ROWS.includes(nomeDe(r))) ?? null;
  let ctx: ContextoDeReceita | null = null;
  let split: Divisao | null = null;
  let g: Grupos | null = null;
  let lsrc: string | null = null;
  let lwhy: string | null = null;
  let clearing = new Set<string>();
  let c29 = new Set<string>();
  if (ledgers.length !== 1) {
    lwhy = ledgers.length ? "Múltiplos razões sem seleção inequívoca." : "Razão não fornecido.";
    for (const [id, title] of LEDGER_LINES) test(id, title, "Não executado", ledgers.length ? "Conjunto" : "Documentos", null, "", lwhy);
  } else {
    const ld = ledgers[0];
    lsrc = ld.name;
    const [divisao, why] = ledgerSplit(ld.facts);
    split = divisao;
    if (split === null) {
      lwhy = why;
      for (const [id, title] of LEDGER_LINES) test(id, title, "Não executado", ld.name, null, "", why);
    } else {
      const divisaoOk: Divisao = split;
      g = null;
      clearing = new Set(ld.facts.ledger!.clearing ?? []);
      if (trial) {
        const total = (match: (a: ContaRazao) => boolean): number | null => {
          let s = 0;
          for (const [a] of divisaoOk) {
            if (!match(a)) continue;
            if (a.issues.length || a.opening === null) return null;
            // Antes do encerramento, a conta de apuração só tem os lançamentos de encerramento.
            if (openresult && clearing.has(a.id)) {
              s += a.opening;
              continue;
            }
            const [d, c] = ledgerMovement(a, Boolean(openresult), closing.end);
            s += a.opening + d - c;
          }
          return s;
        };
        const same = (p: string) => {
          const r = row(p);
          const t = total((a) => inPrefix(a, p));
          return r !== null && t !== null && Math.abs(t - r.closing) <= tolerance;
        };
        const digits = new Set(divisaoOk.map(([a]) => a.code.split(".")[0]));
        digits.delete("1");
        digits.delete("2");
        const rt = digits.size ? total((a) => digits.has(a.code.split(".")[0])) : null;
        g = {
          asset: same("1"),
          liability: same("2"),
          current: same("2.1"),
          noncurrent: same("2.2"),
          equity: same("2.3"),
          result: results.length && rt !== null && Math.abs(rt - soma(results.map((r) => r.closing))) <= tolerance ? digits : new Set(),
        };
        g.suppliers = srow ? balanceGroup(divisaoOk, srow, Boolean(openresult), closing.end, tolerance, "2") : null;
      }
      [ctx, c29] = ledgerChecks(divisaoOk, g, closing, tolerance, ld.name, clearing, test, finding);
    }
  }
  // Referências do bloco 3: balancete primeiro (como o manual pede), razão sem o encerramento, DRE por último.
  const tbWhere = (r: ContaBalancete) => (trial as Documento).name + ` p. ${r.page} linha ${r.line} conta ${r.id}`;
  const revenueRef = (pattern: string, key: "revenueTotal" | "serviceTotal", label: string | null): Referencia | null => {
    const r = rows.find((x) => re(pattern).match(nomeDe(x))) ?? null;
    if (r && openresult) return [-r.closing, tbWhere(r), `saldo de ${r.name} no balancete`, ""];
    if (ctx && ctx[key] !== null && ctx[key] !== undefined) return [ctx[key] as number, ctx.source, "créditos - débitos no razão, fora do encerramento", ""];
    const st = label ? (dre ? dre.facts.statements : {})[label] : undefined;
    if (st) return [st.value, (dre as Documento).name + ` p. ${st.page} linha ${st.line}`, "receita bruta da DRE", ""];
    if (r)
      return [
        r.credit,
        tbWhere(r),
        `créditos de ${r.name} no balancete`,
        "Resultado já encerrado no balancete: usados os créditos do período; estornos a débito não descontados.",
      ];
    return null;
  };
  const ref = {
    gross: revenueRef(String.raw`RECEITA BRUTA\b`, "revenueTotal", "RECEITA BRUTA"),
    services: revenueRef(String.raw`(?!.*\bVENDAS?\b)RECEITAS? (BRUTA )?(DE |DA |COM )?(PRESTACAO DE )?SERVICOS?\b`, "serviceTotal", null),
    suppliers: srow
      ? ([srow.credit, tbWhere(srow), `créditos em ${srow.name} no balancete`, "Compras à vista não passam por fornecedores; diferença é pendência a confirmar."] as Referencia)
      : null,
  };
  fiscalChecks(
    eligible.filter((d) => verdade(d.facts.fiscal)),
    ctx,
    ref,
    closing,
    tolerance,
    test,
    finding,
  );
  paymentChecks(
    eligible.filter((d) => verdade(d.facts.payments)),
    company,
    split,
    g,
    clearing,
    lsrc,
    lwhy,
    closing,
    tolerance,
    test,
    finding,
  );
  // Bloco 5: o razão só dá a classificação (balancete sem ela) e as contas já conferidas pela C29.
  trialChecks(
    trial ? { doc: trial, rows, classified, row, results, openresult } : null,
    g ? { split: split as Divisao, g, clearing, nature: c29 } : null,
    closing,
    tolerance,
    test,
    finding,
  );
  let profit: number | null = null;
  if (dre) {
    const fields = dre.facts.statements;
    const v = (...names: string[]): number | null => {
      for (const x of names) if (x in fields) return fields[x].value;
      return null;
    };
    const eq = (id: string, title: string, parts: (number | null)[], target: number | null) => {
      if (target === null || parts.some((x) => x === null)) {
        test(id, title, "Não executado", dre.name, null, "", "Rubricas necessárias não identificadas.");
        return;
      }
      const diff = soma(parts as number[]) - target;
      test(id, title, Math.abs(diff) > tolerance ? "Divergência" : "Confere no escopo", dre.name, diff, "Soma das rubricas com sinais - subtotal");
      if (Math.abs(diff) > tolerance)
        finding(
          title + " não confere",
          "DRE",
          Math.abs(diff),
          "Erro aritmético",
          dre.name,
          "Diferença entre rubricas identificadas e subtotal.",
          "Conferir extração, classificação e demonstração original.",
        );
    };
    const gross = v("RECEITA BRUTA");
    const net = v("RECEITA LIQUIDA");
    const cost = v("CUSTO DA PRESTACAO DE SERVICO", "CUSTOS DAS MERCADORIAS VENDIDAS");
    profit = v("PREJUIZO DO EXERCICIO", "PREJUIZO LIQUIDO DO EXERCICIO", "LUCRO DO EXERCICIO", "LUCRO LIQUIDO DO EXERCICIO");
    if (profit !== null && ("PREJUIZO DO EXERCICIO" in fields || "PREJUIZO LIQUIDO DO EXERCICIO" in fields)) profit = -Math.abs(profit);
    for (const [k, value] of [
      ["grossRevenue", gross],
      ["netRevenue", net],
      ["result", profit],
    ] as const)
      if (value !== null) summary[k] = value;
    eq("R05", "Receita líquida", [gross, v("DEDUCOES")], net);
    eq("R05", "Lucro bruto", [net, cost], v("LUCRO BRUTO"));
    eq("R05", "Resultado antes de IR/CSLL", [v("RESULTADO OPERACIONAL"), v("DESPESAS NAO OPERACIONAIS")], v("RESULTADO ANTES DO IR E CSLL"));
    eq("R05", "Resultado líquido", [v("RESULTADO ANTES DO IR E CSLL"), v("PROVISOES PARA IR E CSLL")], profit);
  } else {
    test("R05", "DRE", "Não executado", "Documentos", null, "", "DRE não identificada.");
    // Sem DRE, a receita vem de fonte exata (balancete antes do encerramento ou razão) e o resultado do balancete enquanto aberto.
    const gross = ref.gross;
    if (gross && !gross[3]) {
      summary.grossRevenue = gross[0];
      summary.grossRevenueSource = trial && gross[1].startsWith(trial.name) ? "balancete" : "razão";
    }
    if (trial && results.length && openresult) {
      profit = openresult;
      summary.result = openresult;
      summary.resultSource = "balancete";
    }
  }
  // Ponte do PL: o PL final inclui o resultado ainda aberto no balancete, com o sinal registrado.
  const pl = row("2.3");
  if (trial && profit !== null && pl) {
    const bsrc = trial.name + " / " + (dre ? dre.name : "resultado do balancete");
    const initial = -pl.opening;
    const final = -pl.closing + openresult;
    const diff = final - (initial + profit);
    const note = !openresult
      ? ""
      : !dre
        ? `Resultado do período lido do balancete, ainda não encerrado no PL (${brl(openresult)}).`
        : `PL final inclui o resultado ainda não encerrado no balancete (${brl(openresult)}).`;
    test(
      "R06",
      "Ponte do PL sem demais movimentos",
      Math.abs(diff) > tolerance ? "Pendente" : "Confere no escopo",
      bsrc,
      diff,
      "PL final - (PL inicial + resultado); demais movimentos não fornecidos",
      note,
    );
    if (Math.abs(diff) > tolerance)
      finding(
        "Explicar demais movimentos na ponte do PL",
        "Patrimônio líquido",
        Math.abs(diff),
        "Evidência insuficiente",
        bsrc,
        "A variação do PL não equivale apenas ao resultado: há diferença a explicar.",
        "Obter razão, diário, atos societários e DMPL/DLPA; identificar aportes, distribuições e ajustes.",
      );
  } else if (trial && !dre && pl) test("R06", "Ponte do PL sem demais movimentos", "Não executado", trial.name, null, "", "DRE não identificada e resultado já encerrado no balancete.");
  for (const [title, needle] of [
    ["Saldos com empresas ligadas", "EMPRESTIMOS EMPRESAS LIGADAS"],
    ["Estoque sem inventário", "ESTOQUE"],
  ]) {
    const r = rows.find((x) => nomeDe(x) === needle);
    if (r && r.closing)
      finding(
        title,
        "Suporte",
        Math.abs(r.closing),
        "Evidência insuficiente",
        (trial as Documento).name + " p. " + String(r.page) + " conta " + r.code,
        "Saldo identificado no balancete, sem documentação externa de conciliação.",
        "Obter razão, composição, contrato/inventário/títulos aplicáveis e comprovar o saldo.",
      );
  }
  const checklist: [string, string, string][] = [
    [
      "C06-C11",
      "Folha: encargos, resumo e FGTS Digital",
      "Encargos a recolher (INSS, FGTS, IRRF), resumo da folha e FGTS Digital ainda não conferidos (sem folha e guias estruturadas).",
    ],
    [
      "C16-C20",
      "Retenções e rescisão de parcelamentos",
      "Retenções sobre notas (sem XML) e situação dos parcelamentos (rescisão) não conferidas; saldo descoberto das contas de tributo é conferido pela C29.",
    ],
    ["C25", "Cadastro do imobilizado", "Sem cadastro de bens e memória de depreciação."],
    ["C03", "XML/CFOP", "Notas fiscais individuais (XML) não conferidas; o relatório de entradas é conferido só pelo total e por CFOP."],
  ];
  for (const [id, title, reason] of checklist) test(id, title, "Não executado", "Checklist", null, "", reason);
  if (!closing.regime || closing.regime === "Não informado")
    finding("Regime tributário a confirmar", "Regime", null, "Evidência insuficiente", "Cadastro", "Regime do período não informado/comprovado.", "Obter evidência do enquadramento; não presumir tributos.");
  return {
    tests,
    findings,
    summary,
    conclusion: "Inconclusivo",
    documentCount: documents.length,
    eligibleCount: eligible.length,
    version: VERSION,
    manual: manualMatrix(tests, findings, closing),
    limits: "Extração por padrões e modelo tabular; confira leitura. Testes parciais não equivalem a validação fiscal ou auditoria independente. Sem ajustes lançados.",
  };
}

export type { EstadoDaParte, EstadoDoTeste };
