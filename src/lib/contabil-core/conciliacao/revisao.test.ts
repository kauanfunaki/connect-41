// Testes-gabarito da revisão manual da conciliação (porte das partes puras de `RevisaoService`,
// `src/domain/conciliacao_bancaria/revisao.py`, 12/11/2026).
//
// `gabarito/revisao-*.json` foi gerado por `scripts/contabil-core/gabarito_revisao.py`: as chamadas de
// `criar`, `adicionar_apoio` e `criar_vinculo` feitas pela suíte de integração do original, os casos
// inventados para cada ramo, as chamadas diretas de `_hash`, `_moeda`, `_identidade_linha` e
// `_evidencia_extrato`, a ordem do extrato e os validadores pydantic. Cada caso traz a entrada (o que
// o serviço leu do banco, o que recebeu e os ids que gerou) e a saída exata: o snapshot, os hashes,
// a auditoria ou a recusa. Se um gabarito falhar, o porte está errado, e não o gabarito.

import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, test } from "vitest";
import { dec, texto } from "../motor/decimal";
import { desfazerVinculoSchema, excluirRevisaoSchema, novoVinculoSchema, renomearRevisaoSchema, uuidCanonico } from "../entradasRevisao";
import { casosServico, relatorioDoGabarito } from "./gabarito/servicoConciliacao";
import type { RazaoApoio, RazaoConta } from "./razaoTipos";
import { relatorioDoJson, relatorioParaJson } from "./relatorio";
import {
  AVISO_FONTE_ALTERADA,
  conferirDesfazer,
  conferirEmpresa,
  conferirExtratoDaRevisao,
  conferirRazaoDoBanco,
  evidenciaDoExtrato,
  exigirFontes,
  hashesDaRevisao,
  hashJson,
  identidadeDaLinha,
  incorporarApoio,
  jsonDumps,
  moeda,
  ordemComoOExtrato,
  relatorioDoPython,
  relatorioParaPython,
  revisaoParaTela,
  snapshotDaRevisao,
  validarVinculo,
  VERSAO_DESATUALIZADA,
  type ItemVinculoPy,
  type JsonPy,
  type LimitesDaRevisao,
  type LinhaRazaoPy,
  type RecusaRevisao,
  type RelatorioPy,
  type ResultadoRevisao,
  type SnapshotPy,
  type TransacaoDaRevisao,
} from "./revisao";
import type { CodigoErroRevisao } from "./revisaoTipos";

// ─── O gabarito ─────────────────────────────────────────────────────────────

type ErroPy = { tipo: string; codigo: string; mensagem: string };
type Caso = { id: number; tipo: string; origem: "suite" | "inventado" | "direto"; entrada: any; saida: any }; // eslint-disable-line @typescript-eslint/no-explicit-any

const PASTA = path.join(__dirname, "gabarito");
const casos: Caso[] = readdirSync(PASTA)
  .filter((n) => /^revisao-\d+\.json$/.test(n))
  .flatMap((n) => JSON.parse(readFileSync(path.join(PASTA, n), "utf8")) as Caso[]);
const doTipo = (tipo: string) => casos.filter((c) => c.tipo === tipo);

/** O `code` do original → o código da tela. */
function codigoDoPython(e: ErroPy): CodigoErroRevisao | undefined {
  if (e.tipo === "NotFoundError") return "NAO_ENCONTRADA";
  const mapa: Record<string, CodigoErroRevisao | undefined> = {
    VALIDATION_ERROR: undefined,
    CONFLICT: "CONFLITO",
    CONCILIACAO_CONFIRMAR_EMPRESA: "CONFIRMAR_EMPRESA",
    CONCILIACAO_VERSAO_DESATUALIZADA: "VERSAO_DESATUALIZADA",
    CONCILIACAO_FONTE_ALTERADA: "FONTE_ALTERADA",
  };
  if (!(e.codigo in mapa)) throw new Error(`código sem tradução: ${e.codigo}`);
  return mapa[e.codigo];
}

function recusaDoPython(e: ErroPy): RecusaRevisao {
  const codigo = codigoDoPython(e);
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

const limites = (l: { max_linhas: number; max_fontes: number; max_valor: string }): LimitesDaRevisao => ({
  maxLinhas: l.max_linhas,
  maxFontes: l.max_fontes,
  maxValor: dec(l.max_valor),
});

const empresa = (e: { cnpj: string; razao_social: string }) => ({ cnpj: e.cnpj, razaoSocial: e.razao_social });

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

function razaoBanco(r: any): RazaoConta { // eslint-disable-line @typescript-eslint/no-explicit-any
  return {
    empresa: r.empresa,
    cnpj: r.cnpj,
    periodoInicio: r.periodo_inicio,
    periodoFim: r.periodo_fim,
    contaCodigo: r.conta_codigo,
    contaClassificacao: r.conta_classificacao,
    contaDescricao: r.conta_descricao,
    lancamentos: (r.lancamentos as [string, string, string, string, string][]).map(([data, lote, historico, contrapartida, valor]) => ({
      data, lote, historico, contrapartida, valor: dec(valor),
    })),
    totalDebito: dec(r.total_debito),
    totalCredito: dec(r.total_credito),
  };
}

function razaoApoio(r: any): RazaoApoio { // eslint-disable-line @typescript-eslint/no-explicit-any
  return {
    empresa: r.empresa,
    cnpj: r.cnpj,
    periodoInicio: r.periodo_inicio,
    periodoFim: r.periodo_fim,
    contas: [],
    linhas: (r.linhas as Record<string, string | null>[]).map((l) => ({
      data: l.data!,
      contaCodigo: l.conta_codigo!,
      contaClassificacao: l.conta_classificacao!,
      contaDescricao: l.conta_descricao!,
      lote: l.lote!,
      contrapartida: l.contrapartida!,
      historico: l.historico!,
      valorDebito: dec(l.valor_debito!),
      valorCredito: dec(l.valor_credito!),
      documento: l.documento,
      favorecido: l.favorecido,
    })),
  };
}

const camel = (k: string) => k.replace(/_([a-z])/g, (_, l: string) => l.toUpperCase());
function chavesEmCamel(v: unknown): unknown {
  if (Array.isArray(v)) return v.map(chavesEmCamel);
  if (v !== null && typeof v === "object") return Object.fromEntries(Object.entries(v).map(([k, x]) => [camel(k), chavesEmCamel(x)]));
  return v;
}

const ACAO: Record<string, string> = {
  "conciliacao.revisao_criada": "criada",
  "conciliacao.apoio_adicionado": "apoio",
  "conciliacao.vinculo_confirmado": "confirmado",
};

// ─── Os fluxos, na ordem do original ────────────────────────────────────────

/** `criar` sem as leituras: empresa, tamanho e valores, (conciliação), extrato, hashes e snapshot. */
function criar(e: any, novoId: () => string) { // eslint-disable-line @typescript-eslint/no-explicit-any
  const razao = razaoBanco(e.razao);
  const l = limites(e.limites);
  const transacoes = (e.transacoes as TransacaoPy[]).map(transacao);
  const recusa =
    conferirEmpresa(razao.cnpj, empresa(e.empresa), e.confirmar_empresa) ??
    conferirRazaoDoBanco(razao, l) ??
    conferirExtratoDaRevisao(razao, transacoes, l);
  if (recusa) return recusa;
  const hashes = hashesDaRevisao(e.hash_arquivo, e.hash_sispag, transacoes);
  return { ok: true as const, valor: { ...hashes, snapshot: snapshotDaRevisao(razao, e.nome_arquivo, transacoes, novoId) } };
}

/** `adicionar_apoio`: fontes, empresa, as conferências do apoio e a versão (`_avancar`). */
function apoio(e: any, novoId: () => string): ResultadoRevisao<{ snapshot: SnapshotPy; linhas: number; hash: string }> { // eslint-disable-line @typescript-eslint/no-explicit-any
  const razao = razaoApoio(e.razao);
  const recusa = exigirFontes(e.fontes_validas) ?? conferirEmpresa(razao.cnpj, empresa(e.empresa), e.confirmar_empresa);
  if (recusa) return recusa;
  const r = incorporarApoio({
    revisao: { periodoInicio: e.revisao.periodo_inicio, periodoFim: e.revisao.periodo_fim, snapshot: e.revisao.snapshot },
    razao,
    nomeArquivo: e.nome_arquivo,
    novoId,
    limites: limites(e.limites),
  });
  if (!r.ok) return r;
  if (e.versao !== e.revisao.versao) return { ok: false, erro: VERSAO_DESATUALIZADA, codigo: "VERSAO_DESATUALIZADA" };
  return r;
}

/** `criar_vinculo`: fontes e a validação (a versão já foi conferida antes de `_avancar`). */
function vinculo(e: any) { // eslint-disable-line @typescript-eslint/no-explicit-any
  const fontes = exigirFontes(e.fontes_validas);
  if (fontes) return fontes;
  const dados = novoVinculoSchema.parse(chavesEmCamel(e.dados));
  return validarVinculo({
    versaoAtual: e.revisao.versao,
    snapshot: e.revisao.snapshot,
    vinculos: e.vinculos,
    dados,
    limites: limites(e.limites),
  });
}

// ─── Testes ─────────────────────────────────────────────────────────────────

describe("gabarito da revisão (saída do Python)", () => {
  test("o gabarito cobre a suíte, os ramos e as chamadas diretas", () => {
    for (const tipo of ["criar", "apoio", "vinculo"]) {
      expect(doTipo(tipo).filter((c) => c.origem === "suite").length, tipo).toBeGreaterThanOrEqual(10);
    }
    const frases = new Set(casos.filter((c) => c.saida?.erro?.mensagem).map((c) => (c.saida.erro as ErroPy).mensagem.slice(0, 30)));
    for (const comeco of [
      "O razão enviado pertence a out", "O razão não informa CNPJ. Conf", "A revisão aceita até 1 arquivo", "Há valores acima do limite mon",
      "Este razão de apoio já está di", "O razão do banco já está nesta", "Há lançamentos idênticos em um", "O extrato de origem mudou. Abr",
      "Outra pessoa alterou esta revi", "A revisão foi alterada. Atuali", "Selecione cada lançamento uma ", "Há lançamentos que não perten",
      "Um lançamento selecionado já p", "Selecione entradas ou saídas b", "Use o razão do banco ou razões", "Selecione apenas débitos ou ap",
      "A natureza do razão do banco n", "Há uma linha sem valor na natu", "Os valores têm diferença. Regi",
    ]) {
      expect([...frases].some((f) => f.startsWith(comeco)), comeco).toBe(true);
    }
    for (const tipo of ["hash", "moeda", "identidade", "evidencia", "ordem", "validacao"]) expect(doTipo(tipo).length, tipo).toBeGreaterThan(20);
  });

  test("_hash: o mesmo texto do json.dumps e o mesmo SHA-256", () => {
    for (const c of doTipo("hash")) {
      expect(jsonDumps(c.entrada as JsonPy), `caso ${c.id}`).toBe(c.saida.texto);
      expect(hashJson(c.entrada as JsonPy), `caso ${c.id}`).toBe(c.saida.hash);
    }
  });

  test("_moeda", () => {
    for (const c of doTipo("moeda")) expect(moeda(dec(c.entrada)), `caso ${c.id}: ${c.entrada}`).toBe(c.saida);
  });

  test("_identidade_linha", () => {
    for (const c of doTipo("identidade")) {
      const identidade = identidadeDaLinha(c.entrada as LinhaRazaoPy);
      expect(identidade, `caso ${c.id}`).toEqual(c.saida.identidade);
      expect(hashJson(identidade), `caso ${c.id}`).toBe(c.saida.hash);
    }
  });

  test("_evidencia_extrato: em ordem de id, com o dinheiro em centavos", () => {
    for (const c of doTipo("evidencia")) {
      const evidencia = evidenciaDoExtrato((c.entrada as TransacaoPy[]).map(transacao));
      expect(evidencia, `caso ${c.id}`).toEqual(c.saida.evidencia);
      expect(hashJson(evidencia), `caso ${c.id}`).toBe(c.saida.hash);
    }
  });

  test("ordenar_como_o_extrato: data, lote (sem lote primeiro), ordem (vazia por último) e id", () => {
    for (const c of doTipo("ordem")) {
      const ordenadas = (c.entrada.transacoes as TransacaoPy[]).map(transacao).sort(ordemComoOExtrato);
      expect(ordenadas.map((t) => t.id), `caso ${c.id}`).toEqual(c.saida.ids);
    }
    // O extrato que a criação leu do banco já estava nessa ordem.
    for (const c of doTipo("criar")) {
      const lidas = (c.entrada.transacoes as TransacaoPy[]).map(transacao);
      expect([...lidas].reverse().sort(ordemComoOExtrato).map((t) => t.id), `caso ${c.id}`).toEqual(lidas.map((t) => t.id));
    }
  });

  test("criar: a mesma recusa, ou os mesmos hashes, snapshot e auditoria", () => {
    for (const c of doTipo("criar")) {
      const ids = fila(c.entrada.ids);
      const r = criar(c.entrada, ids.proximo);
      const contexto = `caso ${c.id} (${c.origem})`;
      expect(ids.usados(), contexto).toBe(c.entrada.ids.length);
      if (c.saida.erro) {
        expect(r, contexto).toEqual(recusaDoPython(c.saida.erro));
        continue;
      }
      expect(r.ok, contexto).toBe(true);
      if (!r.ok) continue;
      expect(r.valor.snapshot, contexto).toEqual(c.saida.snapshot);
      expect(r.valor.extratoHash, contexto).toBe(c.saida.extrato_hash);
      expect(r.valor.revisaoHash, contexto).toBe(c.saida.revisao_hash);
      expect([...c.entrada.nome_arquivo].slice(0, 255).join(""), contexto).toBe(c.saida.nome_arquivo);
      expect(c.saida.auditoria, contexto).toEqual([{ acao: "conciliacao.revisao_criada", dados: { arquivo: c.entrada.nome_arquivo, hash: r.valor.revisaoHash } }]);
    }
  });

  test("adicionar_apoio: a mesma recusa, ou o mesmo snapshot, versão e auditoria", () => {
    for (const c of doTipo("apoio")) {
      const ids = fila(c.entrada.ids);
      const antes = structuredClone(c.entrada.revisao.snapshot);
      const r = apoio(c.entrada, ids.proximo);
      const contexto = `caso ${c.id} (${c.origem})`;
      expect(ids.usados(), contexto).toBe(c.entrada.ids.length);
      expect(c.entrada.revisao.snapshot, `${contexto}: o snapshot recebido não muda`).toEqual(antes);
      if (c.saida.erro) {
        expect(r, contexto).toEqual(recusaDoPython(c.saida.erro));
        continue;
      }
      expect(r.ok, contexto).toBe(true);
      if (!r.ok) continue;
      expect(r.valor.snapshot, contexto).toEqual(c.saida.snapshot);
      expect(c.saida.versao, contexto).toBe(c.entrada.revisao.versao + 1);
      expect(c.saida.auditoria, contexto).toEqual([
        { acao: "conciliacao.apoio_adicionado", dados: { arquivo: c.entrada.nome_arquivo, linhas: r.valor.linhas, hash: r.valor.hash } },
      ]);
    }
  });

  test("criar_vinculo: a mesma recusa, ou os mesmos totais, diferença e auditoria", () => {
    for (const c of doTipo("vinculo")) {
      const r = vinculo(c.entrada);
      const contexto = `caso ${c.id} (${c.origem})`;
      if (c.saida.erro) {
        expect(r, contexto).toEqual(recusaDoPython(c.saida.erro));
        continue;
      }
      expect(r.ok, contexto).toBe(true);
      if (!r.ok) continue;
      const v = r.valor;
      expect(
        {
          extrato_ids: v.extratoIds,
          razao_itens: v.razaoItens,
          total_extrato: texto(v.totalExtrato),
          total_razao: texto(v.totalRazao),
          diferenca: texto(v.diferenca),
          observacao: v.observacao,
          estado: "ATIVO",
        },
        contexto,
      ).toEqual(c.saida.vinculo);
      expect(c.saida.versao, contexto).toBe(c.entrada.revisao.versao + 1);
      expect(c.saida.auditoria, contexto).toEqual([
        {
          acao: "conciliacao.vinculo_confirmado",
          dados: { extrato_ids: v.extratoIds, razao_itens: v.razaoItens, diferenca: texto(v.diferenca), observacao: v.observacao },
        },
      ]);
    }
  });

  test("as ações do original têm par no Connect", () => {
    const acoes = new Set(casos.flatMap((c) => (c.saida?.auditoria ?? []).map((a: { acao: string }) => a.acao)));
    for (const a of acoes) expect(ACAO[a], a).toBeDefined();
  });

  test("validadores: aceita e normaliza o que o pydantic aceita, recusa o que ele recusa", () => {
    const schemas = { vinculo: novoVinculoSchema, desfazer: desfazerVinculoSchema, nome: renomearRevisaoSchema, exclusao: excluirRevisaoSchema };
    for (const c of doTipo("validacao")) {
      const schema = schemas[c.entrada.modelo as keyof typeof schemas];
      const r = schema.safeParse(chavesEmCamel(c.entrada.payload));
      const contexto = `caso ${c.id}: ${JSON.stringify(c.entrada.payload).slice(0, 120)}`;
      if (c.saida.ok) {
        expect(r.success, contexto).toBe(true);
        expect(r.data, contexto).toEqual(chavesEmCamel(c.saida.ok));
      } else {
        expect(r.success, contexto).toBe(false);
        if (c.saida.erro && !r.success) expect(r.error.issues[0]?.message, contexto).toBe(c.saida.erro);
      }
    }
  });
});

describe("detalhes do porte", () => {
  test("json.dumps: chaves por ponto de código (o JavaScript ordenaria por unidade UTF-16)", () => {
    expect(jsonDumps({ "￿": 1, "😀": 2 })).toBe('{"￿":1,"😀":2}');
    expect(jsonDumps({ b: [1, null, true], a: "x\u0001\"\\" })).toBe('{"a":"x\\u0001\\"\\\\","b":[1,null,true]}');
    expect(() => jsonDumps(1.5)).toThrow();
  });

  test("_moeda guarda o sinal do zero e arredonda meio para par", () => {
    expect(moeda(dec("-0.001"))).toBe("-0.00");
    expect(moeda(dec("0.025"))).toBe("0.02");
    expect(moeda(dec("1E+2"))).toBe("100.00");
  });

  test("uuidCanonico: as formas que o pydantic aceita", () => {
    const u = "12345678-1234-5678-1234-567812345678";
    expect(uuidCanonico(u.toUpperCase())).toBe(u);
    expect(uuidCanonico(u.replace(/-/g, ""))).toBe(u);
    expect(uuidCanonico(`{${u}}`)).toBe(u);
    expect(uuidCanonico(`urn:uuid:${u}`)).toBe(u);
    expect(uuidCanonico(` ${u}`)).toBeNull();
    expect(uuidCanonico(`URN:UUID:${u}`)).toBeNull();
  });

  test("desfazer: vínculo de fora e vínculo já desfeito", () => {
    expect(conferirDesfazer(null)).toEqual({ ok: false, erro: "Vínculo não encontrado nesta revisão.", codigo: "NAO_ENCONTRADA" });
    expect(conferirDesfazer({ estado: "DESFEITO" })).toEqual({ ok: false, erro: "Esta conferência já foi desfeita.", codigo: "CONFLITO" });
    expect(conferirDesfazer({ estado: "ATIVO" })).toBeNull();
  });

  test("a empresa: CNPJ com máscara confere; sem CNPJ, a confirmação é explícita", () => {
    const e = { cnpj: "12.345.678/0001-95", razaoSocial: "EMPRESA EXEMPLO LTDA" };
    expect(conferirEmpresa("12345678000195", e, false)).toBeNull();
    expect(conferirEmpresa("", e, true)).toBeNull();
    expect(conferirEmpresa("", e, false)?.codigo).toBe("CONFIRMAR_EMPRESA");
    expect(conferirEmpresa("", e, false)?.erro).toContain("pertence a EMPRESA EXEMPLO LTDA antes");
  });

  test("o relatório da B2 vai ao banco como o pydantic o grava e volta igual", () => {
    let n = 0;
    for (const caso of casosServico()) {
      if (!caso.relatorio) continue;
      const python = caso.relatorio as RelatorioPy;
      const json = relatorioDoGabarito(caso.relatorio);
      // O que a revisão grava é o `model_dump(mode="json")` do original, chave por chave.
      expect(relatorioParaPython(relatorioParaJson(relatorioDoJson(json))), `caso ${caso.id}`).toEqual(python);
      expect(relatorioDoPython(python), `caso ${caso.id}`).toEqual(json);
      n++;
    }
    expect(n).toBeGreaterThan(100);
  });

  test("obter: com a fonte alterada, o aviso a mais; o snapshot vira a forma da tela", () => {
    const [c] = doTipo("apoio").filter((x) => !x.saida.erro && x.saida.snapshot.avisos.length > 0);
    const snapshot = c.saida.snapshot as SnapshotPy;
    const resumo = {
      id: "r", agenciaId: "a", nomeArquivo: "razao.xlsx", titulo: null, contaBancaria: "ITAU", periodoInicio: "2025-02-01",
      periodoFim: "2025-02-28", versao: 2, criadaEm: "2026-11-12T10:00:00.000Z", atualizadaEm: "2026-11-12T10:00:00.000Z",
    };
    const relatorio = relatorioParaPython(relatorioDoGabarito(casosServico().find((x) => x.relatorio)!.relatorio!));
    const itens: ItemVinculoPy[] = [{ linha_id: snapshot.linhas_razao[0].id, dc: "C" }];
    const vinculo = {
      id: "v", extratoIds: [snapshot.extrato[0].transacao_id], razaoItens: itens, totalExtrato: "350.00", totalRazao: "350.00",
      diferenca: "0.00", observacao: "", estado: "ATIVO" as const, responsavel: "Pessoa", criadoEm: "2026-11-12T10:00:00.000Z",
      desfeitoPor: null, desfeitoEm: null, motivoDesfazer: null,
    };
    const valida = revisaoParaTela(resumo, relatorio, snapshot, [vinculo], true);
    expect(valida.avisos).toEqual(snapshot.avisos);
    expect(valida.linhasRazao[0].valorCredito).toBe(snapshot.linhas_razao[0].valor_credito);
    expect(valida.extrato[0].transacaoId).toBe(snapshot.extrato[0].transacao_id);
    expect(valida.fontes.map((f) => f.tipo)).toEqual(snapshot.fontes.map((f) => f.tipo));
    expect(valida.vinculos[0].razaoItens).toEqual([{ linhaId: itens[0].linha_id, dc: "C" }]);
    const historico = revisaoParaTela(resumo, relatorio, snapshot, [], false);
    expect(historico.avisos).toEqual([...snapshot.avisos, AVISO_FONTE_ALTERADA]);
    expect(historico.fontesValidas).toBe(false);
  });

  test("o snapshot de criação não aceita mais ids do que o original gerou", () => {
    const c = doTipo("criar").find((x) => !x.saida.erro && x.entrada.ids.length > 0)!;
    const curta = fila(c.entrada.ids.slice(0, -1));
    expect(() => criar(c.entrada, curta.proximo)).toThrow();
  });
});
