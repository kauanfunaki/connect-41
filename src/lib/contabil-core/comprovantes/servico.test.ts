// Testes-gabarito do serviço dos comprovantes (porte das partes puras de `ComprovanteService`,
// `src/domain/comprovantes/service.py`, e do `ComprovanteCreate`, 19/11/2026).
//
// `gabarito/servico/comprovantes-servico-*.json` foi gerado por `scripts/contabil-core/gabarito_comprovantes_servico.py`:
// as chamadas de `criar`, `associar_transacao`, `desassociar_transacao`, `deletar`, `obter`, `listar` e
// `buscar_por_arquivo` feitas pela suíte do original, os casos inventados para cada ramo e as chamadas
// diretas do `ComprovanteCreate`. Cada caso traz a entrada (o que o serviço leu do banco e o que recebeu)
// e a saída exata. Aqui o banco é simulado pela entrada, e as decisões são as funções puras que o
// servidor (`servidor/comprovantes.ts`) usa. As divergências deliberadas são contadas uma a uma.

import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { afterAll, describe, expect, test } from "vitest";
import { centavosDoBanco, compara, dec, deCentavos, fixo, reescala, texto, type Dec } from "../motor/decimal";
import {
  AGENCIA_NAO_ENCONTRADA,
  COMPROVANTE_NAO_ENCONTRADO,
  conferirAssociacao,
  conferirDesassociacao,
  conferirDuplicidade,
  filtroDeStatus,
  porArquivo,
  TRANSACAO_NAO_ENCONTRADA,
  validarComprovante,
  type CamposDoComprovante,
  type ComprovanteGravado,
  type RecusaComprovante,
} from "./servico";

/* eslint-disable @typescript-eslint/no-explicit-any */
type Caso = { id: number; tipo: string; origem: "suite" | "inventado" | "direto"; entrada: any; saida: any };

const PASTA = path.join(__dirname, "gabarito", "servico");
const casos: Caso[] = readdirSync(PASTA)
  .filter((n) => /^comprovantes-servico-\d+\.json$/.test(n))
  .flatMap((n) => JSON.parse(readFileSync(path.join(PASTA, n), "utf8")) as Caso[]);
const doTipo = (tipo: string) => casos.filter((c) => c.tipo === tipo);

const divergencias = { empresaInexistente: 0, transacaoDesfeita: 0, alemDaColuna: 0, alemDoDecimal: 0 };

const AGENCIA_ID = "00000000-0000-0000-0000-000000000a6e";
const instante = (iso: string | null) => (iso === null ? null : new Date(iso).getTime());

/** Os nomes do original → os do porte. */
function campos(d: any): CamposDoComprovante {
  const c: CamposDoComprovante = {};
  const mapa: [keyof CamposDoComprovante, string][] = [
    ["favorecido", "favorecido"],
    ["cpfCnpj", "cpf_cnpj"],
    ["dataPagamento", "data_pagamento"],
    ["dataVencimento", "data_vencimento"],
    ["valorDocumento", "valor_documento"],
    ["valorPago", "valor_pago"],
    ["juros", "juros"],
    ["multa", "multa"],
    ["desconto", "desconto"],
    ["observacao", "observacao"],
    ["agenciaId", "agencia_id"],
    ["transacaoId", "transacao_id"],
    ["arquivoNome", "arquivo_nome"],
    ["permitirDuplicado", "permitir_duplicado"],
  ];
  for (const [nosso, deles] of mapa) if (d[deles] !== undefined) c[nosso] = d[deles];
  return c;
}

/** Os comprovantes vivos desta empresa, como o servidor os lê. */
function gravados(e: any): ComprovanteGravado[] {
  return e.comprovantes
    .filter((c: any) => !c.apagado && c.empresa !== "outra")
    .map((c: any) => ({
      id: c.id,
      favorecido: c.favorecido,
      cpfCnpj: c.cpf_cnpj,
      valorPago: dec(c.valor_pago),
      dataPagamento: c.data_pagamento ? new Date(c.data_pagamento) : null,
      arquivoNome: c.arquivo_nome,
      arquivoSha256: c.arquivo_sha256,
      transacaoId: c.transacao_id,
      criadoEm: new Date(Date.UTC(2026, 0, 1) + c.ordem * 60_000),
    }));
}

const deEsta = (x: any) => x.empresa !== "outra";
const doCodigo: Record<string, string> = { NOT_FOUND: "NAO_ENCONTRADA", CONFLICT: "CONFLITO" };

/** A recusa do original × a do porte (tipo, frase, código e detalhes). */
function conferirRecusa(original: any, r: RecusaComprovante | null) {
  expect(r).not.toBeNull();
  expect(r!.erro).toBe(original.mensagem);
  expect(r!.codigo).toBe(doCodigo[original.code] ?? original.code);
  expect(r!.detalhes ?? null).toEqual(original.detalhes ?? null);
}

/** O dinheiro gravado: como atribuído ("10.005") ou como o banco devolve ("10.01"). */
function conferirDinheiro(gravado: string | null, d: Dec | null) {
  if (d === null) return expect(gravado).toBeNull();
  expect([texto(d), fixo(deCentavos(centavosDoBanco(d)), 2), fixo(reescala(d, -2), 2)]).toContain(gravado);
}

describe("criar (gabarito)", () => {
  test.each(doTipo("criar").map((c) => [c.id, c.origem, c] as const))("#%s (%s)", (_id, _origem, c) => {
    const e = c.entrada;
    const s = c.saida;
    const v = validarComprovante(campos(e.dados));
    if (!v.ok) {
      // O pydantic aceitou, mas o banco não guardaria (no original, erro 500 ao gravar).
      expect(s.erro).toBeUndefined();
      expect(v.erro).toMatch(/passa de (\d+) caracteres|passa do limite/);
      if (v.erro.includes("caracteres")) divergencias.alemDaColuna++;
      else divergencias.alemDoDecimal++;
      return;
    }
    const d = v.valor;
    if (e.empresa === null) {
      // Sem empresa, o original gravava assim mesmo no SQLite (no PostgreSQL, a chave estrangeira recusava);
      // o porte confere a empresa antes de tudo e responde "não encontrada".
      divergencias.empresaInexistente++;
      return;
    }
    let recusa: RecusaComprovante | null = null;
    if (d.agenciaId) {
      const existe = d.agenciaId === AGENCIA_ID || e.agencias.some((a: any) => a.id === d.agenciaId && deEsta(a) && !a.apagada);
      if (!existe) recusa = { ok: false, erro: AGENCIA_NAO_ENCONTRADA, codigo: "NAO_ENCONTRADA" };
    }
    if (!recusa && d.transacaoId) {
      const t = e.transacoes.find((x: any) => x.id === d.transacaoId && deEsta(x));
      if (t && t.apagada) {
        // A transação desfeita é recusada aqui; o original não olhava o `deleted_at`.
        divergencias.transacaoDesfeita++;
        expect(s.erro).toBeUndefined();
        return;
      }
      if (!t) recusa = { ok: false, erro: TRANSACAO_NAO_ENCONTRADA, codigo: "NAO_ENCONTRADA" };
    }
    if (!recusa) recusa = conferirDuplicidade(d, e.dados.arquivo.tem ? e.dados.arquivo.sha256 : null, gravados(e));
    if (s.erro) return conferirRecusa(s.erro, recusa);
    expect(recusa).toBeNull();
    expect(s.novos).toHaveLength(1);
    const n = s.novos[0];
    expect(d.favorecido).toBe(n.favorecido);
    expect(d.cpfCnpj).toBe(n.cpf_cnpj);
    expect(d.dataPagamento?.getTime() ?? null).toBe(instante(n.data_pagamento));
    expect(d.dataVencimento?.getTime() ?? null).toBe(instante(n.data_vencimento));
    conferirDinheiro(n.valor_documento, d.valorDocumento);
    conferirDinheiro(n.valor_pago, d.valorPago);
    conferirDinheiro(n.juros, d.juros);
    conferirDinheiro(n.multa, d.multa);
    conferirDinheiro(n.desconto, d.desconto);
    expect(d.observacao).toBe(n.observacao);
    expect(d.arquivoNome).toBe(n.arquivo_nome);
    expect(e.dados.arquivo.tem ? e.dados.arquivo.sha256 : null).toBe(n.arquivo_sha256);
    expect(e.dados.arquivo.tem).toBe(n.tem_arquivo);
    expect(d.agenciaId).toBe(n.agencia_id);
    expect(d.transacaoId).toBe(n.transacao_id);
    // A transação ligada no cadastro aparece na resposta (o resumo da lista).
    const t = e.transacoes.find((x: any) => x.id === d.transacaoId);
    expect(s.resposta.transacao_descricao).toBe(t ? t.historico : null);
  });
});

describe("associar, desassociar, excluir, obter e buscar por arquivo (gabarito)", () => {
  const vivo = (e: any) => e.comprovantes.find((c: any) => c.id === e.comprovante_id && deEsta(c) && !c.apagado) ?? null;

  test.each(doTipo("associar").map((c) => [c.id, c.origem, c] as const))("associar #%s (%s)", (_id, _origem, c) => {
    const e = c.entrada;
    const comp = vivo(e);
    if (!comp) return conferirRecusa(c.saida.erro, { ok: false, erro: COMPROVANTE_NAO_ENCONTRADO, codigo: "NAO_ENCONTRADA" });
    const t = e.transacoes.find((x: any) => x.id === e.transacao_id && deEsta(x));
    if (t && t.apagada && !comp.transacao_id) {
      divergencias.transacaoDesfeita++;
      expect(c.saida.erro).toBeUndefined();
      expect(conferirAssociacao({ transacaoId: comp.transacao_id }, false)).not.toBeNull();
      return;
    }
    const recusa = conferirAssociacao({ transacaoId: comp.transacao_id }, !!t);
    if (c.saida.erro) return conferirRecusa(c.saida.erro, recusa);
    expect(recusa).toBeNull();
    expect(c.saida.comprovante.transacao_id).toBe(e.transacao_id);
  });

  test.each(doTipo("desassociar").map((c) => [c.id, c.origem, c] as const))("desassociar #%s (%s)", (_id, _origem, c) => {
    const comp = vivo(c.entrada);
    if (!comp) return conferirRecusa(c.saida.erro, { ok: false, erro: COMPROVANTE_NAO_ENCONTRADO, codigo: "NAO_ENCONTRADA" });
    const recusa = conferirDesassociacao({ transacaoId: comp.transacao_id });
    if (c.saida.erro) return conferirRecusa(c.saida.erro, recusa);
    expect(recusa).toBeNull();
    expect(c.saida.comprovante.transacao_id).toBeNull();
  });

  test.each(doTipo("deletar").map((c) => [c.id, c.origem, c] as const))("deletar #%s (%s)", (_id, _origem, c) => {
    const comp = vivo(c.entrada);
    if (!comp) return conferirRecusa(c.saida.erro, { ok: false, erro: COMPROVANTE_NAO_ENCONTRADO, codigo: "NAO_ENCONTRADA" });
    expect(c.saida.comprovante.apagado).toBe(true);
    // Excluir não solta a transação nem apaga o arquivo: a linha só sai das consultas.
    expect(c.saida.comprovante.transacao_id).toBe(comp.transacao_id);
    expect(c.saida.comprovante.tem_arquivo).toBe(comp.tem_arquivo);
  });

  test.each(doTipo("obter").map((c) => [c.id, c.origem, c] as const))("obter #%s (%s)", (_id, _origem, c) => {
    const comp = vivo(c.entrada);
    if (!comp) return conferirRecusa(c.saida.erro, { ok: false, erro: COMPROVANTE_NAO_ENCONTRADO, codigo: "NAO_ENCONTRADA" });
    const t = c.entrada.transacoes.find((x: any) => x.id === comp.transacao_id && deEsta(x));
    expect(c.saida.resposta.transacao_descricao).toBe(t ? t.historico : null);
    expect(c.saida.resposta.transacao_valor).toBe(t ? fixo(dec(t.valor), 2) : null);
    expect(c.saida.resposta.tem_arquivo).toBe(comp.tem_arquivo);
  });

  test.each(doTipo("buscar").map((c) => [c.id, c.origem, c] as const))("buscar_por_arquivo #%s (%s)", (_id, _origem, c) => {
    expect(porArquivo(gravados(c.entrada), c.entrada.sha256)?.id ?? null).toBe(c.saida.achado);
  });
});

describe("listar (gabarito)", () => {
  test.each(doTipo("listar").map((c) => [c.id, c.origem, c] as const))("#%s (%s)", (_id, _origem, c) => {
    const e = c.entrada;
    const f = e.filtros;
    const status = filtroDeStatus(f.status);
    const filtrados = e.comprovantes.filter(
      (x: any) =>
        deEsta(x) &&
        !x.apagado &&
        (!f.agencia_id || x.agencia_id === f.agencia_id) &&
        (!f.transacao_id || x.transacao_id === f.transacao_id) &&
        (status !== "associado" || x.transacao_id !== null) &&
        (status !== "nao_associado" || x.transacao_id === null),
    );
    // Do pagamento mais recente para o mais antigo, sem data primeiro (o PostgreSQL); empate pelo id.
    const chave = (x: any) => (x.data_pagamento === null ? Infinity : new Date(x.data_pagamento).getTime());
    filtrados.sort((a: any, b: any) => chave(b) - chave(a) || (a.id < b.id ? -1 : 1));
    expect(c.saida.total).toBe(filtrados.length);
    const pagina = filtrados.slice((e.page - 1) * e.page_size, e.page * e.page_size);
    // Comprovantes de mesmo instante podem vir em qualquer ordem no original: confere os grupos.
    const grupos = (xs: { id: string; data_pagamento: string | null }[]) => {
      const g: string[][] = [];
      let ultimo: number | null | undefined;
      for (const x of xs) {
        const k = instante(x.data_pagamento);
        if (g.length && k === ultimo) g[g.length - 1].push(x.id);
        else g.push([x.id]);
        ultimo = k;
      }
      return g.map((ids) => ids.sort());
    };
    expect(grupos(pagina)).toEqual(grupos(c.saida.itens));
    for (const item of c.saida.itens) {
      const x = filtrados.find((y: any) => y.id === item.id);
      const t = e.transacoes.find((y: any) => y.id === x.transacao_id && deEsta(y));
      expect(item.transacao_descricao).toBe(t ? t.historico : null);
      expect(item.transacao_dc).toBe(t ? t.dc : null);
      expect(item.tem_arquivo).toBe(x.tem_arquivo);
    }
  });
});

/** O primeiro erro do pydantic → o campo da frase do porte. */
const CAMPO_DA_FRASE: Record<string, RegExp> = {
  valor_pago: /valor pago/i,
  valor_documento: /valor do documento/i,
  juros: /juros/i,
  multa: /multa/i,
  desconto: /desconto/i,
  favorecido: /favorecido/i,
  data_pagamento: /data de pagamento/i,
  data_vencimento: /data de vencimento/i,
  agencia_id: /conta bancária/i,
  transacao_id: /transação/i,
  permitir_duplicado: /permitir_duplicado/i,
};

describe("ComprovanteCreate (gabarito)", () => {
  test.each(doTipo("validacao").map((c) => [c.id, JSON.stringify(c.entrada).slice(0, 60), c] as const))("#%s %s", (_id, _n, c) => {
    const v = validarComprovante(campos(c.entrada));
    if (c.saida.pydantic) {
      expect(v.ok).toBe(false);
      if (!v.ok) expect(v.erro).toMatch(CAMPO_DA_FRASE[c.saida.pydantic.loc[0]]);
      return;
    }
    const o = c.saida.ok;
    if (!v.ok) {
      expect(v.erro).toMatch(/passa de (\d+) caracteres|passa do limite/);
      if (v.erro.includes("caracteres")) divergencias.alemDaColuna++;
      else divergencias.alemDoDecimal++;
      return;
    }
    expect(texto(v.valor.valorPago)).toBe(o.valor_pago);
    for (const [k, nosso] of [
      ["juros", v.valor.juros],
      ["multa", v.valor.multa],
      ["desconto", v.valor.desconto],
    ] as const) {
      expect(compara(nosso, dec(o[k]))).toBe(0);
    }
    expect(v.valor.valorDocumento === null ? null : texto(v.valor.valorDocumento)).toBe(o.valor_documento);
    expect(v.valor.dataPagamento?.getTime() ?? null).toBe(instante(o.data_pagamento));
    expect(v.valor.dataVencimento?.getTime() ?? null).toBe(instante(o.data_vencimento));
    expect(v.valor.agenciaId).toBe(o.agencia_id);
    expect(v.valor.transacaoId).toBe(o.transacao_id);
    expect(v.valor.permitirDuplicado).toBe(o.permitir_duplicado);
  });
});

afterAll(() => {
  // Cada divergência deliberada, contada (ver docs/CONTABIL-CORE.md, Fase C2).
  expect(divergencias).toEqual({ empresaInexistente: 1, transacaoDesfeita: 4, alemDaColuna: 4, alemDoDecimal: 1 });
});
