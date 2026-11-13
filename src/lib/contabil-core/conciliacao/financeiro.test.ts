// Testes-gabarito da conferência do financeiro (porte das partes puras de `FinanceiroService`,
// `src/domain/conciliacao_bancaria/financeiro.py`, 12/11/2026).
//
// `gabarito/financeiro-servico-*.json` foi gerado por `scripts/contabil-core/gabarito_financeiro_servico.py`:
// as chamadas de `criar`, `adicionar_documento`, `vincular` e `vincular_sugestoes` feitas pela suíte de
// integração do original, os casos inventados para cada ramo e as chamadas diretas de `_nome`,
// `_valor`, `_banco_compativel` e dos validadores pydantic. Cada caso traz a entrada (o que o serviço
// leu do banco, o que recebeu, o que os leitores devolveram, as sugestões e os ids que gerou) e a saída
// exata. Se um gabarito falhar, o porte está errado, e não o gabarito.

import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, test } from "vitest";
import { dec, texto } from "../motor/decimal";
import {
  desfazerVinculoFinanceiroSchema,
  novaAnaliseSchema,
  novoVinculoFinanceiroSchema,
  sugestoesEmLoteSchema,
} from "../entradasFinanceiro";
import {
  ANALISE_MUDOU,
  analiseParaTela,
  antesDaLeitura,
  AVISO_EXTRATO_ALTERADO,
  bancoCompativel,
  conferirDesfazer,
  conferirOriginal,
  criacaoDaAnalise,
  dadosDoVinculoCriado,
  incorporarDocumento,
  LIMITES_DO_FINANCEIRO,
  mediaTypeDoNome,
  nomeDoArquivo,
  ordemComoOExtrato,
  sugestoesParaTela,
  sugestoesParaValidar,
  validarLote,
  validarVinculo,
  valorDaConferencia,
  VERSAO_DESATUALIZADA,
  type LeituraDoDocumento,
  type LimitesDoFinanceiro,
  type RecusaFinanceiro,
  type ResultadoFinanceiro,
  type SnapshotFinanceiroPy,
  type SugestoesPy,
  type VinculoValidado,
} from "./financeiro";
import type { CodigoErroFinanceiro, LinhaFinanceiro, TipoComparacao } from "./financeiroTipos";
import type { RazaoConta } from "./razaoTipos";
import type { TransacaoDaRevisao } from "./revisao";

// ─── O gabarito ─────────────────────────────────────────────────────────────

type ErroPy = { tipo: string; codigo: string; mensagem: string };
type Caso = { id: number; tipo: string; origem: "suite" | "inventado" | "direto"; entrada: any; saida: any }; // eslint-disable-line @typescript-eslint/no-explicit-any

const PASTA = path.join(__dirname, "gabarito");
const casos: Caso[] = readdirSync(PASTA)
  .filter((n) => /^financeiro-servico-\d+\.json$/.test(n))
  .flatMap((n) => JSON.parse(readFileSync(path.join(PASTA, n), "utf8")) as Caso[]);
const doTipo = (tipo: string) => casos.filter((c) => c.tipo === tipo);

/** O erro do original → a recusa do porte (os códigos que a tela trata). */
function recusaDoPython(e: ErroPy): RecusaFinanceiro {
  let codigo: CodigoErroFinanceiro | undefined;
  if (e.tipo === "NotFoundError") codigo = "NAO_ENCONTRADA";
  else if (e.tipo === "ConflictError") {
    if (e.mensagem === ANALISE_MUDOU || e.mensagem === VERSAO_DESATUALIZADA) codigo = "VERSAO_DESATUALIZADA";
    else if (e.mensagem.startsWith("O extrato mudou.")) codigo = "EXTRATO_ALTERADO";
    else codigo = "CONFLITO";
  } else if (e.codigo === "CONCILIACAO_CONFIRMAR_EMPRESA") codigo = "CONFIRMAR_EMPRESA";
  else if (e.codigo !== "VALIDATION_ERROR") throw new Error(`código sem tradução: ${e.codigo}`);
  return codigo ? { ok: false, erro: e.mensagem, codigo } : { ok: false, erro: e.mensagem };
}

/** Os ids que o original gerou, na mesma ordem. */
function fila(ids: string[]) {
  let i = 0;
  const proximo = () => {
    if (i >= ids.length) throw new Error("o porte gerou mais ids que o original");
    return ids[i++];
  };
  return { proximo, usados: () => i };
}

const MB = 1024 * 1024;
const limites = (l: { max_linhas: number; max_fontes: number; max_documentos_mb: number; max_snapshot_mb: number; max_valor: string }): LimitesDoFinanceiro => ({
  maxLinhas: l.max_linhas,
  maxFontes: l.max_fontes,
  maxDocumentosBytes: l.max_documentos_mb * MB,
  maxSnapshotBytes: l.max_snapshot_mb * MB,
  maxValor: dec(l.max_valor),
});

type TransacaoPy = {
  id: string; data: string; valor: string; dc: string; historico: string;
  saldo_apos: string | null; ordem: number | null; importacao_id: string | null; lote_em: string | null;
};
const transacao = (t: TransacaoPy): TransacaoDaRevisao => ({
  id: t.id,
  data: t.data,
  valor: dec(t.valor),
  dc: t.dc,
  historico: t.historico,
  saldoApos: t.saldo_apos === null ? null : dec(t.saldo_apos),
  ordem: t.ordem,
  importacaoId: t.importacao_id,
  loteEm: t.lote_em,
});

/** A `descricao` de `AgenciaBancaria`: sigla, agência, número e o dígito, se houver. */
const descricao = (a: { banco_sigla: string; agencia: string; numero: string; digito: string | null }) =>
  [a.banco_sigla, a.agencia, a.numero, ...(a.digito ? [a.digito] : [])].join(" ");

/* eslint-disable @typescript-eslint/no-explicit-any */
const linhaFin = (l: any): LinhaFinanceiro => ({
  data: l.data, valor: dec(l.valor), historico: l.historico, favorecido: l.favorecido, documento: l.documento, categoria: l.categoria,
  parcela: l.parcela, banco: l.banco, referencia: l.referencia, observacao: l.observacao, documentoFavorecido: l.documento_favorecido,
});

function razaoBanco(r: any): RazaoConta {
  return {
    empresa: r.empresa, cnpj: r.cnpj, periodoInicio: r.periodo_inicio, periodoFim: r.periodo_fim, contaCodigo: r.conta_codigo,
    contaClassificacao: r.conta_classificacao, contaDescricao: r.conta_descricao,
    lancamentos: (r.lancamentos as [string, string, string, string, string][]).map(([data, lote, historico, contrapartida, valor]) => ({
      data, lote, historico, contrapartida, valor: dec(valor),
    })),
    totalDebito: dec(r.total_debito), totalCredito: dec(r.total_credito),
  };
}

function leituraDoPython(tipo: string, d: any): LeituraDoDocumento {
  switch (tipo) {
    case "FINANCEIRO":
      return { tipo, documento: { linhas: d.linhas.map(linhaFin), banco: d.banco, avisos: d.avisos, cnpj: d.cnpj, titulosAbertos: d.titulos_abertos.map(linhaFin) } };
    case "SISPAG":
      return {
        tipo,
        sispag: {
          conta: d.conta, cnpj: d.cnpj,
          pagamentos: d.pagamentos.map((p: any) => ({ data: p.data, valor: dec(p.valor), tipo: p.tipo, favorecido: p.favorecido, documento: p.documento, efetuado: p.efetuado })),
        },
      };
    case "RAZAO":
      return { tipo, razao: razaoBanco(d) };
    case "EXTRATO_DETALHADO":
      return {
        tipo,
        extrato: {
          agencia: d.agencia, conta: d.conta, diasConferidos: d.dias_conferidos,
          movimentos: d.movimentos.map((m: any) => ({
            data: m.data, valor: dec(m.valor), lancamento: m.lancamento, razaoSocial: m.razao_social, documento: m.documento, linha: m.linha,
            resgateAplicacao: m.resgate_aplicacao,
          })),
        },
      };
  }
  throw new Error(tipo);
}

const camel = (k: string) => k.replace(/_([a-z])/g, (_, l: string) => l.toUpperCase());
function chavesEmCamel(v: unknown): unknown {
  if (Array.isArray(v)) return v.map(chavesEmCamel);
  if (v !== null && typeof v === "object") return Object.fromEntries(Object.entries(v).map(([k, x]) => [camel(k), chavesEmCamel(x)]));
  return v;
}

// ─── Os fluxos, na ordem do original ────────────────────────────────────────

/** `criar` depois das leituras. */
function criar(e: any, novoId: () => string) {
  return criacaoDaAnalise({ bancoSigla: e.agencia.banco_sigla, transacoes: (e.transacoes as TransacaoPy[]).map(transacao), novoId, limites: limites(e.limites) });
}

/** `adicionar_documento`: versão, nome, `validar_conteudo`, o original, o id da fonte, o leitor, a incorporação e a versão (`_avancar`). */
function documento(e: any, novoId: () => string): ResultadoFinanceiro<{ snapshot: SnapshotFinanceiroPy; linhas: number; fonteId: string; nome: string }> {
  if (e.versao !== e.analise.versao) return { ok: false, erro: ANALISE_MUDOU, codigo: "VERSAO_DESATUALIZADA" };
  const nome = nomeDoArquivo(e.nome_arquivo);
  const [validacao, lida] = e.leituras;
  if (validacao.erro) return { ok: false, erro: validacao.erro.mensagem };
  const l = limites(e.limites);
  const original = conferirOriginal({ jaExiste: e.hash_existe, tamanhoAtual: e.tamanho_atual, tamanho: e.tamanho, limites: l });
  if (original) return original;
  const fonteId = novoId();
  const antes = antesDaLeitura(e.tipo, e.agencia.banco_sigla);
  if (antes) return antes;
  if (lida.erro) return { ok: false, erro: lida.erro.mensagem };
  const a = e.agencia;
  const r = incorporarDocumento({
    analise: { periodoInicio: e.analise.periodo_inicio, periodoFim: e.analise.periodo_fim, snapshot: e.analise.snapshot },
    leitura: leituraDoPython(e.tipo, lida.ok),
    nome,
    agencia: { bancoSigla: a.banco_sigla, agencia: a.agencia, numero: a.numero, digito: a.digito, descricao: descricao(a), temContaContabil: a.tem_conta_contabil },
    contaContabil: a.conta_contabil && a.conta_contabil.da_empresa ? { codigo: a.conta_contabil.codigo, contaNumero: a.conta_contabil.conta_numero } : null,
    empresa: { cnpj: e.empresa.cnpj, razaoSocial: e.empresa.razao_social },
    confirmarEmpresa: e.confirmar_empresa,
    fonteId,
    novoId,
    limites: l,
  });
  if (!r.ok) return r;
  return { ok: true, valor: { ...r.valor, fonteId, nome } };
}

function sugestoesGravadas(e: any) {
  return (tipo: TipoComparacao): ResultadoFinanceiro<SugestoesPy> => {
    const s = e.sugestoes[tipo];
    if (!s) throw new Error(`o porte pediu sugestões de ${tipo}, que o original não pediu`);
    return s.erro ? recusaDoPython(s.erro) : { ok: true, valor: sugestoesParaValidar(s) };
  };
}

const contexto = (e: any) => ({
  snapshot: e.analise.snapshot,
  periodoInicio: e.analise.periodo_inicio,
  periodoFim: e.analise.periodo_fim,
  extratoValido: e.extrato_valido,
  vinculos: e.vinculos,
  sugestoesDoTipo: sugestoesGravadas(e),
  limites: limites(e.limites),
});

/** `vincular`: a validação e a versão (`_avancar`). */
function vinculo(e: any): ResultadoFinanceiro<VinculoValidado[]> {
  const dados = novoVinculoFinanceiroSchema.parse(chavesEmCamel(e.dados));
  const v = validarVinculo({ ...contexto(e), financeiroIds: dados.financeiroIds, comparacaoIds: dados.comparacaoIds, observacao: dados.observacao, sugestaoId: dados.sugestaoId, versao: dados.versao });
  if (!v.ok) return v;
  if (dados.versao !== e.analise.versao) return { ok: false, erro: VERSAO_DESATUALIZADA, codigo: "VERSAO_DESATUALIZADA" };
  return { ok: true, valor: [v.valor] };
}

/** `vincular_sugestoes`: o lote e a versão. */
function lote(e: any): ResultadoFinanceiro<VinculoValidado[]> {
  const dados = sugestoesEmLoteSchema.parse(chavesEmCamel(e.dados));
  const v = validarLote({ ...contexto(e), sugestoes: dados.sugestoes, observacao: dados.observacao, versao: dados.versao });
  if (!v.ok) return v;
  if (dados.versao !== e.analise.versao) return { ok: false, erro: VERSAO_DESATUALIZADA, codigo: "VERSAO_DESATUALIZADA" };
  return { ok: true, valor: v.valor.map((x) => x.validado) };
}
/* eslint-enable @typescript-eslint/no-explicit-any */

// ─── Testes ─────────────────────────────────────────────────────────────────

describe("gabarito da conferência do financeiro (saída do Python)", () => {
  test("o gabarito cobre a suíte, os ramos e as chamadas diretas", () => {
    for (const tipo of ["criar", "documento", "vinculo", "lote"]) {
      expect(doTipo(tipo).filter((c) => c.origem === "suite").length, tipo).toBeGreaterThanOrEqual(tipo === "lote" ? 2 : 10);
    }
    const frases = new Set(casos.filter((c) => c.saida?.erro?.mensagem).map((c) => (c.saida.erro as ErroPy).mensagem.slice(0, 30)));
    for (const comeco of [
      "A análise mudou. Atualize a te", "Este arquivo já foi adicionado", "Os originais excedem o limite ", "A consulta SISPAG é do Itaú. S",
      "O extrato detalhado lido é do ", "O relatório declara o banco IT", "A consulta do SISPAG é de outr", "A consulta do SISPAG é da cont",
      "O valor normalizado de um paga", "O razão não corresponde à cont", "O extrato detalhado é da agênc", "O documento enviado pertence a",
      "O arquivo não informa CNPJ do ", "Não há movimentos válidos para", "A análise excede o limite de l", "Os dados extraídos excedem o l",
      "Há valores inválidos ou acima ", "Um movimento de conferência de", "Selecione cada movimento uma ú", "Há movimentos que não pertence",
      "O painel base aceita linhas de", "Compare o financeiro com uma ú", "A sugestão mudou. Atualize a a", "O extrato mudou. Crie uma nova",
      "O extrato mudou. Crie uma anál", "Compare somente entradas com e", "Um movimento já foi vinculado ", "Justifique a diferença antes d",
      "Explique a relação entre movim", "Explique a relação com movimen", "Outra pessoa alterou esta anál", "Duas sugestões marcadas usam o",
    ]) {
      expect([...frases].some((f) => f.startsWith(comeco)), comeco).toBe(true);
    }
    for (const tipo of ["nome", "banco", "valor", "validacao"]) expect(doTipo(tipo).length, tipo).toBeGreaterThan(10);
  });

  test("_nome", () => {
    for (const c of doTipo("nome")) expect(nomeDoArquivo(c.entrada), `caso ${c.id}: ${JSON.stringify(c.entrada)}`).toBe(c.saida);
  });

  test("_banco_compativel", () => {
    for (const c of doTipo("banco")) expect(bancoCompativel(c.entrada[0], c.entrada[1]), `caso ${c.id}: ${c.entrada}`).toBe(c.saida);
  });

  test("_valor", () => {
    for (const c of doTipo("valor")) {
      let r: { ok: string } | { erro: string };
      try {
        r = { ok: texto(valorDaConferencia(dec(c.entrada))) };
      } catch (e) {
        r = { erro: (e as Error).message };
      }
      expect(r, `caso ${c.id}: ${c.entrada}`).toEqual(c.saida);
    }
  });

  test("criar: a mesma recusa, ou o mesmo snapshot, hash do extrato e auditoria", () => {
    for (const c of doTipo("criar")) {
      const ids = fila(c.entrada.ids);
      const r = criar(c.entrada, ids.proximo);
      const ctx = `caso ${c.id} (${c.origem})`;
      if (c.saida.erro) {
        expect(r, ctx).toEqual(recusaDoPython(c.saida.erro));
        continue;
      }
      expect(ids.usados(), ctx).toBe(c.entrada.ids.length);
      expect(r.ok, ctx).toBe(true);
      if (!r.ok) continue;
      expect(r.valor.snapshot, ctx).toEqual(c.saida.snapshot);
      expect(r.valor.extratoHash, ctx).toBe(c.saida.extrato_hash);
      expect(c.saida.conta_bancaria, ctx).toBe(descricao(c.entrada.agencia));
      expect(c.saida.auditoria, ctx).toEqual([{ acao: "financeiro.analise_criada", dados: { agencia_id: "<agencia>" } }]);
    }
    // O extrato que a criação leu do banco já estava na ordem do papel.
    for (const c of doTipo("criar").filter((x) => x.origem === "suite")) {
      const lidas = (c.entrada.transacoes as TransacaoPy[]).map(transacao);
      expect([...lidas].reverse().sort(ordemComoOExtrato).map((t) => t.id), `caso ${c.id}`).toEqual(lidas.map((t) => t.id));
    }
  });

  test("adicionar_documento: a mesma recusa, ou o mesmo snapshot, documento, versão e auditoria", () => {
    for (const c of doTipo("documento")) {
      const ids = fila(c.entrada.ids);
      const antes = structuredClone(c.entrada.analise.snapshot);
      const r = documento(c.entrada, ids.proximo);
      const ctx = `caso ${c.id} (${c.origem})`;
      expect(c.entrada.analise.snapshot, `${ctx}: o snapshot recebido não muda`).toEqual(antes);
      if (c.saida.erro) {
        expect(r, ctx).toEqual(recusaDoPython(c.saida.erro));
        continue;
      }
      expect(ids.usados(), ctx).toBe(c.entrada.ids.length);
      expect(r.ok, ctx).toBe(true);
      if (!r.ok) continue;
      expect(r.valor.snapshot, ctx).toEqual(c.saida.snapshot);
      expect(c.saida.versao, ctx).toBe(c.entrada.analise.versao + 1);
      expect(c.saida.documento, ctx).toEqual({
        id: r.valor.fonteId, nome_arquivo: r.valor.nome, tipo: c.entrada.tipo, hash: c.entrada.hash_arquivo,
        media_type: mediaTypeDoNome(r.valor.nome), tamanho: c.entrada.tamanho,
      });
      expect(c.saida.auditoria, ctx).toEqual([
        { acao: "financeiro.documento_adicionado", dados: { fonte_id: r.valor.fonteId, hash: c.entrada.hash_arquivo, tipo: c.entrada.tipo, linhas: r.valor.linhas } },
      ]);
    }
  });

  for (const [tipo, fluxo] of [["vinculo", vinculo], ["lote", lote]] as const) {
    test(`${tipo === "vinculo" ? "vincular" : "vincular_sugestoes"}: a mesma recusa, ou os mesmos vínculos, totais, diferença e auditoria`, () => {
      for (const c of doTipo(tipo)) {
        const r = fluxo(c.entrada);
        const ctx = `caso ${c.id} (${c.origem})`;
        if (c.saida.erro) {
          expect(r, ctx).toEqual(recusaDoPython(c.saida.erro));
          continue;
        }
        expect(r.ok, ctx).toBe(true);
        if (!r.ok) continue;
        const observacao = c.entrada.dados.observacao.trim();
        expect(
          r.valor.map((v) => ({
            tipo_comparacao: v.tipo,
            financeiro_ids: v.financeiroIds,
            comparacao_ids: v.comparacaoIds,
            total_financeiro: texto(v.totalFinanceiro),
            total_comparacao: texto(v.totalComparacao),
            diferenca: texto(v.diferenca),
            observacao,
            estado: "ATIVO",
          })),
          ctx,
        ).toEqual(c.saida.vinculos);
        expect(c.saida.versao, ctx).toBe(c.entrada.analise.versao + 1);
        const sugestoes: (string | null)[] = tipo === "vinculo" ? [c.entrada.dados.sugestao_id] : c.entrada.dados.sugestoes.map((s: { sugestao_id: string }) => s.sugestao_id);
        expect(c.saida.auditoria, ctx).toEqual(
          r.valor.map((v, i) => {
            const dados = dadosDoVinculoCriado("x", v, sugestoes[i]);
            delete dados.vinculo_id;
            return { acao: "financeiro.vinculo_criado", dados };
          }),
        );
      }
    });
  }

  test("validadores: aceita e normaliza o que o pydantic aceita, recusa o que ele recusa", () => {
    const schemas = { analise: novaAnaliseSchema, vinculo: novoVinculoFinanceiroSchema, lote: sugestoesEmLoteSchema, desfazer: desfazerVinculoFinanceiroSchema };
    for (const c of doTipo("validacao")) {
      const schema = schemas[c.entrada.modelo as keyof typeof schemas];
      const r = schema.safeParse(chavesEmCamel(c.entrada.payload));
      const ctx = `caso ${c.id}: ${JSON.stringify(c.entrada.payload).slice(0, 120)}`;
      if (c.saida.ok) {
        expect(r.success, ctx).toBe(true);
        expect(r.data, ctx).toEqual(chavesEmCamel(c.saida.ok));
      } else {
        expect(r.success, ctx).toBe(false);
        if (c.saida.erro && !r.success) expect(r.error.issues[0]?.message, ctx).toBe(c.saida.erro);
      }
    }
  });
});

describe("detalhes do porte", () => {
  test("desfazer: conferência de fora e conferência já desfeita", () => {
    expect(conferirDesfazer(null)).toEqual({ ok: false, erro: "Conferência não encontrada nesta análise.", codigo: "NAO_ENCONTRADA" });
    expect(conferirDesfazer({ estado: "DESFEITO" })).toEqual({ ok: false, erro: "Esta conferência já foi desfeita.", codigo: "CONFLITO" });
    expect(conferirDesfazer({ estado: "ATIVO" })).toBeNull();
  });

  test("o tipo de mídia sai da extensão do nome", () => {
    expect(mediaTypeDoNome("a.PDF")).toBe("application/pdf");
    expect(mediaTypeDoNome("a.b.xls")).toBe("application/vnd.ms-excel");
    expect(mediaTypeDoNome("xlsx")).toBe("application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    expect(mediaTypeDoNome("a.csv")).toBeNull();
    expect(mediaTypeDoNome("a.constructor")).toBeNull();
  });

  test("tipo de documento desconhecido é recusado antes de ler", () => {
    expect(antesDaLeitura("OUTRO", "ITAU")).toEqual({ ok: false, erro: "Tipo de documento não suportado." });
    expect(antesDaLeitura("FINANCEIRO", "SICOOB")).toBeNull();
  });

  test("obter: com o extrato alterado, o aviso a mais; o snapshot vira a forma da tela", () => {
    const c = doTipo("documento").find((x) => !x.saida.erro && x.entrada.tipo === "FINANCEIRO" && x.saida.snapshot.titulos_abertos?.length)
      ?? doTipo("documento").find((x) => !x.saida.erro)!;
    const snapshot = c.saida.snapshot as SnapshotFinanceiroPy;
    const resumo = {
      id: "a", agenciaId: "g", titulo: "Fevereiro", contaBancaria: "ITAU 1 2", periodoInicio: "2025-02-01", periodoFim: "2025-02-28",
      versao: 2, criadaEm: "2026-11-12T10:00:00.000Z", atualizadaEm: "2026-11-12T10:00:00.000Z",
    };
    const valida = analiseParaTela(resumo, snapshot, [], true);
    expect(valida.avisos).toEqual(snapshot.avisos);
    expect(valida.linhas.map((l) => [l.id, l.valor, l.tipoFonte, l.ordemFonte])).toEqual(snapshot.linhas.map((l) => [l.id, l.valor, l.tipo_fonte, l.ordem_fonte]));
    expect(valida.fontes.map((f) => [f.tipo, f.temOriginal])).toEqual(snapshot.fontes.map((f) => [f.tipo, f.tem_original]));
    expect(valida.titulosAbertos.length).toBe((snapshot.titulos_abertos ?? []).length);
    const historico = analiseParaTela(resumo, snapshot, [], false);
    expect(historico.avisos).toEqual([...snapshot.avisos, AVISO_EXTRATO_ALTERADO]);
    expect(historico.extratoValido).toBe(false);
  });

  test("as sugestões vão à tela em camelCase e voltam à validação com as chaves do original", () => {
    const envelope = { versao: 3, tipo_comparacao: "SISPAG", items: [{ id: "s1", financeiro_ids: ["a"], comparacao_ids: ["b"], criterio: "FAVORECIDO", ambigua: false }], avisos: ["x"] };
    const tela = sugestoesParaTela(envelope);
    expect(tela).toEqual({ versao: 3, tipoComparacao: "SISPAG", itens: [{ id: "s1", financeiroIds: ["a"], comparacaoIds: ["b"], criterio: "FAVORECIDO", ambigua: false }], avisos: ["x"] });
    expect(sugestoesParaValidar(envelope)).toEqual({ versao: 3, items: [{ id: "s1", financeiro_ids: ["a"], comparacao_ids: ["b"], criterio: "FAVORECIDO" }] });
    expect(sugestoesParaValidar(tela)).toEqual(sugestoesParaValidar(envelope));
  });

  test("os limites padrão são os do original", () => {
    expect(LIMITES_DO_FINANCEIRO.maxLinhas).toBe(20_000);
    expect(LIMITES_DO_FINANCEIRO.maxFontes).toBe(32);
    expect(LIMITES_DO_FINANCEIRO.maxDocumentosBytes).toBe(100 * MB);
    expect(LIMITES_DO_FINANCEIRO.maxSnapshotBytes).toBe(64 * MB);
  });

  test("a criação não aceita mais ids do que o original gerou", () => {
    const c = doTipo("criar").find((x) => !x.saida.erro && x.entrada.ids.length > 0)!;
    expect(() => criar(c.entrada, fila([]).proximo)).toThrow();
  });
});
