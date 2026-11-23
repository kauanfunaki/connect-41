// Testes-gabarito do serviço dos cartões (porte das partes puras de `CartaoService`,
// `src/domain/cartoes/service.py`, de `DistribuicaoService`, `src/domain/cartoes/distribuicao.py`, e dos
// esquemas de `src/schemas/cartoes.py`, 23/11/2026).
//
// `gabarito/servico/cartoes-servico-*.json` foi gerado por `scripts/contabil-core/gabarito_cartoes_servico.py`:
// as chamadas feitas pela suíte do original (cartões, faturas, lançamentos, CSV, PDF, distribuição e
// documentos), os casos inventados para cada ramo e as chamadas diretas dos esquemas, da identidade da
// compra, do `uuid5`, da data e do valor do CSV, do `csv.DictReader`, de `leitura_expirada` e do hash da
// classificação bancária. Cada caso traz a entrada (o banco que o serviço leu e o que recebeu) e a saída
// exata. Aqui o banco é simulado pela entrada, e as decisões são as funções puras de `servico.ts` que o
// servidor usa. O NEO (`aplicar` e `desfazer`) não é refeito aqui: confere-se o que é pedido a ele (os
// componentes, o lote, o cancelamento), e o resto fica com o ensaio no banco local. As divergências
// deliberadas são contadas uma a uma.

import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { afterAll, describe, expect, test, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/ai", () => ({ gerarTexto: vi.fn(), isAiConfigured: vi.fn() }));

import { centavosDoBanco, dec, decimal, deCentavos, fixo, NAO_FINITO, reescala, texto, type Dec } from "../motor/decimal";
import { isoUtc } from "../comprovantes/servico";
import { RecusaDoDocumento, validarItens } from "./documentos";
import {
  conferirAplicar,
  conferirAssociacao,
  conferirAtualizacaoDaFatura,
  conferirConfirmacao,
  conferirDesfazer,
  conferirNovoDocumento,
  conferirRemocaoDoCartao,
  conferirSalvar,
  CONTAS_INVALIDAS,
  CsvInvalido,
  guardado,
  hashDaClassificacao,
  identificadorDaCompra,
  idDoGastoConfirmado,
  importarLancamentosDoPdf,
  importarLinhasDoCsv,
  leituraExpirada,
  lerCompetencia,
  lerCsv,
  lerDataDoCsv,
  linhasDoCsv,
  naoFinito,
  nomeDoDocumento,
  revisaoGuardada,
  str,
  textoDoValorDoCsv,
  uuid5,
  validarAplicarDistribuicao,
  validarAtualizacaoDaFatura,
  validarAtualizacaoDoCartao,
  validarCartao,
  validarComponente,
  validarConfirmacao,
  validarDesfazerDistribuicao,
  validarFatura,
  validarLancamento,
  validarSalvarDistribuicao,
  valorMonetario,
  vistaDaDistribuicao,
  COMPRA_REMOVIDA,
  DESCRICAO_LONGA,
  VALOR_ACIMA_DO_LIMITE,
  VALOR_ILEGIVEL_NA_LINHA,
  VALOR_NAO_FINITO,
  type ComponenteGuardado,
  type DocumentoDaFatura,
  type EstadoDaDistribuicao,
  type GastoDaFatura,
  type ItemRevisado,
  type PagamentoDaFatura,
  type RecusaCartao,
} from "./servico";

/* eslint-disable @typescript-eslint/no-explicit-any */
type Caso = { id: number; tipo: string; origem: "suite" | "inventado" | "direto"; entrada: any; saida: any };

const PASTA = path.join(__dirname, "gabarito", "servico");
const casos: Caso[] = readdirSync(PASTA)
  .filter((n) => /^cartoes-servico-\d+\.json$/.test(n))
  .flatMap((n) => JSON.parse(readFileSync(path.join(PASTA, n), "utf8")) as Caso[]);
const doTipo = (tipo: string) => casos.filter((c) => c.tipo === tipo);

/** As divergências deliberadas, cada uma contada (os totais são conferidos no fim). */
const divergencias = {
  /** O valor acima de `Decimal(15,2)` (ou a descrição acima de 500) é recusado com frase; no original, erro 500 do PostgreSQL. */
  alemDaColuna: 0,
  /** A empresa inexistente é "não encontrada"; no original, a gravação esbarrava na chave estrangeira. */
  empresaInexistente: 0,
  /** A exceção crua do `decimal` (`[<class 'decimal.InvalidOperation'>]`) vira frase. */
  excecaoDoDecimal: 0,
  /** O CSV com coluna a menos, quebra `\r` solta ou aspas abertas até o fim: recusa do arquivo; no original, erro 500. */
  csvInvalido: 0,
  /** A compra removida e reimportada é erro da linha; no original, chave primária repetida e erro 500. */
  compraRemovida: 0,
  /** Exceção crua de um validador do original (`ultimos_digitos` numérico): recusa com frase. */
  excecaoDoValidador: 0,
  /** O pydantic aceita e o porte recusa (ou o contrário) num esquema — ver cada contagem. */
  esquema: 0,
};
const etapaDoNeo = { recusas: 0 };

// ─── O banco simulado ───────────────────────────────────────────────────────

const ERROS: Record<string, RecusaCartao["codigo"]> = { NotFoundError: "NAO_ENCONTRADA", ConflictError: "CONFLITO", ValidationError: "INVALIDA" };

/** O dinheiro como o PostgreSQL grava em `Numeric(15,2)` (meio para longe do zero). */
const noBanco = (d: Dec) => fixo(deCentavos(centavosDoBanco(d)), 2);

type Resultado = { resposta?: any; erro?: { codigo: string; mensagem: string }; mudou?: Record<string, any[]>; neo?: any[] };

const r = (codigo: RecusaCartao) => ({ erro: { codigo: codigo.codigo, mensagem: codigo.erro } });

class Banco {
  e: any;
  mudou: Record<string, Map<string, any>> = {};
  novos = 0;
  constructor(estado: any) {
    this.e = JSON.parse(JSON.stringify(estado));
  }
  get existe() {
    return this.e.empresa !== null;
  }
  tocar(tabela: string, linha: any) {
    (this.mudou[tabela] ??= new Map()).set(linha.id, linha);
  }
  novoId() {
    return `<novo${++this.novos}>`;
  }
  saidaMudou() {
    const s: Record<string, any[]> = {};
    for (const [t, m] of Object.entries(this.mudou)) if (m.size) s[t] = [...m.values()].map((x) => sem(x, "ha_segundos"));
    return s;
  }
  cartao(id: string) {
    return this.e.cartoes.find((c: any) => c.id === id && c.empresa === "esta" && !c.apagado && this.existe) ?? null;
  }
  fatura(cartaoId: string, faturaId: string) {
    const f = this.e.faturas.find((x: any) => x.id === faturaId && x.cartao_id === cartaoId && x.empresa === "esta" && !x.apagada && this.existe);
    if (!f) return null;
    return { f, c: this.e.cartoes.find((c: any) => c.id === f.cartao_id) };
  }
  lancamentosVivos(faturaId: string, soDaEmpresa = false) {
    return this.e.lancamentos.filter((l: any) => l.fatura_id === faturaId && !l.apagado && (!soDaEmpresa || l.empresa === "esta"));
  }
  totais(faturaId: string): [number, Dec] {
    const vivos = this.lancamentosVivos(faturaId);
    return [vivos.length, valorMonetario(vivos.reduce((s: Dec, l: any) => somaDec(s, dec(l.valor)), dec("0")))];
  }
  distribuicao(faturaId: string) {
    return this.e.distribuicoes.find((d: any) => d.fatura_id === faturaId && d.empresa === "esta") ?? null;
  }
  conta(id: string, analitica = false) {
    return this.e.contas.find((c: any) => c.id === id && c.empresa === "esta" && !c.apagada && (!analitica || c.tipo_sa === "A")) ?? null;
  }
}

const somaDec = (a: Dec, b: Dec): Dec => {
  const e = Math.min(a.expoente, b.expoente);
  const x = reescala(a, e);
  const y = reescala(b, e);
  const va = x.negativo ? -x.coeficiente : x.coeficiente;
  const vb = y.negativo ? -y.coeficiente : y.coeficiente;
  const v = va + vb;
  return { negativo: v < BigInt(0), coeficiente: v < BigInt(0) ? -v : v, expoente: e };
};

/** O objeto sem uma chave. */
const sem = (x: any, chave: string) => Object.fromEntries(Object.entries(x).filter(([k]) => k !== chave));
const dataDoInstante = (d: Date | null) => (d === null ? null : isoUtc(d));

function respostaDaFatura(f: any, c: any, total: number, valor: Dec) {
  return {
    id: f.id, cartao_id: f.cartao_id, cartao_nome: c.nome, cartao_bandeira: c.bandeira, cartao_digitos: c.ultimos_digitos, competencia: f.competencia,
    data_fechamento: f.data_fechamento, data_vencimento: f.data_vencimento, valor_total: str(valorMonetario(valor)), status: f.status,
    transacao_id: f.transacao_id, observacao: f.observacao, total_lancamentos: total,
  };
}

const respostaDoCartao = (c: any, limite: string | null, extra: { total_faturas: number; fatura_aberta_valor: string | null }) => ({
  id: c.id, nome: c.nome, bandeira: c.bandeira, ultimos_digitos: c.ultimos_digitos, dia_fechamento: c.dia_fechamento, dia_vencimento: c.dia_vencimento,
  limite, ativo: c.ativo, ...extra,
});

const respostaDoLancamento = (l: any, valor: Dec, dataCompra: string) => ({
  id: l.id, fatura_id: l.fatura_id, data_compra: dataCompra, descricao: l.descricao, valor: str(valorMonetario(valor)), conta_id: l.conta_id,
  parcela_atual: l.parcela_atual, parcela_total: l.parcela_total,
});

/** Os nomes do original → os do porte. */
const camelo = (d: Record<string, unknown>) =>
  Object.fromEntries(Object.entries(d ?? {}).map(([k, v]) => [k.replace(/_([a-z])/g, (_, c: string) => c.toUpperCase()), v]));

// ─── Distribuição: o que `obter` lê ─────────────────────────────────────────

function pagamentoDe(b: Banco, f: any): PagamentoDaFatura | null {
  if (!f.transacao_id) return null;
  const t = b.e.transacoes.find((x: any) => x.id === f.transacao_id && x.empresa === "esta" && !x.apagada);
  return t ? { id: t.id, valor: dec(t.valor), data: t.data, dc: t.dc, status: t.status, agenciaId: t.agencia_id, historico: t.historico } : null;
}

function partidasDe(b: Banco, transacaoId: string | null) {
  if (!transacaoId) return [];
  return b.e.registros
    .filter((x: any) => x.transacao_id === transacaoId && x.empresa === "esta" && !x.apagado)
    .sort((x: any, y: any) => (x.id < y.id ? -1 : x.id > y.id ? 1 : 0))
    .map((x: any) => ({ id: x.id, contaId: x.conta_id, valor: dec(x.valor), historico: x.historico, dc: x.dc }));
}

function gastos(b: Banco, faturaId: string): GastoDaFatura[] {
  return b
    .lancamentosVivos(faturaId, true)
    .map((l: any) => ({ id: l.id, dataCompra: l.data_compra.slice(0, 10), descricao: l.descricao, valor: dec(l.valor), _instante: l.data_compra }))
    .sort((x: any, y: any) => new Date(x._instante).getTime() - new Date(y._instante).getTime() || (x.id < y.id ? -1 : x.id > y.id ? 1 : 0))
    .map((g: any) => sem(g, "_instante") as GastoDaFatura);
}

const AGORA = new Date();

function documentosDe(b: Banco, faturaId: string): DocumentoDaFatura[] {
  return b.e.documentos
    .filter((d: any) => d.fatura_id === faturaId && d.empresa === "esta")
    .map((d: any) => ({ id: d.id, nome: d.nome, status: d.status, resultado: d.resultado, erro: d.erro, atualizadoEm: new Date(AGORA.getTime() - d.ha_segundos * 1000), temArquivo: true }));
}

function estadoDe(b: Banco, faturaId: string, criar: boolean): any {
  let d = b.distribuicao(faturaId);
  if (!d && criar) {
    d = { id: b.novoId(), empresa: "esta", fatura_id: faturaId, versao: 0, distribuicoes: {}, aplicacao: null };
    b.e.distribuicoes.push(d);
  }
  return d;
}

const comoEstado = (d: any): EstadoDaDistribuicao => ({ versao: d.versao, distribuicoes: d.distribuicoes, aplicacao: d.aplicacao });

function obter(b: Banco, f: any) {
  const d = b.distribuicao(f.id);
  const pagamento = pagamentoDe(b, f);
  const hash = hashDaClassificacao(partidasDe(b, f.transacao_id), pagamento);
  const v = vistaDaDistribuicao(d ? comoEstado(d) : null, gastos(b, f.id), hash, f.transacao_id, documentosDe(b, f.id), AGORA);
  return {
    versao: v.versao,
    itens: v.itens,
    distribuicoes: v.distribuicoes,
    gastos_alterados: v.gastosAlterados,
    total: v.total,
    distribuido: v.distribuido,
    restante: v.restante,
    classificacao_hash: v.classificacaoHash,
    pagamento_id: v.pagamentoId,
    aplicacao: v.aplicacao,
    documentos: v.documentos.map((x) => sem(x, "temArquivo")),
  };
}

function avancar(b: Banco, d: any, versao: number): RecusaCartao | null {
  if (d.versao !== versao) return { ok: false, erro: "A distribuição mudou. Atualize a tela antes de salvar.", codigo: "CONFLITO" };
  d.versao = versao + 1;
  b.tocar("distribuicoes", d);
  return null;
}

// ─── Cada método ────────────────────────────────────────────────────────────

const FATURA_NAO = { ok: false as const, erro: "Fatura não encontrada.", codigo: "NAO_ENCONTRADA" as const };
const CARTAO_NAO = { ok: false as const, erro: "Cartão não encontrado.", codigo: "NAO_ENCONTRADA" as const };

function simular(tipo: string, entrada: any): Resultado {
  const b = new Banco(entrada.estado);
  const a = entrada.args;
  const fim = (resposta: any): Resultado => ({ resposta, mudou: b.saidaMudou() });
  switch (tipo) {
    case "listar_cartoes": {
      const cs = b.e.cartoes.filter((c: any) => c.empresa === "esta" && !c.apagado && b.existe).sort((x: any, y: any) => (x.nome < y.nome ? -1 : x.nome > y.nome ? 1 : 0));
      return fim({
        total: cs.length,
        itens: cs.map((c: any) => {
          const fs = b.e.faturas.filter((f: any) => f.cartao_id === c.id && !f.apagada).sort((x: any, y: any) => (x.competencia < y.competencia ? 1 : -1));
          const aberta = fs.find((f: any) => f.status === "aberta");
          return respostaDoCartao(c, c.limite, { total_faturas: fs.length, fatura_aberta_valor: aberta ? str(b.totais(aberta.id)[1]) : null });
        }),
      });
    }
    case "criar_cartao": {
      const v = validarCartao(camelo(a.dados));
      if (!v.ok) return { erro: { codigo: "INVALIDA", mensagem: v.erro } };
      if (!b.existe) return { erro: { codigo: "NAO_ENCONTRADA", mensagem: "Empresa não encontrada no Contábil Core." } };
      const d = v.valor;
      const c = { id: b.novoId(), empresa: "esta", nome: d.nome, bandeira: d.bandeira, ultimos_digitos: d.ultimosDigitos, dia_fechamento: d.diaFechamento,
        dia_vencimento: d.diaVencimento, limite: d.limite ? noBanco(d.limite) : null, ativo: true, apagado: false };
      b.tocar("cartoes", c);
      return fim(respostaDoCartao(c, d.limite ? str(d.limite) : null, { total_faturas: 0, fatura_aberta_valor: null }));
    }
    case "atualizar_cartao": {
      const c = b.cartao(a.cartao_id);
      if (!c) return r(CARTAO_NAO);
      const v = validarAtualizacaoDoCartao(camelo(a.dados));
      if (!v.ok) return { erro: { codigo: "INVALIDA", mensagem: v.erro } };
      const antes = JSON.stringify(c);
      if (v.valor.nome !== undefined) c.nome = v.valor.nome;
      if (v.valor.diaFechamento !== undefined) c.dia_fechamento = v.valor.diaFechamento;
      if (v.valor.diaVencimento !== undefined) c.dia_vencimento = v.valor.diaVencimento;
      if (v.valor.limite !== undefined) c.limite = noBanco(v.valor.limite);
      if (v.valor.ativo !== undefined) c.ativo = v.valor.ativo;
      if (JSON.stringify(c) !== antes) b.tocar("cartoes", c);
      return fim(respostaDoCartao(c, v.valor.limite !== undefined ? str(v.valor.limite) : c.limite, { total_faturas: 0, fatura_aberta_valor: null }));
    }
    case "remover_cartao": {
      const c = b.cartao(a.cartao_id);
      if (!c) return r(CARTAO_NAO);
      const dasFaturas = new Set(b.e.faturas.filter((f: any) => f.cartao_id === c.id).map((f: any) => f.id));
      const aplicada = b.e.distribuicoes.some((d: any) => dasFaturas.has(d.fatura_id) && d.aplicacao !== null);
      const abertas = b.e.faturas.filter((f: any) => f.cartao_id === c.id && ["aberta", "fechada"].includes(f.status) && !f.apagada).length;
      const recusa = conferirRemocaoDoCartao(aplicada, abertas);
      if (recusa) return r(recusa);
      c.apagado = true;
      b.tocar("cartoes", c);
      return fim(null);
    }
    case "listar_faturas": {
      const c = b.cartao(a.cartao_id);
      if (!c) return r(CARTAO_NAO);
      const fs = b.e.faturas.filter((f: any) => f.cartao_id === c.id && !f.apagada).sort((x: any, y: any) => (x.competencia < y.competencia ? 1 : -1));
      return fim({ total: fs.length, itens: fs.map((f: any) => respostaDaFatura(f, c, ...b.totais(f.id))) });
    }
    case "criar_fatura": {
      const c = b.cartao(a.cartao_id);
      if (!c) return r(CARTAO_NAO);
      const v = validarFatura(camelo(a.dados));
      if (!v.ok) return { erro: { codigo: "INVALIDA", mensagem: v.erro } };
      const d = v.valor;
      if (b.e.faturas.some((f: any) => f.cartao_id === c.id && f.competencia === d.competencia && !f.apagada)) {
        return { erro: { codigo: "CONFLITO", mensagem: `Já existe fatura para a competência ${d.competencia} neste cartão.` } };
      }
      const f = { id: b.novoId(), empresa: "esta", cartao_id: c.id, competencia: d.competencia, data_fechamento: dataDoInstante(d.dataFechamento),
        data_vencimento: dataDoInstante(d.dataVencimento), valor_total: "0.00", status: "aberta", transacao_id: null, observacao: d.observacao, apagada: false };
      b.tocar("faturas", f);
      return fim(respostaDaFatura(f, c, 0, dec("0")));
    }
    case "atualizar_fatura": {
      const achada = b.fatura(a.cartao_id, a.fatura_id);
      if (!achada) return r(FATURA_NAO);
      const { f, c } = achada;
      const v = validarAtualizacaoDaFatura(camelo(a.dados));
      if (!v.ok) return { erro: { codigo: "INVALIDA", mensagem: v.erro } };
      const recusa = conferirAtualizacaoDaFatura(f.status, v.valor.status);
      if (recusa) return r(recusa);
      const antes = JSON.stringify(f);
      if (v.valor.status !== null) f.status = v.valor.status;
      if (v.valor.dataVencimento !== null) f.data_vencimento = dataDoInstante(v.valor.dataVencimento);
      if (v.valor.observacao !== null) f.observacao = v.valor.observacao;
      if (JSON.stringify(f) !== antes) b.tocar("faturas", f);
      return fim(respostaDaFatura(f, c, ...b.totais(f.id)));
    }
    case "associar_transacao": {
      const achada = b.fatura(a.cartao_id, a.fatura_id);
      if (!achada) return r(FATURA_NAO);
      const { f, c } = achada;
      // A transação da empresa, mesmo desfeita (o original não olha o `deleted_at` aqui).
      const t = b.e.transacoes.find((x: any) => x.id === a.transacao_id && x.empresa === "esta") ?? null;
      const outra = b.e.faturas.some((x: any) => x.transacao_id === a.transacao_id && x.id !== f.id);
      const [total, valor] = b.totais(f.id);
      const recusa = conferirAssociacao({ transacaoId: f.transacao_id }, t ? { dc: t.dc, valor: dec(t.valor) } : null, outra, valor);
      if (recusa) return r(recusa);
      f.transacao_id = t.id;
      f.status = "paga";
      b.tocar("faturas", f);
      return fim(respostaDaFatura(f, c, total, valor));
    }
    case "desassociar_transacao": {
      const achada = b.fatura(a.cartao_id, a.fatura_id);
      if (!achada) return r(FATURA_NAO);
      const { f, c } = achada;
      const d = b.distribuicao(f.id);
      if (d && d.aplicacao) return { erro: { codigo: "CONFLITO", mensagem: "Desfaça a distribuição contábil antes de desvincular o pagamento." } };
      const antes = JSON.stringify(f);
      f.transacao_id = null;
      f.status = "fechada";
      if (JSON.stringify(f) !== antes) b.tocar("faturas", f);
      return fim(respostaDaFatura(f, c, ...b.totais(f.id)));
    }
    case "listar_lancamentos": {
      const achada = b.fatura(a.cartao_id, a.fatura_id);
      if (!achada) return r(FATURA_NAO);
      const vivos = b.lancamentosVivos(achada.f.id).map((l: any, k: number) => ({ l, k }))
        .sort((x: any, y: any) => new Date(x.l.data_compra).getTime() - new Date(y.l.data_compra).getTime() || x.k - y.k).map((x: any) => x.l);
      const total = vivos.reduce((s: Dec, l: any) => somaDec(s, valorMonetario(dec(l.valor))), dec("0.00"));
      return fim({ total: vivos.length, valor_total: str(total), itens: vivos.map((l: any) => respostaDoLancamento(l, dec(l.valor), l.data_compra)) });
    }
    case "adicionar_lancamento": {
      const v = validarLancamento(camelo(a.dados));
      const achada = b.fatura(a.cartao_id, a.fatura_id);
      if (!v.ok) return { erro: { codigo: "INVALIDA", mensagem: v.erro } };
      if (!achada) return r(FATURA_NAO);
      if (achada.f.status === "paga") return { erro: { codigo: "INVALIDA", mensagem: "Não é possível adicionar lançamentos a uma fatura paga." } };
      if (v.valor.contaId && !b.conta(v.valor.contaId)) return { erro: { codigo: "NAO_ENCONTRADA", mensagem: "Conta contábil não encontrada para esta empresa." } };
      const d = v.valor;
      const l = { id: b.novoId(), empresa: "esta", fatura_id: achada.f.id, data_compra: isoUtc(d.dataCompra), descricao: d.descricao, valor: noBanco(d.valor),
        conta_id: d.contaId, parcela_atual: d.parcelaAtual, parcela_total: d.parcelaTotal, apagado: false };
      b.tocar("lancamentos", l);
      return fim(respostaDoLancamento(l, d.valor, isoUtc(d.dataCompra)));
    }
    case "importar_csv":
    case "importar_lancamentos_pdf": {
      const achada = b.fatura(a.cartao_id, a.fatura_id);
      if (!achada) return r(FATURA_NAO);
      if (achada.f.status === "paga") return { erro: { codigo: "INVALIDA", mensagem: "Não é possível importar lançamentos em fatura paga." } };
      const daFatura = b.e.lancamentos.filter((l: any) => l.fatura_id === achada.f.id);
      const existentes = new Set<string>(daFatura.filter((l: any) => !l.apagado).map((l: any) => l.id));
      const removidos = new Set<string>(daFatura.filter((l: any) => l.apagado).map((l: any) => l.id));
      let res;
      if (tipo === "importar_csv") {
        const bytes = a.conteudo_b64 !== undefined ? Buffer.from(a.conteudo_b64, "base64") : Buffer.from(a.conteudo, "utf8");
        const textoDoArquivo = new TextDecoder("utf-8").decode(bytes).replace(/^﻿/, "");
        try {
          res = importarLinhasDoCsv(linhasDoCsv(textoDoArquivo), achada.f.id, existentes, removidos);
        } catch (e) {
          if (e instanceof CsvInvalido) return { erro: { codigo: "INVALIDA", mensagem: e.message } };
          throw e;
        }
      } else res = importarLancamentosDoPdf(a.lancamentos.map((x: any) => camelo(x)), achada.f.id, existentes, removidos);
      for (const n of res.novos) {
        b.tocar("lancamentos", { id: n.id, empresa: "esta", fatura_id: achada.f.id, data_compra: isoUtc(n.dataCompra), descricao: n.descricao,
          valor: noBanco(n.valor), conta_id: null, parcela_atual: n.parcelaAtual, parcela_total: n.parcelaTotal, apagado: false });
      }
      return fim({ importados: res.importados, duplicados: res.duplicados, erros: res.erros });
    }
    case "remover_lancamento": {
      const achada = b.fatura(a.cartao_id, a.fatura_id);
      if (!achada) return r(FATURA_NAO);
      if (achada.f.status === "paga") return { erro: { codigo: "INVALIDA", mensagem: "Não é possível remover lançamentos de uma fatura paga." } };
      const l = b.e.lancamentos.find((x: any) => x.id === a.lancamento_id && x.fatura_id === achada.f.id && !x.apagado);
      if (!l) return { erro: { codigo: "NAO_ENCONTRADA", mensagem: "Lançamento não encontrado." } };
      l.apagado = true;
      b.tocar("lancamentos", l);
      return fim(null);
    }
    case "obter": {
      const achada = b.fatura(a.cartao_id, a.fatura_id);
      if (!achada) return r(FATURA_NAO);
      return fim(obter(b, achada.f));
    }
    case "salvar": {
      const achada = b.fatura(a.cartao_id, a.fatura_id);
      if (!achada) return r(FATURA_NAO);
      const v = validarSalvarDistribuicao({ versao: a.versao, distribuicoes: a.distribuicoes });
      if (!v.ok) return { erro: { codigo: "INVALIDA", mensagem: v.erro } };
      const d = estadoDe(b, achada.f.id, true);
      const conf = conferirSalvar(comoEstado(d), gastos(b, achada.f.id), v.valor.distribuicoes);
      if ("ok" in conf) return r(conf);
      if ([...conf.contas].some((id) => !b.conta(id, true))) return { erro: { codigo: "INVALIDA", mensagem: CONTAS_INVALIDAS } };
      const av = avancar(b, d, v.valor.versao);
      if (av) return r(av);
      d.distribuicoes = v.valor.distribuicoes;
      b.tocar("distribuicoes", d);
      return fim(obter(b, achada.f));
    }
    case "aplicar": {
      const achada = b.fatura(a.cartao_id, a.fatura_id);
      if (!achada) return r(FATURA_NAO);
      const v = validarAplicarDistribuicao({ versao: a.versao, classificacaoHash: a.classificacao_hash, motivo: a.motivo });
      if (!v.ok) return { erro: { codigo: "INVALIDA", mensagem: v.erro } };
      const d = estadoDe(b, achada.f.id, true);
      const pagamento = pagamentoDe(b, achada.f);
      const hash = pagamento ? hashDaClassificacao(partidasDe(b, pagamento.id), pagamento) : "";
      const conf = conferirAplicar(comoEstado(d), gastos(b, achada.f.id), achada.f.competencia, pagamento, hash, v.valor.classificacaoHash);
      if ("ok" in conf) return r(conf);
      if (conf.componentes.some((c) => !b.conta(c.contaId, true))) return { erro: { codigo: "INVALIDA", mensagem: "Uma conta da distribuição não está mais disponível." } };
      const av = avancar(b, d, v.valor.versao);
      if (av) return r(av);
      const neo: any[] = [];
      if (pagamento!.status !== "processada") {
        if (partidasDe(b, pagamento!.id).length) return { erro: { codigo: "CONFLITO", mensagem: "Pagamento pendente com partidas vigentes: revise no NEO." } };
        neo.push({ classificar_lote: { conta_id: conf.componentes[0].contaId, descricao: pagamento!.historico } });
      }
      neo.push({ alterar_composicao: conf.componentes.map((c) => ({ conta_id: c.contaId, valor: str(c.valor), historico: c.historico })), motivo: v.valor.motivo });
      return { resposta: { versao: d.versao, antesNulo: pagamento!.status !== "processada" }, neo };
    }
    case "desfazer": {
      const achada = b.fatura(a.cartao_id, a.fatura_id);
      if (!achada) return r(FATURA_NAO);
      const v = validarDesfazerDistribuicao({ versao: a.versao, motivo: a.motivo, preservarClassificacaoAtual: a.preservar_atual });
      if (!v.ok) return { erro: { codigo: "INVALIDA", mensagem: v.erro } };
      const d = estadoDe(b, achada.f.id, true);
      const pagamento = pagamentoDe(b, achada.f);
      const hash = hashDaClassificacao(partidasDe(b, achada.f.transacao_id), pagamento);
      const conf = conferirDesfazer(comoEstado(d), hash, v.valor.preservarAtual);
      if ("ok" in conf) return r(conf);
      const av = avancar(b, d, v.valor.versao);
      if (av) return r(av);
      const neo: any[] = [];
      if (conf.restaurar && pagamento) {
        if (d.aplicacao.antes) {
          neo.push({ alterar_composicao: d.aplicacao.antes.componentes.map((c: any) => ({ conta_id: c.conta_id, valor: str(validarComponente(c).ok ? dec(c.valor) : dec("0")), historico: c.historico.trim() })), motivo: v.valor.motivo });
        } else neo.push({ cancelar_lancamento: { motivo: v.valor.motivo } });
      }
      d.aplicacao = null;
      return { resposta: { versao: d.versao }, neo, mudou: { distribuicoes: [d] } };
    }
    case "adicionar_documento": {
      const achada = b.fatura(a.cartao_id, a.fatura_id);
      if (!achada) return r(FATURA_NAO);
      const bytes = a.arquivo.b64 !== undefined ? Buffer.from(a.arquivo.b64, "base64") : null;
      const sha = bytes ? sha256(bytes) : sha256(encher(a.arquivo.tamanho, a.arquivo.pdf));
      const daFatura = b.e.documentos.filter((d: any) => d.fatura_id === achada.f.id);
      const recusa = conferirNovoDocumento({ pdf: a.arquivo.pdf, tamanho: a.arquivo.tamanho }, sha, daFatura.map((d: any) => ({ hashArquivo: d.hash_arquivo, tamanho: d.tamanho })));
      if (recusa) return r(recusa);
      const doc = { id: b.novoId(), empresa: "esta", fatura_id: achada.f.id, nome: nomeDoDocumento(a.nome), hash_arquivo: sha, tamanho: a.arquivo.tamanho,
        status: "processando", resultado: {}, erro: null };
      b.tocar("documentos", doc);
      return fim({ id: doc.id, nome: doc.nome, status: doc.status, hash_arquivo: sha });
    }
    case "documento": {
      const achada = b.fatura(a.cartao_id, a.fatura_id);
      if (!achada) return r(FATURA_NAO);
      const doc = b.e.documentos.find((d: any) => d.id === a.documento_id && d.fatura_id === achada.f.id && d.empresa === "esta");
      if (!doc) return { erro: { codigo: "NAO_ENCONTRADA", mensagem: "Documento não encontrado nesta fatura." } };
      return fim({ id: doc.id, nome: doc.nome, status: doc.status, hash_arquivo: doc.hash_arquivo });
    }
    case "confirmar_documento": {
      const achada = b.fatura(a.cartao_id, a.fatura_id);
      if (!achada) return r(FATURA_NAO);
      const v = validarConfirmacao(camelo(a.dados));
      if (!v.ok) return { erro: { codigo: "INVALIDA", mensagem: v.erro } };
      const doc = b.e.documentos.find((d: any) => d.id === a.documento_id && d.fatura_id === achada.f.id && d.empresa === "esta");
      if (!doc) return { erro: { codigo: "NAO_ENCONTRADA", mensagem: "Documento não encontrado nesta fatura." } };
      const d = estadoDe(b, achada.f.id, true);
      const atuais = gastos(b, achada.f.id);
      let conf;
      try {
        conf = conferirConfirmacao(doc, comoEstado(d), achada.f, v.valor, atuais.length > 0, (itens: ItemRevisado[], total: string) => validarItens(itens, total));
      } catch (e) {
        if (e instanceof RecusaDoDocumento) return { erro: { codigo: "INVALIDA", mensagem: e.message } };
        throw e;
      }
      if ("ok" in conf) return r(conf);
      if (conf.itens) {
        for (const g of atuais) {
          const l = b.e.lancamentos.find((x: any) => x.id === g.id);
          l.apagado = true;
          b.tocar("lancamentos", l);
        }
        conf.itens.forEach((i, n) => {
          const l = { id: idDoGastoConfirmado(doc.id, v.valor.versao, n), empresa: "esta", fatura_id: achada.f.id, data_compra: `${i.data}T00:00:00+00:00`,
            descricao: i.descricao, valor: noBanco(dec(i.valor)), conta_id: null, parcela_atual: null, parcela_total: null, apagado: false };
          b.e.lancamentos.push(l);
          b.tocar("lancamentos", l);
        });
        d.distribuicoes = {};
        for (const outro of b.e.documentos) {
          if (outro.fatura_id === achada.f.id && outro.empresa === "esta" && outro.status === "principal" && outro.id !== doc.id) {
            outro.status = "complementar";
            b.tocar("documentos", outro);
          }
        }
      }
      d.versao = v.valor.versao + 1;
      b.tocar("distribuicoes", d);
      doc.status = v.valor.principal ? "principal" : "complementar";
      doc.resultado = { ...doc.resultado, revisao: revisaoGuardada(v.valor), revisado_por: USUARIO };
      b.tocar("documentos", doc);
      return fim(obter(b, achada.f));
    }
    case "processar": {
      const doc = b.e.documentos.find((d: any) => d.id === a.documento_id);
      if (doc.status !== "processando") return fim(null);
      const l = a.leitura;
      if (b.e.empresa && b.e.empresa.ativa === false) {
        doc.status = "falhou";
        doc.erro = "A empresa está inativa. Reative antes de processar documentos.";
      } else if (l.resultado !== undefined) {
        doc.status = "revisar";
        doc.resultado = l.resultado;
        doc.erro = null;
      } else {
        doc.status = "falhou";
        doc.erro = l.recusa !== undefined ? [...l.recusa].slice(0, 1000).join("") : "Falha na leitura. Utilize a composição ou tente novamente.";
      }
      b.tocar("documentos", doc);
      return fim(null);
    }
  }
  throw new Error(`tipo sem simulação: ${tipo}`);
}

const USUARIO = "a0000000-0000-0000-0000-00000000005e";

import { createHash } from "node:crypto";
const sha256 = (b: Uint8Array) => createHash("sha256").update(b).digest("hex");
const encher = (n: number, pdf: boolean) => {
  const b = Buffer.alloc(n);
  b.write(pdf ? "%PDF" : "XXXX", 0, "latin1");
  return b;
};

// ─── Comparação ─────────────────────────────────────────────────────────────

/** Tira os ids "<novoN>" (o porte numera do seu jeito) e as linhas que o porte não simula. */
function semNovos(v: any): any {
  if (typeof v === "string") return /^<novo\d+>$/.test(v) ? "<novo>" : v;
  if (Array.isArray(v)) return v.map(semNovos);
  if (v && typeof v === "object") return Object.fromEntries(Object.entries(v).map(([k, x]) => [/^<novo\d+>$/.test(k) ? "<novo>" : k, semNovos(x)]));
  return v;
}

function mudouComparavel(m: Record<string, any[]> | undefined, tabelas = ["cartoes", "faturas", "lancamentos", "distribuicoes", "documentos"]) {
  const s: Record<string, any[]> = {};
  for (const t of tabelas) if (m?.[t]?.length) s[t] = semNovos(m[t]).map((x: any) => {
    return sem(x, "ha_segundos");
  }).sort((x: any, y: any) => JSON.stringify(x).localeCompare(JSON.stringify(y)));
  return s;
}

const DO_DECIMAL = /^((?:Linha|Lançamento) \d+): \[<class 'decimal\.\w+'>\]$/;
const DO_PORTE = /^((?:Linha|Lançamento) \d+): (?:valor inválido \(não é um número finito\)\.|valor ilegível \(.*\)\.)$/;

const MSG_DO_NEO = [
  "Pagamento pendente com partidas vigentes: revise no NEO.",
  "A transação não possui classificação vigente.",
  "As partidas atuais não formam pares contábeis válidos.",
  "A classificação atual não fecha o valor do extrato.",
  "A composição atual tem contas bancárias divergentes.",
  "Transação bancária não encontrada.",
];

function conferirCaso(c: Caso) {
  const s = c.saida;
  // A empresa inexistente: o porte para antes, com "não encontrada".
  if (s.erro_do_banco === "empresa") {
    const p = simular(c.tipo, c.entrada);
    expect(p.erro?.codigo).toBe("NAO_ENCONTRADA");
    divergencias.empresaInexistente++;
    return;
  }
  const p = simular(c.tipo, c.entrada);
  if (s.erro_do_banco === "integridade") {
    // A compra removida e reimportada: o porte relata a linha.
    expect(p.resposta.erros.some((e: string) => e.endsWith(COMPRA_REMOVIDA))).toBe(true);
    divergencias.compraRemovida++;
    return;
  }
  if (typeof s.erro_do_banco === "string") {
    // Texto ou valor acima da coluna: recusa do esquema, ou erro da linha na importação.
    if (p.erro) expect(p.erro.mensagem).toMatch(/passa d[eo]/);
    else expect(p.resposta.erros.some((e: string) => e.endsWith(VALOR_ACIMA_DO_LIMITE) || e.endsWith(DESCRICAO_LONGA))).toBe(true);
    divergencias.alemDaColuna++;
    return;
  }
  if (s.erro_500) {
    expect(c.tipo).toBe("importar_csv");
    expect(p.erro?.codigo).toBe("INVALIDA");
    divergencias.csvInvalido++;
    return;
  }
  if (s.erro) {
    const codigo = ERROS[s.erro.tipo];
    if (p.erro?.mensagem === "O valor passa do limite aceito." && p.erro.mensagem !== s.erro.mensagem) {
      // O valor acima de `Decimal(15,2)` é recusado na validação, antes de a fatura ser lida; o original
      // recusava pela fatura paga (e, se não fosse paga, caía no erro 500 do PostgreSQL).
      divergencias.alemDaColuna++;
      return;
    }
    if (MSG_DO_NEO.includes(s.erro.mensagem) && !(p.erro && p.erro.mensagem === s.erro.mensagem)) {
      // Recusa que vem de dentro do NEO (a composição vigente, o lote): o porte chega até lá sem recusa.
      expect(p.erro).toBeUndefined();
      etapaDoNeo.recusas++;
      return;
    }
    if (s.neo?.some((x: any) => x.classificar_lote?.bloqueadas?.length)) {
      expect(p.erro).toBeUndefined();
      expect(p.neo?.[0]?.classificar_lote).toBeTruthy();
      etapaDoNeo.recusas++;
      return;
    }
    expect(p.erro, `${c.tipo} #${c.id}`).toEqual({ codigo, mensagem: s.erro.mensagem });
    return;
  }
  expect(p.erro, `${c.tipo} #${c.id}: ${JSON.stringify(p.erro)}`).toBeUndefined();
  if (c.tipo === "aplicar") {
    expect(s.resposta.versao).toBe(p.resposta.versao);
    expect(s.resposta.aplicacao).toBe("APLICADA");
    expect(s.hash_confere).toBe(true);
    const aplicacao = s.mudou.distribuicoes[0].aplicacao;
    expect(aplicacao.antes === null).toBe(p.resposta.antesNulo);
    const lote = s.neo.find((x: any) => x.classificar_lote);
    const pedido = p.neo!.find((x: any) => x.classificar_lote);
    expect(!!lote).toBe(!!pedido);
    if (lote) expect({ conta_id: lote.classificar_lote.conta_id, descricao: lote.classificar_lote.descricao }).toEqual(pedido.classificar_lote);
    expect(s.neo.find((x: any) => x.alterar_composicao)).toEqual(p.neo!.find((x: any) => x.alterar_composicao));
    return;
  }
  if (c.tipo === "desfazer") {
    expect(s.resposta.versao).toBe(p.resposta.versao);
    expect(s.resposta.aplicacao).toBeNull();
    const deles = (s.neo ?? []).map((x: any) => (x.cancelar_lancamento ? { cancelar_lancamento: { motivo: x.cancelar_lancamento.motivo } } : x));
    expect(deles).toEqual(p.neo);
    return;
  }
  if (c.tipo === "importar_csv" || c.tipo === "importar_lancamentos_pdf") {
    // A exceção crua do `decimal` na linha (`[<class 'decimal.InvalidOperation'>]`) vira frase no porte.
    const deles = s.resposta.erros.map((e: string) => e.replace(DO_DECIMAL, "$1: <decimal>"));
    const nossos = p.resposta.erros.map((e: string) => e.replace(DO_PORTE, "$1: <decimal>"));
    divergencias.excecaoDoDecimal += deles.filter((e: string) => e.endsWith("<decimal>")).length;
    expect({ ...p.resposta, erros: nossos }, `${c.tipo} #${c.id}`).toEqual({ ...s.resposta, erros: deles });
    expect(mudouComparavel(p.mudou), `${c.tipo} #${c.id}`).toEqual(mudouComparavel(s.mudou));
    return;
  }
  expect(semNovos(p.resposta), `${c.tipo} #${c.id}`).toEqual(semNovos(s.resposta));
  expect(mudouComparavel(p.mudou), `${c.tipo} #${c.id}`).toEqual(mudouComparavel(s.mudou));
}

const METODOS = [
  "listar_cartoes", "criar_cartao", "atualizar_cartao", "remover_cartao", "listar_faturas", "criar_fatura", "atualizar_fatura", "associar_transacao",
  "desassociar_transacao", "listar_lancamentos", "adicionar_lancamento", "importar_csv", "importar_lancamentos_pdf", "remover_lancamento", "obter",
  "salvar", "aplicar", "desfazer", "adicionar_documento", "documento", "confirmar_documento", "processar",
];

describe("gabarito do serviço dos cartões: as chamadas do serviço", () => {
  for (const tipo of METODOS) {
    test(`${tipo}: ${doTipo(tipo).length} casos iguais ao original`, () => {
      expect(doTipo(tipo).length).toBeGreaterThan(0);
      for (const c of doTipo(tipo)) {
        if (!process.env.GABARITO_DEPURAR) conferirCaso(c);
        else
          try {
            conferirCaso(c);
          } catch (e) {
            console.log(`#${c.id} ${c.tipo}: ${(e as Error).message}\n  porte: ${JSON.stringify(simular(c.tipo, c.entrada)).slice(0, 700)}\n  original: ${JSON.stringify(c.saida).slice(0, 700)}`);
          }
      }
    });
  }
});

// ─── As chamadas diretas ────────────────────────────────────────────────────

/** A recusa do porte para um esquema que o pydantic recusou (qualquer frase) ou aceitou (os mesmos valores). */
function conferirEsquema(c: Caso, v: { ok: boolean; valor?: any; erro?: string }, comparar: (ok: any, valor: any) => void, aceitoSoNoOriginal: (e: any) => boolean = () => false) {
  if (c.saida.erro_500) {
    expect(v.ok).toBe(false);
    divergencias.excecaoDoValidador++;
    return;
  }
  if (c.saida.pydantic) {
    expect(v.ok, `${c.tipo} ${JSON.stringify(c.entrada)}`).toBe(false);
    return;
  }
  if (!v.ok && aceitoSoNoOriginal(c.entrada)) {
    divergencias.esquema++;
    return;
  }
  expect(v.ok, `${c.tipo} ${JSON.stringify(c.entrada)}: ${v.erro}`).toBe(true);
  comparar(c.saida.ok, v.valor);
}

const dinheiroDoDump = (s: string | null, d: Dec | null) => expect(d === null ? null : texto(d)).toBe(s);
const passaDoBancoTexto = (s: unknown) => typeof s === "string" && /^\d{14,}/.test(s.replace(/^-/, ""));

describe("gabarito do serviço dos cartões: os esquemas", () => {
  test("CartaoCreate", () => {
    for (const c of doTipo("esquema_cartao")) {
      conferirEsquema(c, validarCartao(camelo(c.entrada)), (ok, v) => {
        expect([v.nome, v.bandeira, v.ultimosDigitos, v.diaFechamento, v.diaVencimento]).toEqual([ok.nome, ok.bandeira, ok.ultimos_digitos, ok.dia_fechamento, ok.dia_vencimento]);
        dinheiroDoDump(ok.limite, v.limite);
        // O pydantic aceita `true` como o dia 1; o porte recusa o booleano.
      }, (e) => passaDoBancoTexto(e.limite) || typeof e.dia_fechamento === "boolean");
    }
  });
  test("CartaoUpdate", () => {
    for (const c of doTipo("esquema_cartao_atualizar")) {
      conferirEsquema(c, validarAtualizacaoDoCartao(camelo(c.entrada)), (ok, v) => {
        expect(v.nome ?? null).toBe(ok.nome);
        expect(v.diaFechamento ?? null).toBe(ok.dia_fechamento);
        expect(v.diaVencimento ?? null).toBe(ok.dia_vencimento);
        expect(v.ativo ?? null).toBe(ok.ativo);
        dinheiroDoDump(ok.limite, v.limite ?? null);
      });
    }
  });
  test("FaturaCreate e FaturaUpdate", () => {
    for (const c of doTipo("esquema_fatura")) {
      conferirEsquema(c, validarFatura(camelo(c.entrada)), (ok, v) => {
        expect([v.competencia, dataDoInstante(v.dataFechamento), dataDoInstante(v.dataVencimento), v.observacao]).toEqual([ok.competencia, ok.data_fechamento, ok.data_vencimento, ok.observacao]);
      });
    }
    for (const c of doTipo("esquema_fatura_atualizar")) {
      conferirEsquema(c, validarAtualizacaoDaFatura(camelo(c.entrada)), (ok, v) => {
        expect([v.status, dataDoInstante(v.dataVencimento), v.observacao]).toEqual([ok.status, ok.data_vencimento, ok.observacao]);
      });
    }
    for (const c of doTipo("competencia")) {
      const v = lerCompetencia(c.entrada);
      if (c.saida.ok !== undefined) expect(v).toEqual({ ok: true, valor: c.saida.ok });
      else expect(v).toEqual({ ok: false, erro: c.saida.erro });
    }
  });
  test("LancamentoCreate", () => {
    for (const c of doTipo("esquema_lancamento")) {
      conferirEsquema(c, validarLancamento(camelo(c.entrada)), (ok, v) => {
        expect([dataDoInstante(v.dataCompra), v.descricao, texto(v.valor), v.contaId, v.parcelaAtual, v.parcelaTotal]).toEqual([
          ok.data_compra, ok.descricao, ok.valor, ok.conta_id, ok.parcela_atual, ok.parcela_total,
        ]);
      }, (e) => passaDoBancoTexto(String(e.valor).replace("1E+20", "100000000000000000000")));
    }
  });
  test("a distribuição e a confirmação do documento", () => {
    for (const c of doTipo("esquema_salvar")) {
      conferirEsquema(c, validarSalvarDistribuicao(c.entrada), (ok, v) => {
        expect(v.versao).toBe(ok.versao);
        expect(v.distribuicoes).toEqual(ok.distribuicoes);
      });
    }
    for (const c of doTipo("esquema_aplicar")) {
      conferirEsquema(c, validarAplicarDistribuicao(camelo(c.entrada)), (ok, v) => {
        expect([v.versao, v.classificacaoHash, v.motivo]).toEqual([ok.versao, ok.classificacao_hash, ok.motivo]);
      });
    }
    for (const c of doTipo("esquema_desfazer")) {
      conferirEsquema(c, validarDesfazerDistribuicao(camelo(c.entrada)), (ok, v) => {
        expect([v.versao, v.motivo, v.preservarAtual]).toEqual([ok.versao, ok.motivo, ok.preservar_classificacao_atual]);
      });
    }
    for (const c of doTipo("esquema_confirmar")) {
      conferirEsquema(c, validarConfirmacao(camelo(c.entrada)), (ok, v) => expect(revisaoGuardada(v)).toEqual(ok));
    }
  });
});

describe("gabarito do serviço dos cartões: identidade, CSV e hash", () => {
  test("_identificador_compra e uuid5", () => {
    for (const c of doTipo("identificador")) {
      const e = c.entrada;
      const id = identificadorDaCompra(new Map(Object.entries(e.linha)), new Date(e.data), e.descricao, dec(e.valor));
      expect(id).toBe(c.saida.identificador);
      expect(uuid5(e.fatura_id, id)).toBe(c.saida.id);
    }
    for (const c of doTipo("uuid5")) expect(uuid5(c.entrada.namespace, c.entrada.nome)).toBe(c.saida.id);
  });
  test("_parse_data e _parse_valor do serviço", () => {
    for (const c of doTipo("data_do_csv")) {
      const d = lerDataDoCsv(c.entrada);
      expect(d === null ? null : isoUtc(d), c.entrada).toBe(c.saida.ok ?? null);
    }
    for (const c of doTipo("valor_do_csv")) {
      const t = textoDoValorDoCsv(c.entrada);
      expect(t).toBe(c.saida.texto);
      const d = decimal(t);
      if (c.saida.erro) expect(d).toBeNull();
      else if (d === NAO_FINITO) expect(naoFinito(t) === "nan" ? "NaN" : "Infinity").toBe(c.saida.ok);
      else expect(d === null ? null : texto(d)).toBe(c.saida.ok);
    }
  });
  test("csv.DictReader", () => {
    for (const c of doTipo("csv")) {
      let linhas: any[] | null = null;
      let erro: string | null = null;
      try {
        const regs = lerCsv(c.entrada);
        linhas = [];
        if (regs.length) {
          const cab = regs[0];
          for (const reg of regs.slice(1)) {
            if (!reg.length) continue;
            const d: Record<string, any> = {};
            cab.forEach((k, i) => (d[k] = i < reg.length ? reg[i] : null));
            if (reg.length > cab.length) d["<None>"] = reg.slice(cab.length);
            linhas.push(d);
          }
        }
      } catch (e) {
        if (!(e instanceof CsvInvalido)) throw e;
        erro = e.message;
      }
      if (c.saida.erro) expect(erro, JSON.stringify(c.entrada)).not.toBeNull();
      else expect(linhas, JSON.stringify(c.entrada)).toEqual(c.saida.linhas);
    }
  });
  test("o hash da classificação bancária, byte a byte", () => {
    for (const c of doTipo("hash")) {
      const p = c.entrada.pagamento;
      const pagamento = p ? { id: p.id, valor: dec(p.valor), data: p.data, dc: p.dc, status: p.status, agenciaId: p.agencia_id, historico: "" } : null;
      const partidas = c.entrada.partidas.map((x: any) => ({ id: x.id, contaId: x.conta_id, valor: dec(x.valor), historico: x.historico, dc: x.dc }));
      expect(hashDaClassificacao(partidas, pagamento)).toBe(c.saida.hash);
    }
  });
  test("leitura_expirada", () => {
    for (const c of doTipo("leitura_expirada")) {
      const agora = new Date();
      expect(leituraExpirada({ status: c.entrada.status, atualizadoEm: new Date(agora.getTime() - c.entrada.ha_segundos * 1000) }, agora)).toBe(c.saida.expirada);
    }
  });
});

describe("o que o porte faz diferente, de propósito", () => {
  test("as frases no lugar das exceções do decimal", () => {
    const r1 = importarLinhasDoCsv(linhasDoCsv("data_compra,descricao,valor\n05/03/2026,A,NaN\n05/03/2026,B,abc\n05/03/2026,C,Infinity\n"), "a0000000-0000-1000-8000-000000000001", new Set());
    expect(r1.erros).toEqual([`Linha 2: ${VALOR_NAO_FINITO}`, `Linha 3: ${VALOR_ILEGIVEL_NA_LINHA("abc")}`, `Linha 4: ${VALOR_NAO_FINITO}`]);
    expect(r1.erros.every((e) => DO_PORTE.test(e))).toBe(true);
    expect(guardado({ contaId: "c", historico: "h", valor: dec("1.50") }) satisfies ComponenteGuardado).toEqual({ conta_id: "c", historico: "h", valor: "1.50" });
  });
});

afterAll(() => {
  // Uma vez só, com os números da última geração do gabarito.
  if (process.env.GABARITO_DEPURAR) console.log(JSON.stringify({ divergencias, etapaDoNeo }));
  expect(divergencias).toEqual(DIVERGENCIAS_ESPERADAS);
  expect(etapaDoNeo.recusas).toBe(RECUSAS_DO_NEO);
});

const DIVERGENCIAS_ESPERADAS = {
  alemDaColuna: 11,
  empresaInexistente: 1,
  excecaoDoDecimal: 7,
  csvInvalido: 3,
  compraRemovida: 2,
  excecaoDoValidador: 1,
  esquema: 3,
};
/** Recusas que nascem dentro do NEO (a composição vigente inválida, o lote bloqueado): conferidas no ensaio. */
const RECUSAS_DO_NEO = 2;
