// Teste-gabarito do reapontamento da conta bancária sintética (Bloco D, Fase D0, 26/11/2026).
//
// `gabarito/reapontamento/reapontamento-*.json` foi gerado por `scripts/contabil-core/gabarito_reapontamento.py`:
// as chamadas de `ReapontamentoService.reapontar` da suíte do original (`tests/integration/test_agencias.py`)
// e os casos inventados (várias contas bancárias, sem sintética, sintética desativada, referências vivas e
// apagadas, decisões, partidas canceladas, outra empresa, conta bancária inativa, apagada ou sem vínculo,
// vinculada à própria sintética e as referências que só o Connect conta). Cada caso traz as linhas que o
// serviço lê e grava e a saída exata do original: o relatório e o que mudou (a conta das partidas e das
// decisões, as contas desativadas).
//
// Aqui o banco é montado com a mesma entrada e o laço é o do servidor (`reapontar`, de `reapontamento.ts`):
// só as consultas são simuladas, com os mesmos filtros de `bancoDoReapontamento` (`servidor/cadastros.ts`).
// As divergências deliberadas são contadas uma a uma, e em cada uma a única diferença aceita é a dela.

import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, test } from "vitest";
import { reapontar, REFERENCIAS, type BancoDoReapontamento, type ItemDoReapontamento, type Referencia } from "./reapontamento";

/* eslint-disable @typescript-eslint/no-explicit-any */
type Caso = { id: number; tipo: string; origem: "suite" | "inventado"; entrada: any; saida: any };

const PASTA = path.join(__dirname, "gabarito", "reapontamento");
const casos: Caso[] = readdirSync(PASTA)
  .filter((n) => /^reapontamento-\d+\.json$/.test(n))
  .flatMap((n) => JSON.parse(readFileSync(path.join(PASTA, n), "utf8")) as Caso[]);

/** As referências que só o porte conta (o original não as lia). */
const SO_DO_CONNECT: readonly Referencia[] = ["agencias", "contasFilhas", "distribuicoesFatura"];

type Mudou = { registros: Record<string, string>; decisoes: Record<string, { conta_id: string | null; conta_contraparte_id: string | null }>; contas_desativadas: string[] };

/** O banco montado com a entrada; `mudou` diz o que as gravações fizeram, no formato do gabarito. */
function montar(entrada: any): { banco: BancoDoReapontamento; mudou: () => Mudou } {
  const e = JSON.parse(JSON.stringify(entrada));
  const desta = (x: any) => x.empresa === "esta";
  const antesR = new Map<string, string>(e.registros.map((r: any) => [r.id, r.conta_id]));
  const antesD = new Map<string, string>(e.decisoes.map((d: any) => [d.id, `${d.conta_id}|${d.conta_contraparte_id}`]));
  const desativadas: string[] = [];
  const banco: BancoDoReapontamento = {
    agenciasVinculadas: async () =>
      e.agencias
        .filter((a: any) => desta(a) && !a.apagada && a.conta_contabil_id)
        .map((a: any) => ({ id: a.id, bancoSigla: a.banco_sigla, agencia: a.agencia, numero: a.numero, digito: a.digito, contaContabilId: a.conta_contabil_id }))
        .sort((x: any, y: any) => (x.bancoSigla + x.agencia + x.numero + x.id < y.bancoSigla + y.agencia + y.numero + y.id ? -1 : 1)),
    sinteticaViva: async (codigo) => {
      const c = e.contas.find((x: any) => desta(x) && !x.apagada && x.codigo === codigo);
      return c ? { id: c.id, codigo: c.codigo } : null;
    },
    mover: async (de, para) => {
      let registros = 0;
      let decisoes = 0;
      for (const r of e.registros) {
        if (!desta(r) || r.conta_id !== de) continue;
        r.conta_id = para;
        registros++;
      }
      for (const d of e.decisoes) {
        if (!desta(d) || d.conta_id !== de) continue;
        d.conta_id = para;
        decisoes++;
      }
      for (const d of e.decisoes) {
        if (!desta(d) || d.conta_contraparte_id !== de) continue;
        d.conta_contraparte_id = para;
        decisoes++;
      }
      return { registros, decisoes };
    },
    contarReferencias: async (contaId) => ({
      regras: e.regras.filter((g: any) => desta(g) && g.conta_id === contaId).length,
      contrapartes: e.contrapartes.filter((c: any) => desta(c) && c.conta_contabil_id === contaId).length,
      lancamentosCartao: e.lancamentos_cartao.filter((x: any) => desta(x) && x.conta_id === contaId).length,
      agencias: e.agencias.filter((a: any) => desta(a) && !a.apagada && a.conta_contabil_id === contaId).length,
      contasFilhas: e.contas.filter((c: any) => desta(c) && !c.apagada && c.pai_id === contaId).length,
      distribuicoesFatura: e.distribuicoes.filter(
        (d: any) => desta(d) && !d.fatura_apagada && Object.values<any[]>(d.distribuicoes).some((partes) => partes.some((p) => p.conta_id === contaId)),
      ).length,
    }),
    desativar: async (contaId) => {
      const c = e.contas.find((x: any) => desta(x) && x.id === contaId && !x.apagada);
      if (!c) return;
      c.apagada = true;
      desativadas.push(c.id);
    },
  };
  const mudou = (): Mudou => ({
    registros: Object.fromEntries(e.registros.filter((r: any) => antesR.get(r.id) !== r.conta_id).map((r: any) => [r.id, r.conta_id])),
    decisoes: Object.fromEntries(
      e.decisoes
        .filter((d: any) => antesD.get(d.id) !== `${d.conta_id}|${d.conta_contraparte_id}`)
        .map((d: any) => [d.id, { conta_id: d.conta_id, conta_contraparte_id: d.conta_contraparte_id }]),
    ),
    contas_desativadas: desativadas,
  });
  return { banco, mudou };
}

/** O relatório do original com os nomes do porte. */
const doOriginal = (r: any): ItemDoReapontamento => ({
  agencia: r.agencia,
  contaSintetica: r.conta_sintetica,
  registrosMovidos: r.registros_movidos,
  decisoesMovidas: r.decisoes_movidas,
  sinteticaDesativada: r.sintetica_desativada,
  referenciasRestantes: Object.fromEntries(Object.entries(r.referencias_restantes).map(([k, v]) => [k === "lancamentos_cartao" ? "lancamentosCartao" : k, v])),
});

const porSintetica = (a: ItemDoReapontamento, b: ItemDoReapontamento) => (a.contaSintetica < b.contaSintetica ? -1 : a.contaSintetica > b.contaSintetica ? 1 : 0);

/** As divergências deliberadas, por caso. */
const divergencias = { vinculadaAPropria: [] as number[], referenciaDoConnect: [] as number[] };

describe("reapontamento da conta sintética (gabarito)", () => {
  test("o gabarito traz a suíte do original e casos com e sem desativação", () => {
    expect(casos.filter((c) => c.origem === "suite").length).toBe(2);
    expect(casos.some((c) => c.saida.relatorio.some((r: any) => r.sintetica_desativada))).toBe(true);
    expect(casos.some((c) => c.saida.relatorio.some((r: any) => !r.sintetica_desativada))).toBe(true);
    expect(casos.some((c) => c.saida.relatorio.length === 0)).toBe(true);
  });

  test.each(casos.map((c) => [c.id, c.tipo, c] as const))("#%s %s", async (id, _tipo, c) => {
    const { banco, mudou } = montar(c.entrada);
    const { relatorio, passos } = await reapontar(banco);
    expect(passos.length).toBe(relatorio.length);
    const obtido = { relatorio: [...relatorio].sort(porSintetica), mudou: mudou() };

    // O que o original devolveu, com as divergências deliberadas aplicadas.
    let esperado: ItemDoReapontamento[] = c.saida.relatorio.map(doOriginal);
    const desativadas = new Set<string>(c.saida.mudou.contas_desativadas);
    const contaDoCodigo = (codigo: string) => c.entrada.contas.find((x: any) => x.empresa === "esta" && !x.apagada && x.codigo === codigo)?.id;

    // 1. A conta bancária vinculada à PRÓPRIA sintética: o original "movia" para a mesma conta e a desativava.
    const propria = new Set(
      c.entrada.agencias.filter((a: any) => a.empresa === "esta" && !a.apagada && a.conta_contabil_id && a.conta_contabil_id === contaDoCodigo(`1.1.B.${a.id.replace(/-/g, "").slice(0, 16)}`)).map((a: any) => a.conta_contabil_id),
    );
    if (esperado.some((r) => propria.has(contaDoCodigo(r.contaSintetica)))) {
      divergencias.vinculadaAPropria.push(id);
      for (const r of esperado) if (propria.has(contaDoCodigo(r.contaSintetica))) desativadas.delete(contaDoCodigo(r.contaSintetica));
      esperado = esperado.filter((r) => !propria.has(contaDoCodigo(r.contaSintetica)));
    }

    // 2. As referências que só o porte conta: a sintética fica, e a única diferença é a referência a mais.
    const soDoConnect = obtido.relatorio.filter((r) => SO_DO_CONNECT.some((k) => r.referenciasRestantes[k]));
    if (soDoConnect.length) {
      divergencias.referenciaDoConnect.push(id);
      esperado = esperado.map((r) => {
        const nosso = soDoConnect.find((x) => x.contaSintetica === r.contaSintetica);
        if (!nosso) return r;
        const extras = Object.fromEntries(SO_DO_CONNECT.filter((k) => nosso.referenciasRestantes[k]).map((k) => [k, nosso.referenciasRestantes[k]]));
        const referenciasRestantes = Object.fromEntries(REFERENCIAS.filter((k) => ({ ...r.referenciasRestantes, ...extras })[k]).map((k) => [k, ({ ...r.referenciasRestantes, ...extras })[k]]));
        if (r.sinteticaDesativada) desativadas.delete(contaDoCodigo(r.contaSintetica));
        return { ...r, sinteticaDesativada: false, referenciasRestantes };
      });
    }

    expect(obtido.relatorio).toEqual([...esperado].sort(porSintetica));
    expect(obtido.mudou.registros).toEqual(c.saida.mudou.registros);
    expect(obtido.mudou.decisoes).toEqual(c.saida.mudou.decisoes);
    expect([...obtido.mudou.contas_desativadas].sort()).toEqual([...desativadas].sort());
  });

  // Roda depois dos casos (o vitest executa os testes de um arquivo na ordem).
  test("as divergências deliberadas, contadas uma a uma", () => {
    const tipos = (ids: number[]) => ids.map((i) => casos.find((c) => c.id === i)!.tipo);
    expect(tipos(divergencias.vinculadaAPropria)).toEqual(["vinculada_a_propria_sintetica", "vinculada_a_propria_sintetica", "vinculada_a_propria_sintetica"]);
    expect(tipos(divergencias.referenciaDoConnect)).toEqual(["connect_outra_agencia_na_sintetica", "connect_conta_filha", "connect_distribuicao"]);
  });
});
