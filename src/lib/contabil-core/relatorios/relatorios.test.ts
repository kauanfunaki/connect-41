// Testes-gabarito dos relatórios (Bloco D, Fase D2, 26/11/2026): a DRE, o Balancete e o Livro Caixa
// (`RelatoriosService`, `src/domain/relatorios/service.py`).
//
// `gabarito/relatorios-*.json` foi gerado por `scripts/contabil-core/gabarito_relatorios.py`: as chamadas da suíte
// do original e os casos inventados (os mundos em `relatorios-mundos.json`). Cada caso traz o que o serviço pode
// ler do banco, o período e a resposta exata. Aqui o banco é simulado pela entrada: o teste faz as leituras e as
// somas que o servidor (`servidor/relatorios.ts`) faz no MySQL, e a resposta sai das funções puras. As
// divergências deliberadas são contadas uma a uma.

import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { afterAll, describe, expect, test } from "vitest";
import { dec, soma, type Dec } from "../motor/decimal";
import {
  comparaPy,
  instantesDoPeriodo,
  montarBalancete,
  montarDre,
  montarLivroCaixa,
  nivelDoCodigo,
  type ContaDoRelatorio,
  type TotalDaAgencia,
  type TotalDaConta,
} from "./relatorios";

/* eslint-disable @typescript-eslint/no-explicit-any */
type Caso = { id: number; tipo: string; origem: "suite" | "inventado"; entrada: any; saida: any };

const PASTA = path.join(__dirname, "gabarito");
const casos: Caso[] = readdirSync(PASTA)
  .filter((n) => /^relatorios-\d+\.json$/.test(n))
  .flatMap((n) => JSON.parse(readFileSync(path.join(PASTA, n), "utf8")) as Caso[]);
const mundos: Record<string, any> = JSON.parse(readFileSync(path.join(PASTA, "relatorios-mundos.json"), "utf8"));
const entrada = (c: Caso) => (c.entrada.mundo ? { ...mundos[c.entrada.mundo], ...c.entrada } : c.entrada);
const doTipo = (tipo: string) => casos.filter((c) => c.tipo === tipo);

const divergencias = { ordemDosCodigosEmpatados: 0, ordemDasContasBancarias: 0 };
const esta = (x: any) => x.empresa !== "outra";
const naOrdem = (l: any[]) => [...l].sort((a, b) => (a.ordem_insercao ?? 0) - (b.ordem_insercao ?? 0));

/** O período do caso: as datas (casos inventados, como a tela manda) ou os instantes gravados (a suíte). */
function periodoDasPartidas(e: any): { de: string | null; ate: string | null; inicio: number | null; fim: number | null } {
  if ("de" in e) {
    const { inicio, fim } = instantesDoPeriodo({ de: e.de, ate: e.ate });
    // Os instantes que a tela do original mandava, e que o gabarito usou, são os do Connect.
    expect(inicio?.getTime() ?? null).toBe(e.data_de ? Date.parse(e.data_de) : null);
    expect(fim?.getTime() ?? null).toBe(e.data_ate ? Date.parse(e.data_ate) : null);
    return { de: e.de, ate: e.ate, inicio: inicio?.getTime() ?? null, fim: fim?.getTime() ?? null };
  }
  const inicio = e.data_de ? Date.parse(e.data_de) : null;
  const fim = e.data_ate ? Date.parse(e.data_ate) : null;
  const dia = (ms: number | null) => (ms === null ? null : new Date(ms).toISOString().slice(0, 10));
  return { de: dia(inicio), ate: dia(fim), inicio, fim };
}

/** As leituras de DRE e Balancete: as contas do plano da empresa e as somas das partidas vivas do período. */
function leituraDasPartidas(e: any) {
  const p = periodoDasPartidas(e);
  const contas: ContaDoRelatorio[] = naOrdem(e.contas)
    .filter(esta)
    .map((c: any) => ({ id: c.id, codigo: c.codigo, descricao: c.descricao, tipo: c.tipo, apagada: c.apagada }));
  const somas = new Map<string, TotalDaConta>();
  for (const r of naOrdem(e.registros)) {
    const t = Date.parse(r.data_lancamento);
    if (!esta(r) || r.apagado || (p.inicio !== null && t < p.inicio) || (p.fim !== null && t > p.fim)) continue;
    const k = `${r.conta_id}|${r.dc}`;
    const s = somas.get(k) ?? { contaId: r.conta_id, dc: r.dc, total: dec("0.00") };
    s.total = soma(s.total, dec(r.valor));
    somas.set(k, s);
  }
  return { periodo: { de: p.de, ate: p.ate }, contas, totais: [...somas.values()] };
}

/** Compara as linhas; se só a ordem dos códigos empatados mudou, conta a divergência. */
function conferirLinhas(nossas: any[], deles: any[]) {
  if (JSON.stringify(nossas) === JSON.stringify(deles)) return;
  const chave = (l: any) => `${l.codigo}\u0000${l.conta_id}`;
  const ordena = (l: any[]) => [...l].sort((a, b) => comparaPy(chave(a), chave(b)));
  // O original ordena só pelo código; no empate, a ordem é a do plano do banco. Aqui o id desempata.
  expect(nossas.map((l) => l.codigo)).toEqual(deles.map((l) => l.codigo));
  expect(ordena(nossas)).toEqual(ordena(deles));
  divergencias.ordemDosCodigosEmpatados++;
}

describe("auxiliares", () => {
  test("instantes do período: o dia inteiro em UTC", () => {
    expect(instantesDoPeriodo({ de: "2026-03-01", ate: "2026-03-31" })).toEqual({
      inicio: new Date("2026-03-01T00:00:00.000Z"),
      fim: new Date("2026-03-31T23:59:59.999Z"),
    });
    expect(instantesDoPeriodo({ de: null, ate: null })).toEqual({ inicio: null, fim: null });
  });
  test("nível pelo código e comparação de texto do Python", () => {
    expect([nivelDoCodigo("1"), nivelDoCodigo("1.1.2"), nivelDoCodigo("1.1.B.0123")]).toEqual([1, 3, 4]);
    expect(comparaPy("3.1.10", "3.1.9")).toBeLessThan(0);
    // Ponto de código: U+FF61 vem antes de U+1F600, e o `<` do JavaScript (unidades UTF-16) diria o contrário.
    expect(comparaPy("｡", "\u{1F600}")).toBeLessThan(0);
    expect("｡" < "\u{1F600}").toBe(false);
  });
});

describe("DRE (gabarito)", () => {
  test.each(doTipo("dre").map((c) => [c.id, c.origem, c] as const))("#%s (%s)", (_id, _o, caso) => {
    const e = entrada(caso);
    const s = caso.saida;
    const { periodo, contas, totais } = leituraDasPartidas(e);
    const r = montarDre(totais, contas, periodo);
    expect([r.totalReceitas, r.totalCustos, r.totalDespesas, r.resultadoLiquido]).toEqual([s.total_receitas, s.total_custos, s.total_despesas, s.resultado_liquido]);
    expect(r.grupos.map((g) => [g.tipo, g.label, g.total])).toEqual(s.grupos.map((g: any) => [g.tipo, g.label, g.total]));
    r.grupos.forEach((g, k) =>
      conferirLinhas(
        g.linhas.map((l) => ({ conta_id: l.contaId, codigo: l.codigo, descricao: l.descricao, tipo: l.tipo, debitos: l.debitos, creditos: l.creditos, saldo: l.saldo })),
        s.grupos[k].linhas,
      ),
    );
  });
});

describe("Balancete (gabarito)", () => {
  test.each(doTipo("balancete").map((c) => [c.id, c.origem, c] as const))("#%s (%s)", (_id, _o, caso) => {
    const e = entrada(caso);
    const s = caso.saida;
    const { periodo, contas, totais } = leituraDasPartidas(e);
    const r = montarBalancete(totais, contas, periodo);
    expect([r.totalDebitos, r.totalCreditos, r.totalSaldoDevedor, r.totalSaldoCredor]).toEqual([s.total_debitos, s.total_creditos, s.total_saldo_devedor, s.total_saldo_credor]);
    conferirLinhas(
      r.linhas.map((l) => ({
        conta_id: l.contaId, codigo: l.codigo, descricao: l.descricao, tipo: l.tipo, nivel: l.nivel,
        debitos: l.debitos, creditos: l.creditos, saldo_devedor: l.saldoDevedor, saldo_credor: l.saldoCredor,
      })),
      s.linhas,
    );
  });
});

describe("Livro Caixa (gabarito)", () => {
  test.each(doTipo("livro_caixa").map((c) => [c.id, c.origem, c] as const))("#%s (%s)", (_id, _o, caso) => {
    const e = entrada(caso);
    const s = caso.saida;
    const de: string | null = e.data_de;
    const ate: string | null = e.data_ate;
    // As leituras do servidor: as contas bancárias vivas da empresa e as transações vivas delas.
    const agencias = naOrdem(e.agencias)
      .filter((a: any) => esta(a) && !a.apagada)
      .map((a: any) => ({ id: a.id, bancoSigla: a.banco_sigla, agencia: a.agencia, numero: a.numero, digito: a.digito }));
    const ids = new Set(agencias.map((a) => a.id));
    const vivas = naOrdem(e.transacoes).filter((t: any) => esta(t) && !t.apagada && ids.has(t.agencia_id));
    let anteriores: TotalDaAgencia[] | null = null;
    if (de) {
      const somas = new Map<string, TotalDaAgencia>();
      for (const t of vivas.filter((t: any) => t.data < de)) {
        const k = `${t.agencia_id}|${t.dc}`;
        const g = somas.get(k) ?? { agenciaId: t.agencia_id, dc: t.dc, total: dec("0.00") as Dec };
        g.total = soma(g.total, dec(t.valor));
        somas.set(k, g);
      }
      anteriores = [...somas.values()];
    }
    const transacoes = vivas
      .filter((t: any) => (!de || t.data >= de) && (!ate || t.data <= ate))
      .map((t: any) => ({ id: t.id, agenciaId: t.agencia_id, data: t.data, historico: t.historico, dc: t.dc, valor: dec(t.valor) }));
    const r = montarLivroCaixa(agencias, anteriores, transacoes, { de, ate });
    expect([r.dataDe, r.dataAte]).toEqual([s.data_de, s.data_ate]);
    const nossas = r.agencias.map((a) => ({
      agencia_id: a.agenciaId, descricao: a.descricao, saldo_inicial: a.saldoInicial,
      lancamentos: a.lancamentos.map((l) => ({ data: l.data, historico: l.historico, dc: l.dc, valor: l.valor, saldo_acumulado: l.saldoAcumulado })),
      saldo_final: a.saldoFinal, total_debitos: a.totalDebitos, total_creditos: a.totalCreditos,
    }));
    if (JSON.stringify(nossas) !== JSON.stringify(s.agencias)) {
      // O original não ordena as contas bancárias; aqui, banco, agência, número e id. O conteúdo é o mesmo.
      const porId = (l: any[]) => [...l].sort((a, b) => comparaPy(a.agencia_id, b.agencia_id));
      expect(porId(nossas)).toEqual(porId(s.agencias));
      divergencias.ordemDasContasBancarias++;
    }
  });
});

afterAll(() => {
  // Cada divergência deliberada, contada (docs/CONTABIL-CORE.md, "Fase D2").
  console.info("divergências deliberadas dos relatórios:", JSON.stringify(divergencias), "casos:", casos.length);
  expect(divergencias).toEqual({ ordemDosCodigosEmpatados: 0, ordemDasContasBancarias: 0 });
});
