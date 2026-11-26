// Testes-gabarito das exportações (porte de `ExportacaoService`, `src/domain/exportacao/service.py`, e de
// `formatos.py`; Bloco D, Fase D1, 26/11/2026).
//
// `gabarito/exportacao-*.json` foi gerado por `scripts/contabil-core/gabarito_exportacao.py`: cada chamada
// de `exportar` e dos exportadores internos feita pela suíte do original, os casos inventados (os mundos em
// `exportacao-mundos.json`), as chamadas diretas de `_dicts_to_csv`/`_dicts_to_xlsx` e do `ExportJobCreate`.
// Cada caso traz a entrada (o que o serviço leu do banco e o pedido) e a saída exata: o total, as contas sem
// código reduzido e o arquivo (o CSV e o TXT como texto; o XLSX lido de volta pelo openpyxl), ou a recusa.
// Aqui o banco é simulado pela entrada (só as linhas da empresa, como o servidor lê), e o arquivo sai das
// mesmas funções que o servidor usa. As divergências deliberadas são contadas uma a uma.

import ExcelJS from "exceljs";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { afterAll, describe, expect, test } from "vitest";
import { dec, type Dec } from "../motor/decimal";
import { linhasParaCsv, linhasParaTxt, type Linha } from "../motor/dominio";
import type { ContaParaExportar } from "../motor/exportacao";
import { exportacaoSchema } from "../entradas";
import {
  conferirPedido,
  montarExportacao,
  periodoDoPedido,
  type DadosDaExportacao,
  type PedidoDeExportacao,
  type TipoDeExportacao,
} from "./arquivos";
import { planilhaDasLinhas } from "./planilha";

/* eslint-disable @typescript-eslint/no-explicit-any */
type Caso = { id: number; tipo: string; origem: "suite" | "inventado" | "direto"; entrada: any; saida: any };
type Folha = { titulo: string; linhas: (string | number | null)[][]; negrito: string[]; formatos: [string, string][] };

const PASTA = path.join(__dirname, "gabarito");
const casos: Caso[] = readdirSync(PASTA)
  .filter((n) => /^exportacao-\d+\.json$/.test(n))
  .flatMap((n) => JSON.parse(readFileSync(path.join(PASTA, n), "utf8")) as Caso[]);
const mundos: Record<string, any> = JSON.parse(readFileSync(path.join(PASTA, "exportacao-mundos.json"), "utf8"));
const doTipo = (pred: (c: Caso) => boolean) => casos.filter(pred);

const divergencias = { buscaDoExtrato: 0, ordemDosEmpates: 0, validacaoDaRota: 0 };

const BASE = Date.UTC(2026, 0, 1);
const criado = (k: number) => new Date(BASE + k * 60_000);
const esta = (x: any) => x.empresa !== "outra";

/** O que o servidor lê do banco para a empresa: as linhas dela (as contas, por id, como o original). */
function dados(e: any): DadosDaExportacao {
  return {
    empresa: { id: e.empresa.id, cnpj: e.empresa.cnpj, razaoSocial: "EMPRESA EXEMPLO LTDA" },
    agencias: e.agencias.filter(esta).map((a: any) => ({
      id: a.id, bancoSigla: a.banco_sigla, agencia: a.agencia, numero: a.numero, digito: a.digito, ativa: a.ativa, apagada: a.apagada,
    })),
    importacoes: new Map(e.importacoes.filter(esta).map((i: any) => [i.id, new Date(i.created_at)])),
    transacoes: e.transacoes.filter(esta).map((t: any) => ({
      id: t.id, agenciaId: t.agencia_id, data: t.data, valor: dec(t.valor), historico: t.historico, dc: t.dc, status: t.status,
      ordem: t.ordem, importacaoId: t.importacao_id, apagada: t.apagada, criadoEm: criado(t.ordem_insercao),
    })),
    registros: e.registros.filter(esta).map((r: any) => ({
      id: r.id, lancamentoId: r.lancamento_id, transacaoId: r.transacao_id, contaId: r.conta_id, agenciaId: r.agencia_id, historico: r.historico,
      historicoExtrato: r.historico_extrato, dc: r.dc, tipoRegra: r.tipo_regra, valor: dec(r.valor), dataLancamento: new Date(r.data_lancamento),
      apagado: r.apagado, criadoEm: criado(r.ordem_insercao),
    })),
    contas: new Map<string, ContaParaExportar>(e.contas.map((c: any) => [c.id, { contaNumero: c.conta_numero, codigo: c.codigo, descricao: c.descricao }])),
    notas: e.notas.filter(esta).map((n: any) => ({
      id: n.id, tipo: n.tipo, numero: n.numero, serie: n.serie, cnpjEmitente: n.cnpj_emitente, nomeEmitente: n.nome_emitente,
      cnpjDestinatario: n.cnpj_destinatario, valor: dec(n.valor), dataEmissao: new Date(n.data_emissao), status: n.status,
      transacaoId: n.transacao_id, chaveAcesso: n.chave_acesso, apagada: n.apagada, criadoEm: criado(n.ordem_insercao),
    })),
    comprovantes: e.comprovantes.filter(esta).map((c: any) => ({
      id: c.id, transacaoId: c.transacao_id, favorecido: c.favorecido, valorPago: dec(c.valor_pago), apagado: c.apagado, criadoEm: criado(c.ordem_insercao),
    })),
  };
}

function pedido(p: any, tipo: TipoDeExportacao, comMes: boolean): PedidoDeExportacao {
  return {
    tipo,
    periodo: periodoDoPedido({ mes: comMes ? p.mes : null, dataDe: p.data_de ?? null, dataAte: p.data_ate ?? null }),
    incluirContasInativas: !!p.incluir_contas_inativas,
    usarHistoricoExtrato: !!p.usar_historico_extrato,
    agenciaId: p.agencia_id ?? null,
    status: p.status ?? null,
    historico: p.historico ?? null,
    dc: p.dc ?? null,
    valorMin: p.valor_min != null ? dec(String(p.valor_min)) : null,
    valorMax: p.valor_max != null ? dec(String(p.valor_max)) : null,
  };
}

/** A planilha do porte lida de volta como o despejo do gabarito (o que o Excel vê). */
async function despejo(conteudo: Uint8Array): Promise<Folha[]> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(conteudo as unknown as ArrayBuffer);
  return wb.worksheets.map((ws) => {
    const linhas: (string | number | null)[][] = [];
    const negrito: string[] = [];
    const formatos: [string, string][] = [];
    for (let r = 1; r <= ws.rowCount; r++) {
      const row = ws.getRow(r);
      const valores: (string | number | null)[] = [];
      for (let k = 1; k <= row.cellCount; k++) {
        const c = row.getCell(k);
        if (c.font?.bold) negrito.push(c.address);
        if (c.numFmt && c.numFmt !== "General") formatos.push([c.address, c.numFmt]);
        const v = c.value;
        if (v === null || v === undefined) valores.push(null);
        else if (typeof v === "number") valores.push(v === 0 ? 0 : v);
        else if (typeof v === "string") valores.push(v);
        else throw new Error(`valor inesperado em ${c.address}: ${JSON.stringify(v)}`);
      }
      while (valores.length && valores[valores.length - 1] === null) valores.pop();
      linhas.push(valores);
    }
    while (linhas.length && linhas[linhas.length - 1].length === 0) linhas.pop();
    return { titulo: ws.name, linhas, negrito, formatos };
  });
}

/** `ILIKE '%termo%'` do PostgreSQL (o original): minúscula Unicode, `%` e `_` curingas, barra invertida escapa. */
function ilikePg(historico: string, termo: string): boolean {
  const padrao = `%${termo.trim()}%`.toLowerCase();
  let rx = "";
  for (let i = 0; i < padrao.length; i++) {
    const c = padrao[i];
    if (c === "\\" && i + 1 < padrao.length) rx += padrao[++i].replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    else rx += c === "%" ? ".*" : c === "_" ? "." : c.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }
  return new RegExp(`^${rx}$`, "su").test(historico.toLowerCase());
}

const TIPO_DO_INTERNO: Record<string, TipoDeExportacao | null> = {
  _exportar_lancamentos: "lancamentos",
  _exportar_lancamentos_importacao: "lancamentos_importacao",
  _exportar_extrato: "extrato",
  _exportar_conferencia: "conferencia",
  _exportar_notas: null,
};

async function conferirArquivo(caso: Caso, formato: string, d: DadosDaExportacao, p: PedidoDeExportacao) {
  const s = caso.saida;
  let m = montarExportacao(d, p);
  if (!m.ok) {
    expect(s.erro, `caso ${caso.id}`).toBeDefined();
    expect(m.erro).toBe(s.erro.mensagem);
    expect(m.detalhes ?? null).toEqual(s.erro.detalhes);
    return;
  }
  expect(s.erro, `caso ${caso.id}: ${JSON.stringify(s.erro)}`).toBeUndefined();
  const gerar = async (montado: typeof m) => {
    if (!montado.ok) throw new Error("recusa inesperada");
    const v = montado.valor;
    if (formato === "xlsx") return { planilha: await despejo(await planilhaDasLinhas(v.linhas, v.colunas, v.folha)) };
    const texto = formato === "txt" ? linhasParaTxt(v.linhas, v.colunas) : linhasParaCsv(v.linhas, v.colunas);
    return { texto };
  };
  let arquivo = await gerar(m);
  const esperado = s.planilha ? { planilha: s.planilha } : { texto: s.texto };
  if (p.historico && JSON.stringify(arquivo) !== JSON.stringify(esperado)) {
    // A busca do extrato é a da aba do Connect (sem acento e sem curinga); com o `ilike` do original, sai igual.
    divergencias.buscaDoExtrato++;
    m = montarExportacao(d, p, { casaNaBusca: ilikePg });
    arquivo = await gerar(m);
  }
  if (p.tipo === "conferencia" && JSON.stringify(arquivo) !== JSON.stringify(esperado)) {
    // A conferência ordena só pela data; no empate, a ordem do original é a do plano do banco (no SQLite do
    // gabarito, a do índice usado; no PostgreSQL, a do disco). O porte desempata pela ordem do extrato. Os blocos
    // de cada dia (a transação e as linhas dos documentos dela) têm de ser os mesmos.
    expect(blocosPorDia(arquivo), `caso ${caso.id}`).toEqual(blocosPorDia(esperado));
    divergencias.ordemDosEmpates++;
    return conferirTotais(m, s);
  }
  expect(arquivo, `caso ${caso.id}`).toEqual(esperado);
  conferirTotais(m, s);
}

function conferirTotais(m: ReturnType<typeof montarExportacao>, s: any) {
  if (!m.ok) throw new Error("recusa inesperada");
  expect(m.valor.total).toBe(s.total);
  expect(m.valor.contasSemCodigoAbreviado).toEqual(s.contas_sem_codigo);
}

/** As linhas da conferência em blocos (a linha da transação e as dos documentos dela), agrupados pelo dia, sem a ordem do empate. */
function blocosPorDia(arquivo: { texto?: string; planilha?: Folha[] }): Record<string, string[]> {
  const linhas: { data: string; texto: string }[] = arquivo.texto
    ? arquivo.texto.split("\r\n").slice(1, -1).map((l) => ({ data: l.split(",")[0], texto: l }))
    : arquivo.planilha![0].linhas.slice(1).map((l) => ({ data: l[0] === null || l[0] === undefined ? "" : String(l[0]), texto: JSON.stringify(l) }));
  const blocos: { data: string; texto: string }[] = [];
  for (const l of linhas) {
    if (l.data || blocos.length === 0) blocos.push({ ...l });
    else blocos[blocos.length - 1].texto += "\n" + l.texto;
  }
  const porDia: Record<string, string[]> = {};
  for (const b of blocos) (porDia[b.data] ??= []).push(b.texto);
  for (const k of Object.keys(porDia)) porDia[k].sort();
  return porDia;
}

describe("exportar (gabarito)", () => {
  const lista = doTipo((c) => c.tipo === "exportar");
  test.each(lista.map((c) => [c.id, c.origem, c.entrada.pedido.tipo ?? "lancamentos", c] as const))("#%s (%s, %s)", async (_id, _o, _t, caso) => {
    const e = caso.entrada.mundo ? { ...mundos[caso.entrada.mundo], ...caso.entrada } : caso.entrada;
    const p = e.pedido;
    const formato = p.formato ?? "xlsx";
    const conferido = conferirPedido(formato, p.tipo ?? "lancamentos");
    if (!conferido.ok) {
      expect(caso.saida.erro?.mensagem).toBe(conferido.erro);
      return;
    }
    await conferirArquivo(caso, formato, dados(e), pedido(p, conferido.tipo, true));
  });
});

describe("exportadores internos chamados direto pela suíte (gabarito)", () => {
  const lista = doTipo((c) => c.tipo.startsWith("_exportar"));
  test.each(lista.map((c) => [c.id, c.tipo, c] as const))("#%s %s", async (_id, chamada, caso) => {
    const e = caso.entrada;
    const tipo = TIPO_DO_INTERNO[chamada] ?? (e.tipo as TipoDeExportacao);
    // Chamado direto, o exportador não aplica a competência (é o `exportar` que a converte em datas).
    await conferirArquivo(caso, e.formato === "csv" || e.formato === "txt" ? e.formato : "xlsx", dados(e), pedido(e.pedido, tipo, false));
  });
});

describe("_dicts_to_csv e _dicts_to_xlsx (gabarito)", () => {
  test.each(doTipo((c) => c.tipo === "formatacao").map((c) => [c.id, c] as const))("#%s", async (_id, caso) => {
    const { linhas, colunas, folha } = caso.entrada;
    const nossas: Linha[] = linhas.map((l: any) => {
      const r: Linha = {};
      for (const [k, v] of Object.entries(l)) r[k] = v === null ? "" : typeof v === "object" ? (dec((v as { dec: string }).dec) as Dec) : (v as string);
      return r;
    });
    expect(linhasParaCsv(nossas, colunas)).toBe(caso.saida.texto);
    expect(await despejo(await planilhaDasLinhas(nossas, colunas, folha))).toEqual(caso.saida.planilha);
  });
});

describe("ExportJobCreate × a validação da rota (gabarito)", () => {
  // A rota do Connect recebe só a competência e os filtros da tela; os campos que ela não tem ficam de fora.
  const daRota = ["mes", "dc", "valor_min", "valor_max", "agencia_id", "status", "historico"];
  test.each(doTipo((c) => c.tipo === "validacao").map((c) => [c.id, JSON.stringify(c.entrada), c] as const))("#%s %s", (_id, _e, caso) => {
    const e = caso.entrada;
    const campos = Object.keys(e);
    if (campos.length === 0 || campos.some((k) => !daRota.includes(k))) return;
    const r = exportacaoSchema.safeParse({
      tipo: "extrato",
      formato: "csv",
      mes: e.mes ?? null,
      agenciaId: e.agencia_id ?? null,
      status: e.status ?? null,
      busca: e.historico ?? null,
      dc: e.dc ?? null,
      valorMin: e.valor_min ?? null,
      valorMax: e.valor_max ?? null,
    });
    const aceitoNoOriginal = "ok" in caso.saida;
    if (r.success !== aceitoNoOriginal) {
      // O ano 0000 e a competência vazia: o pydantic do original aceita o ano zero; a rota do Connect usa a
      // competência das outras telas (ano maior que zero) e trata "" como "sem competência".
      expect(["0000-01", ""]).toContain(e.mes);
      divergencias.validacaoDaRota++;
    }
  });
});

afterAll(() => {
  // Cada divergência deliberada, contada (docs/CONTABIL-CORE.md, "Fase D1").
  expect(divergencias).toEqual({ buscaDoExtrato: 7, ordemDosEmpates: 32, validacaoDaRota: 2 });
  console.info("divergências deliberadas das exportações:", JSON.stringify(divergencias));
});
