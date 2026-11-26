// Testes-gabarito do painel (Bloco D, Fase D1, 26/11/2026): as divergências da sombra do NEO
// (`consultar_divergencias`), as estatísticas da empresa (`StatsService.obter`) e a carteira (`listar_carteira`).
//
// `gabarito/painel-*.json` foi gerado por `scripts/contabil-core/gabarito_painel.py`: as chamadas da suíte do
// original e os casos inventados (os mundos em `painel-mundos.json`). Cada caso traz o que a consulta leu do
// banco, os argumentos e a resposta exata. Aqui o banco é simulado pela entrada: o teste faz as leituras e as
// contagens que o servidor (`servidor/painel.ts`) faz no MySQL, e a resposta sai das funções puras. As
// divergências deliberadas são contadas uma a uma.

import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { afterAll, describe, expect, test } from "vitest";
import { dec, igual, soma } from "../motor/decimal";
import {
  arredondaPy,
  mesesDaSerie,
  montarCarteira,
  montarEstatisticas,
  resumirDivergencias,
  type ContagensDaEmpresa,
  type DecisaoMedida,
  type GrupoDaCarteira,
} from "./painel";

/* eslint-disable @typescript-eslint/no-explicit-any */
type Caso = { id: number; tipo: string; origem: "suite" | "inventado"; entrada: any; saida: any };

const PASTA = path.join(__dirname, "gabarito");
const casos: Caso[] = readdirSync(PASTA)
  .filter((n) => /^painel-\d+\.json$/.test(n))
  .flatMap((n) => JSON.parse(readFileSync(path.join(PASTA, n), "utf8")) as Caso[]);
const mundos: Record<string, any> = JSON.parse(readFileSync(path.join(PASTA, "painel-mundos.json"), "utf8"));
const entrada = (c: Caso) => (c.entrada.mundo ? { ...mundos[c.entrada.mundo], ...c.entrada } : c.entrada);
const doTipo = (tipo: string) => casos.filter((c) => c.tipo === tipo);

const divergencias = { ordemDosParesEmpatados: 0, ordemDaCarteiraEmpatada: 0 };
const esta = (x: any) => x.empresa !== "outra";
const mesUtc = (iso: string) => new Date(iso).toISOString().slice(0, 7);

describe("round do Python", () => {
  test.each([
    [0.125, 2, 0.12], [0.375, 2, 0.38], [2 / 3 * 100, 2, 66.67], [1 / 3 * 100, 1, 33.3], [0.05, 1, 0.1], [0.25, 1, 0.2], [0.35, 1, 0.3],
    [12.5, 0, 12], [13.5, 0, 14], [100, 2, 100], [0, 1, 0], [57.14285714285714, 2, 57.14], [2.675, 2, 2.67],
  ])("round(%s, %s) = %s", (x, n, r) => expect(arredondaPy(x, n)).toBe(r));
});

describe("divergências (gabarito)", () => {
  test.each(doTipo("divergencias").map((c) => [c.id, c.origem, c] as const))("#%s (%s)", (_id, _o, caso) => {
    const e = entrada(caso);
    const s = caso.saida;
    const transacoes = new Map(e.transacoes.map((t: any) => [t.id, t]));
    const contas = new Map(e.contas.map((c: any) => [c.id, { id: c.id, codigo: c.codigo, descricao: c.descricao }]));
    const [de, ate] = e.mes ? [`${e.mes}-01`, `${e.mes}-31`] : [null, null];
    // A leitura: as decisões MEDIDAS da empresa, com a transação (de qualquer situação), no mês e na conta pedidos.
    const decisoes: DecisaoMedida[] = e.decisoes
      .filter((d: any) => esta(d) && d.conta_divergente !== null)
      .map((d: any) => ({ d, t: transacoes.get(d.transacao_id) as any }))
      .filter(({ t }: any) => t && (!e.agencia_id || t.agencia_id === e.agencia_id) && (!de || (t.data >= de && t.data <= ate!)))
      .map(({ d, t }: any) => ({
        id: d.id, contaDivergente: d.conta_divergente, contraparteId: d.contraparte_id, origemEvidencia: d.origem_evidencia,
        contaRegra: (d.conta_id && contas.get(d.conta_id)) || null, contaContraparte: (d.conta_contraparte_id && contas.get(d.conta_contraparte_id)) || null,
        transacao: { id: t.id, historico: t.historico, valor: dec(t.valor) },
      }));
    const r = resumirDivergencias(decisoes);
    expect(r.totalAvaliadas).toBe(s.total_avaliadas);
    expect(r.totalDivergentes).toBe(s.total_divergentes);
    expect(r.percentualDivergentes).toBe(s.percentual_divergentes);
    expect(igual(dec(r.valorTotalDivergente), dec(s.valor_total_divergente))).toBe(true);
    const pares = r.porConta.map((p) => [p.contaRegraId, p.contaRegraCodigo, p.contaRegraDescricao, p.contaContraparteId, p.contaContraparteCodigo, p.contaContraparteDescricao, p.quantidade, p.valorTotal]);
    const esperados = s.por_conta.map((p: any) => [p.conta_regra_id, p.conta_regra_codigo, p.conta_regra_descricao, p.conta_contraparte_id, p.conta_contraparte_codigo, p.conta_contraparte_descricao, p.quantidade, p.valor_total]);
    const normaliza = (l: any[][]) => l.map((p) => [...p.slice(0, 7), dec(String(p[7])).coeficiente.toString() + "e" + dec(String(p[7])).expoente]);
    const somaNormal = (l: any[][]) => l.map((p) => Number(p[7]));
    if (JSON.stringify(normaliza(pares)) !== JSON.stringify(normaliza(esperados))) {
      // Pares com a mesma soma: o original não desempata (a ordem é a do plano do banco); aqui, códigos e ids.
      expect(somaNormal(pares)).toEqual(somaNormal(esperados));
      expect([...normaliza(pares)].map((p) => JSON.stringify(p)).sort()).toEqual([...normaliza(esperados)].map((p) => JSON.stringify(p)).sort());
      divergencias.ordemDosParesEmpatados++;
    }
    expect(
      r.amostra.map((a) => [a.decisaoId, a.transacaoId, a.historico, Number(a.valor), a.origemEvidencia, a.contraparteId, a.contaRegraId, a.contaRegraCodigo, a.contaRegraDescricao, a.contaContraparteId, a.contaContraparteCodigo, a.contaContraparteDescricao]),
    ).toEqual(
      s.amostra.map((a: any) => [a.decisao_id, a.transacao_id, a.historico, Number(a.valor), a.origem_evidencia, a.contraparte_id, a.conta_regra_id, a.conta_regra_codigo, a.conta_regra_descricao, a.conta_contraparte_id, a.conta_contraparte_codigo, a.conta_contraparte_descricao]),
    );
    for (const a of r.amostra) expect(a.valor).toMatch(/^\d+\.\d{2}$/);
  });
});

describe("estatísticas (gabarito)", () => {
  test.each(doTipo("stats").map((c) => [c.id, c.origem, c] as const))("#%s (%s)", (_id, _o, caso) => {
    const e = entrada(caso);
    const s = caso.saida;
    // O mês corrente do original é o do "agora" em UTC; o servidor do Connect usa o do escritório (ver as divergências).
    const mesAtual = mesUtc(e.agora);
    const primeiro = mesesDaSerie(mesAtual, e.meses)[0];
    const inicio = `${primeiro}-01`;
    const inicioMs = Date.parse(`${inicio}T00:00:00Z`);
    // As contagens que o servidor faz no banco, como as consultas do `StatsService`.
    const transacoes = e.transacoes.filter((t: any) => esta(t) && !t.apagada);
    const registros = e.registros.filter((r: any) => esta(r) && !r.apagado);
    const comLancamento = new Set(registros.filter((r: any) => r.transacao_id).map((r: any) => r.transacao_id));
    const porMes = (itens: string[]) => {
      const m = new Map<string, number>();
      for (const k of itens) m.set(k, (m.get(k) ?? 0) + 1);
      return m;
    };
    const notas = e.notas.filter((n: any) => esta(n) && !n.apagada);
    const comprovantes = e.comprovantes.filter((c: any) => esta(c) && !c.apagado);
    const c: ContagensDaEmpresa = {
      transacoes: transacoes.length,
      conciliadas: transacoes.filter((t: any) => comLancamento.has(t.id)).length,
      registros: registros.length,
      notas: notas.length,
      comprovantes: comprovantes.length,
      porMes: {
        transacoes: porMes(transacoes.filter((t: any) => t.data >= inicio).map((t: any) => t.data.slice(0, 7))),
        registros: porMes(registros.filter((r: any) => Date.parse(r.data_lancamento) >= inicioMs).map((r: any) => mesUtc(r.data_lancamento))),
        comprovantes: porMes(comprovantes.filter((x: any) => x.data_pagamento && Date.parse(x.data_pagamento) >= inicioMs).map((x: any) => mesUtc(x.data_pagamento))),
        notas: porMes(notas.filter((n: any) => Date.parse(n.data_emissao) >= inicioMs).map((n: any) => mesUtc(n.data_emissao))),
      },
      agencias: e.agencias
        .filter((a: any) => esta(a) && a.ativa)
        .sort((a: any, b: any) => (a.ordem_insercao ?? 0) - (b.ordem_insercao ?? 0))
        .map((a: any) => {
          const daConta = transacoes.filter((t: any) => t.agencia_id === a.id);
          return { id: a.id, bancoSigla: a.banco_sigla, agencia: a.agencia, numero: a.numero, total: daConta.length, conciliadas: daConta.filter((t: any) => comLancamento.has(t.id)).length };
        }),
    };
    const r = montarEstatisticas(c, e.meses, mesAtual);
    expect({
      resumo: {
        total_transacoes: r.resumo.totalTransacoes, total_conciliados: r.resumo.totalConciliados, total_nao_conciliados: r.resumo.totalNaoConciliados,
        total_registros: r.resumo.totalRegistros, total_notas: r.resumo.totalNotas, total_comprovantes: r.resumo.totalComprovantes,
        percentual_conciliacao: r.resumo.percentualConciliacao,
      },
      mensal: r.mensal,
      por_agencia: r.porAgencia.map((a) => ({ agencia_id: a.agenciaId, descricao: a.descricao, conciliados: a.conciliados, nao_conciliados: a.naoConciliados })),
    }).toEqual(s);
  });
});

describe("carteira (gabarito)", () => {
  test.each(doTipo("carteira").map((c) => [c.id, c.origem, c] as const))("#%s (%s)", (_id, _o, caso) => {
    const e = entrada(caso);
    const s = caso.saida;
    // As empresas que a pessoa vê: no original, todas do escritório (administrador) ou as da permissão; no
    // Connect, as do escritório para quem vê o módulo. Aqui o escopo é o do original.
    const empresas = e.empresas
      .filter((x: any) => x.do_escritorio && x.ativa && !x.apagada && (e.admin || x.permitida))
      .map((x: any) => ({ id: x.id, razaoSocial: x.razao_social }));
    const [de, ate] = [`${e.mes}-01`, `${e.mes}-31`];
    const grupos = new Map<string, GrupoDaCarteira>();
    for (const t of e.transacoes) {
      if (t.apagada || t.data < de || t.data > ate || !empresas.some((x: any) => x.id === t.empresa_id)) continue;
      const k = `${t.empresa_id}|${t.status}`;
      const g = grupos.get(k) ?? { empresaId: t.empresa_id, status: t.status, quantidade: 0, valor: dec("0.00") };
      g.quantidade += 1;
      g.valor = soma(g.valor, dec(t.valor));
      grupos.set(k, g);
    }
    const r = montarCarteira(empresas, [...grupos.values()]);
    expect(s.mes).toBe(e.mes);
    const nossos = r.map((i) => [i.empresaId, i.razaoSocial, i.transacoesImportadas, i.pendentes, i.classificadas, i.erros, i.haExtratoImportado, i.valorTotalPendente]);
    const deles = s.items.map((i: any) => [i.empresa_id, i.razao_social, i.transacoes_importadas, i.pendentes, i.classificadas, i.erros, i.ha_extrato_importado, i.valor_total_pendente]);
    for (const i of r) expect(i.valorTotalPendente).toMatch(/^\d+\.\d{2}$/);
    const comoTexto = (l: any[][]) => l.map((x) => JSON.stringify([...x.slice(0, 7), dec(String(x[7])).coeficiente === BigInt(0) ? "0" : String(Number(x[7]))]));
    if (JSON.stringify(comoTexto(nossos)) !== JSON.stringify(comoTexto(deles))) {
      // Empate de pendências e de razão social: o original não desempata; aqui, o id.
      expect(nossos.map((x) => [x[3], x[1]])).toEqual(deles.map((x: any[]) => [x[3], x[1]]));
      expect([...comoTexto(nossos)].sort()).toEqual([...comoTexto(deles)].sort());
      divergencias.ordemDaCarteiraEmpatada++;
    }
  });
});

afterAll(() => {
  // Cada divergência deliberada, contada (docs/CONTABIL-CORE.md, "Fase D1").
  expect(divergencias).toEqual({ ordemDosParesEmpatados: 0, ordemDaCarteiraEmpatada: 26 });
  console.info("divergências deliberadas do painel:", JSON.stringify(divergencias));
});
