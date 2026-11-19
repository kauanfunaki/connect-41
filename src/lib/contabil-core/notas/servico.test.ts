// Testes-gabarito do serviço das notas fiscais (porte das partes puras de `NotaService`,
// `src/domain/notas/service.py`, e do `NotaFiscalCreate`, 18/11/2026).
//
// `gabarito/servico/notas-servico-*.json` foi gerado por `scripts/contabil-core/gabarito_notas_servico.py`: as
// chamadas de `criar`, `importar_xml`, `importar_visual`, `associar_transacao`, `desassociar_transacao`,
// `cancelar` e `listar` feitas pela suíte do original, os casos inventados para cada ramo (com os ZIPs
// `gabarito/servico/notas-zip-*.zip`) e as chamadas diretas do `NotaFiscalCreate`. Cada caso traz a entrada (o
// que o serviço leu do banco, o que recebeu e o que o leitor devolveu) e a saída exata. Se um gabarito
// falhar, o porte está errado, e não o gabarito. As divergências deliberadas são contadas e conferidas
// uma a uma (`divergencias`).

import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, test } from "vitest";
import { centavosDoBanco, compara, dec, deCentavos, fixo, reescala, texto } from "../motor/decimal";
import {
  buscaDaLista,
  caminhoDoArquivo,
  conferirAssociacao,
  conferirDesassociacao,
  DEPOIS,
  emissaoDaNota,
  NOTA_JA_CADASTRADA,
  NOTA_NAO_ENCONTRADA,
  notaParaGravar,
  prepararImportacao,
  validarZip,
  xmlsDoZip,
  type BuscaDaLista,
  type CamposDaNota,
  type LeituraDaNota,
  type NotaParaGravar,
  type RecusaNota,
  type ViaDaNota,
} from "./servico";
import type { NotaLida } from "./tipos";

/* eslint-disable @typescript-eslint/no-explicit-any */
type Caso = { id: number; tipo: string; origem: "suite" | "inventado" | "direto"; entrada: any; saida: any };

const PASTA = path.join(__dirname, "gabarito", "servico");
const casos: Caso[] = readdirSync(PASTA)
  .filter((n) => /^notas-servico-\d+\.json$/.test(n))
  .flatMap((n) => JSON.parse(readFileSync(path.join(PASTA, n), "utf8")) as Caso[]);
const doTipo = (tipo: string) => casos.filter((c) => c.tipo === tipo);

const divergencias = { valorAcimaDoBanco: 0, motivoGravado: 0, transacaoDesfeita: 0, zipInvalido: 0, curinga: 0 };

/** Data do Python (com ou sem fuso; sem fuso vale UTC, como o `_data_utc`) → milissegundos. */
const instante = (iso: string) => emissaoDaNota(iso)!.utc.getTime();

function notaLida(p: any): NotaLida {
  return {
    tipo: p.tipo,
    numero: p.numero,
    serie: p.serie,
    cnpjEmitente: p.cnpj_emitente,
    nomeEmitente: p.nome_emitente,
    cnpjDestinatario: p.cnpj_destinatario,
    valor: dec(p.valor),
    dataEmissao: p.data_emissao,
    chaveAcesso: p.chave_acesso,
    observacao: p.observacao,
    assinaturaNaoVerificada: p.assinatura_nao_verificada,
  };
}

const leituraDe = (l: any): LeituraDaNota => ("erro" in l ? { ok: false, erro: l.erro } : { ok: true, nota: notaLida(l.ok) });

/** A primeira recusa do pydantic → a frase do porte. */
function fraseDoPydantic(e: { type: string; loc: string[]; msg: string }): string {
  if (e.type === "value_error") return e.msg.replace(/^Value error, /, "");
  const campo = e.loc[0];
  const longos: Record<string, string> = {
    numero: "O número da nota passa de 50 caracteres.",
    serie: "A série da nota passa de 10 caracteres.",
    nome_emitente: "O nome do emitente passa de 300 caracteres.",
    observacao: "A observação passa de 500 caracteres.",
    assinatura_motivo: "O motivo da assinatura não conferida passa de 200 caracteres.",
  };
  if (e.type === "string_too_long" && longos[campo]) return longos[campo];
  if (e.type === "string_too_short" && campo === "numero") return "Informe o número da nota.";
  if (e.type === "greater_than" && campo === "valor") return "O valor da nota deve ser maior que zero.";
  if (e.type === "decimal_parsing" && campo === "valor") return "O valor da nota não é um número.";
  if (e.type === "finite_number" && campo === "valor") return "O valor da nota tem de ser um número finito.";
  if (e.type.startsWith("datetime") && campo === "data_emissao") return "Data de emissão inválida.";
  if (e.type === "string_type" && campo === "tipo") return "tipo deve ser 'nfe' ou 'nfse'.";
  throw new Error(`erro do pydantic sem tradução: ${JSON.stringify(e)}`);
}

const LIMITE = "O valor da nota passa do limite aceito.";
const passaDoBanco = (valor: string) => compara(reescala(dec(valor), -2), dec("9999999999999.99")) > 0;

/** A linha gravada pelo original × a do porte. */
function conferirLinha(gravada: any, n: NotaParaGravar, motivoLido: string | null) {
  expect(n.tipo).toBe(gravada.tipo);
  expect(n.numero).toBe(gravada.numero);
  expect(n.serie).toBe(gravada.serie);
  expect(n.cnpjEmitente).toBe(gravada.cnpj_emitente);
  expect(n.nomeEmitente).toBe(gravada.nome_emitente);
  expect(n.cnpjDestinatario).toBe(gravada.cnpj_destinatario);
  // O valor como foi atribuído ("10.005") ou como o banco o devolveu, já em 2 casas ("10.01").
  expect([texto(n.valor), fixo(deCentavos(centavosDoBanco(n.valor)), 2)]).toContain(gravada.valor);
  expect(n.emissao.utc.getTime()).toBe(instante(gravada.data_emissao));
  expect(n.chaveAcesso).toBe(gravada.chave_acesso);
  expect(n.dedupKey).toBe(gravada.dedup_key);
  expect(n.observacao).toBe(gravada.observacao);
  expect(n.origem).toBe(gravada.origem);
  // O original perdia o motivo da assinatura em `criar`; o porte grava (divergência deliberada).
  expect(gravada.assinatura_motivo).toBeNull();
  expect(n.assinaturaMotivo).toBe(motivoLido);
  if (motivoLido) divergencias.motivoGravado++;
}

/** O que o banco faz na gravação: a identidade ou a chave já na empresa (ou antes no mesmo lote) é duplicada. */
function gravacao(existentes: any[]) {
  const dedups = new Set(existentes.map((n) => n.dedup_key));
  const chaves = new Set(existentes.map((n) => n.chave_acesso).filter(Boolean));
  return (n: NotaParaGravar): boolean => {
    if (dedups.has(n.dedupKey) || (n.chaveAcesso !== null && chaves.has(n.chaveAcesso))) return false;
    dedups.add(n.dedupKey);
    if (n.chaveAcesso) chaves.add(n.chaveAcesso);
    return true;
  };
}

/** Importa os itens como o serviço (`_importar_parseada` + `criar`) e confere com a saída do original. */
function conferirImportacao(c: Caso, itens: { nome: string; via: ViaDaNota; leitura: LeituraDaNota; motivo: string | null }[], errosAntes: string[]) {
  const e = c.entrada;
  const s = c.saida;
  const gravar = gravacao(e.notas);
  let importadas = 0;
  let duplicadas = 0;
  const erros = [...errosAntes];
  const gravadas: { n: NotaParaGravar; motivo: string | null }[] = [];
  for (const it of itens) {
    const p = prepararImportacao({ nomeArquivo: it.nome, via: it.via, leitura: it.leitura, cnpjEmpresa: e.empresa ? e.empresa.cnpj : null });
    if (!p.ok) erros.push(p.erro);
    else if (gravar(p.nota)) {
      importadas++;
      gravadas.push({ n: p.nota, motivo: it.motivo });
    } else duplicadas++;
  }
  // O valor que não cabe em Decimal(15,2): o original gravava no SQLite do gabarito (no PostgreSQL, erro 500).
  const acima = erros.filter((x) => x.endsWith(`: ${LIMITE}`));
  if (acima.length) {
    divergencias.valorAcimaDoBanco += acima.length;
    expect(acima.length).toBe(1);
    // O original gravava (o SQLite aceita) ou contava como duplicada; o porte recusa antes.
    expect(s.importadas + s.duplicadas).toBe(importadas + duplicadas + 1);
    if (s.importadas > importadas) expect(passaDoBanco(s.notas[s.notas.length - 1].valor)).toBe(true);
    return;
  }
  expect({ importadas, duplicadas }).toEqual({ importadas: s.importadas, duplicadas: s.duplicadas });
  expect(erros.length).toBe(s.erros.length);
  s.erros.forEach((esperado: string, i: number) => {
    if (/ validation errors? for NotaFiscalCreate/.test(esperado)) {
      const nome = esperado.slice(0, esperado.search(/: \d+ validation errors? for NotaFiscalCreate/));
      expect(erros[i]).toBe(`${nome}: ${fraseDoPydantic(s.pydantic)}`);
    } else if (esperado.startsWith("Arquivo ZIP inválido: ")) {
      divergencias.zipInvalido++;
      expect(erros[i].startsWith("Arquivo ZIP inválido: ")).toBe(true);
    } else expect(erros[i]).toBe(esperado);
  });
  expect(gravadas.length).toBe(s.notas.length);
  gravadas.forEach((g, i) => conferirLinha(s.notas[i], g.n, g.motivo));
}

// ─── Importação ─────────────────────────────────────────────────────────────

describe("importar (XML, PDF e imagem): o `_importar_parseada` do original", () => {
  const importar = doTipo("importar");
  test("o gabarito tem casos da suíte e inventados", () => {
    expect(importar.filter((c) => c.origem === "suite").length).toBeGreaterThanOrEqual(4);
    expect(importar.length).toBeGreaterThan(300);
  });
  test.each(importar.map((c) => [c.id, c] as const))("caso %i", (_id, c) => {
    const e = c.entrada;
    const caminho = caminhoDoArquivo(e.nome_arquivo);
    expect(caminho.via).toBe(e.via);
    if (caminho.via === "visual" && !caminho.pdf) expect(caminho.tipoMime).toBe(c.saida.tipo_mime);
    else expect(c.saida.tipo_mime).toBeNull();
    const leitura = leituraDe(e.leitura);
    conferirImportacao(c, [{ nome: e.nome_arquivo, via: e.via, leitura, motivo: leitura.ok ? leitura.nota.assinaturaNaoVerificada : null }], []);
  });
});

describe("importar ZIP: o `importar_zip` do original", () => {
  test.each(doTipo("zip").map((c) => [c.entrada.arquivo, c] as const))("%s", (_nome, c) => {
    const bytes = new Uint8Array(readFileSync(path.join(PASTA, c.entrada.arquivo)));
    const zip = xmlsDoZip(bytes);
    if (!zip.ok) return conferirImportacao(c, [], [zip.erro]);
    const itens = zip.xmls.map((x) => {
      const leitura: LeituraDaNota = "erro" in x ? { ok: false, erro: x.erro } : leituraDe(c.entrada.leituras[x.nome]);
      return { nome: x.nome, via: "xml" as const, leitura, motivo: leitura.ok ? leitura.nota.assinaturaNaoVerificada : null };
    });
    conferirImportacao(c, itens, []);
  });

  test("os limites contra arquivo bomba, na ordem do original", () => {
    expect(validarZip([{ nome: "a.xml", tamanho: 0, comprimido: 0 }])).toBeNull();
    expect(validarZip([{ nome: "a.txt", tamanho: 10, comprimido: 0 }])).toBe("a.txt: razão de compressão insegura.");
    expect(validarZip([{ nome: "a.XML", tamanho: 10 * 1024 * 1024 + 1, comprimido: 10 * 1024 * 1024 }])).toBe("a.XML: XML excede o limite de 10 MiB.");
    expect(validarZip([{ nome: "a.bin", tamanho: 101 * 1024 * 1024, comprimido: 101 * 1024 * 1024 }])).toBe("ZIP excede o limite total descompactado de 100 MiB.");
    expect(validarZip([{ nome: "a.bin", tamanho: 1000, comprimido: 10 }])).toBeNull();
    expect(validarZip([{ nome: "a.bin", tamanho: 1001, comprimido: 10 }])).toBe("a.bin: razão de compressão insegura.");
  });
});

// ─── Cadastro à mão e validação ─────────────────────────────────────────────

function campos(d: any): CamposDaNota {
  const c: CamposDaNota = { tipo: d.tipo, numero: d.numero, cnpjEmitente: d.cnpj_emitente, valor: d.valor, dataEmissao: d.data_emissao };
  const opcionais: [keyof CamposDaNota, string][] = [
    ["serie", "serie"], ["nomeEmitente", "nome_emitente"], ["cnpjDestinatario", "cnpj_destinatario"], ["chaveAcesso", "chave_acesso"],
    ["observacao", "observacao"], ["origem", "origem"], ["assinaturaMotivo", "assinatura_motivo"],
  ];
  for (const [nome, py] of opcionais) if (py in d) c[nome] = d[py];
  return c;
}

describe("criar: o `criar` do original (cadastro à mão)", () => {
  test.each(doTipo("criar").map((c) => [c.id, c] as const))("caso %i", (_id, c) => {
    const r = notaParaGravar(campos(c.entrada.dados));
    if (!r.ok) {
      expect(r.erro).toBe(LIMITE);
      divergencias.valorAcimaDoBanco++;
      return;
    }
    const nova = gravacao(c.entrada.notas)(r.valor);
    if (c.saida.erro) {
      expect(c.saida.erro).toEqual({ tipo: "ConflictError", mensagem: NOTA_JA_CADASTRADA });
      expect(nova).toBe(false);
    } else {
      expect(nova).toBe(true);
      expect(c.saida.notas).toHaveLength(1);
      conferirLinha(c.saida.notas[0], r.valor, c.entrada.dados.assinatura_motivo ?? null);
    }
  });
});

describe("NotaFiscalCreate: validação e identidade", () => {
  test.each(doTipo("validacao").map((c) => [c.id, c] as const))("caso %i", (_id, c) => {
    const r = notaParaGravar(campos(JSON.parse(JSON.stringify(c.entrada))));
    if (c.saida.pydantic) {
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.erro).toBe(fraseDoPydantic(c.saida.pydantic));
    } else if (c.saida.erro) {
      expect(r).toEqual({ ok: false, erro: c.saida.erro });
    } else if (!r.ok) {
      expect(r.erro).toBe(LIMITE);
      divergencias.valorAcimaDoBanco++;
    } else {
      const o = c.saida.ok;
      expect({
        tipo: r.valor.tipo, numero: r.valor.numero, serie: r.valor.serie, cnpj_emitente: r.valor.cnpjEmitente,
        cnpj_destinatario: r.valor.cnpjDestinatario, valor: texto(r.valor.valor), chave_acesso: r.valor.chaveAcesso, origem: r.valor.origem,
        dedup_key: r.valor.dedupKey,
      }).toEqual(o);
    }
  });
});

// ─── Associar, desassociar e cancelar ───────────────────────────────────────

const CODIGO: Record<string, RecusaNota["codigo"]> = { NotFoundError: "NAO_ENCONTRADA", ConflictError: "CONFLITO", ValidationError: "INVALIDA" };

describe("associar, desassociar e cancelar", () => {
  const estados = [...doTipo("associar"), ...doTipo("desassociar"), ...doTipo("cancelar")];
  test.each(estados.map((c) => [c.tipo, c.id, c] as const))("%s %i", (tipo, _id, c) => {
    const e = c.entrada;
    const nota = e.notas.find((n: any) => n.id === e.nota_id);
    let recusa: RecusaNota | null = null;
    let depois: { status: string; transacaoId: string | null } | null = null;
    if (!nota) recusa = { ok: false, erro: NOTA_NAO_ENCONTRADA, codigo: "NAO_ENCONTRADA" };
    else {
      const estado = { status: nota.status, transacaoId: nota.transacao_id };
      if (tipo === "associar") {
        const t = e.transacoes.find((x: any) => x.id === e.transacao_id && x.empresa === "esta");
        // A transação desfeita: o original associava; o porte recusa (divergência deliberada).
        if (t?.apagada && !conferirAssociacao(estado, true) && !c.saida.erro) {
          divergencias.transacaoDesfeita++;
          expect(conferirAssociacao(estado, false)?.codigo).toBe("NAO_ENCONTRADA");
          return;
        }
        recusa = conferirAssociacao(estado, !!t && !t.apagada);
        if (!recusa) depois = DEPOIS.associar(e.transacao_id);
      } else if (tipo === "desassociar") {
        recusa = conferirDesassociacao(estado);
        if (!recusa) depois = DEPOIS.desassociar();
      } else depois = DEPOIS.cancelar();
    }
    if (c.saida.erro) {
      expect(recusa).toEqual({ ok: false, erro: c.saida.erro.mensagem, codigo: CODIGO[c.saida.erro.tipo] });
    } else {
      expect(recusa).toBeNull();
      expect(depois).toEqual({ status: c.saida.nota.status, transacaoId: c.saida.nota.transacao_id });
    }
  });
});

// ─── Lista ──────────────────────────────────────────────────────────────────

/** O `ilike '%termo%'` do PostgreSQL (maiúscula e minúscula iguais; os dados do gabarito são ASCII). */
const contem = (v: string | null, termo: string) => v !== null && v.toLowerCase().includes(termo.toLowerCase());

function casa(n: any, b: BuscaDaLista): boolean {
  if (b.tipo !== null && n.tipo !== b.tipo) return false;
  if (b.status !== null && n.status !== b.status) return false;
  if (b.numeroContem !== null && !contem(n.numero, b.numeroContem)) return false;
  if (b.chaveContem !== null && !contem(n.chave_acesso, b.chaveContem)) return false;
  if (b.cnpjIgual !== null && n.cnpj_emitente !== b.cnpjIgual && n.cnpj_destinatario !== b.cnpjIgual) return false;
  if (b.cnpjContem !== null && !contem(n.cnpj_emitente, b.cnpjContem) && !contem(n.cnpj_destinatario, b.cnpjContem)) return false;
  if (b.emitenteContem !== null && !contem(n.nome_emitente, b.emitenteContem)) return false;
  if (b.dataDe && instante(n.data_emissao) < b.dataDe.getTime()) return false;
  if (b.dataAte && instante(n.data_emissao) > b.dataAte.getTime()) return false;
  return true;
}

describe("listar: os filtros do original", () => {
  test.each(doTipo("listar").map((c) => [c.id, c] as const))("caso %i", (_id, c) => {
    const e = c.entrada;
    const f = e.filtros;
    const data = (v: string | undefined) => (v ? emissaoDaNota(v)!.utc : null);
    const b = buscaDaLista({
      tipo: f.tipo, status: f.status, numero: f.numero, chaveAcesso: f.chave_acesso, cnpj: f.cnpj, emitente: f.emitente,
      dataDe: data(f.data_de), dataAte: data(f.data_ate),
    });
    // `%` e `_` são curingas no `ilike` do original; o `contains` do Prisma os procura como texto.
    if ([f.numero, f.emitente, f.cnpj].some((t) => t && /[%_]/.test(t))) {
      divergencias.curinga++;
      expect(c.saida.total).toBeGreaterThanOrEqual(e.notas.filter((n: any) => casa(n, b)).length);
      return;
    }
    const achadas = e.notas.filter((n: any) => casa(n, b)).sort((x: any, y: any) => instante(y.data_emissao) - instante(x.data_emissao) || (x.id < y.id ? -1 : 1));
    expect(achadas.length).toBe(c.saida.total);
    const pagina = achadas.slice((e.page - 1) * e.page_size, e.page * e.page_size);
    // Na mesma emissão o PostgreSQL não garante ordem (o porte desempata pelo id): confere o dia e o conjunto.
    expect(pagina.map((n: any) => instante(n.data_emissao))).toEqual(c.saida.itens.map((i: any) => instante(i.data_emissao)));
    const ids = new Set(achadas.map((n: any) => n.id));
    for (const item of c.saida.itens) {
      expect(ids.has(item.id)).toBe(true);
      const n = e.notas.find((x: any) => x.id === item.id);
      const t = e.transacoes.find((x: any) => x.id === n.transacao_id);
      // O resumo da transação vem mesmo da transação desfeita (o `outerjoin` não olha `deleted_at`).
      expect(item.transacao_descricao).toBe(t ? t.historico : null);
      expect(item.transacao_dc).toBe(t ? t.dc : null);
      if (t) expect(compara(dec(item.transacao_valor), dec(t.valor))).toBe(0);
    }
  });
});

test("divergências deliberadas: só as conhecidas, e todas exercitadas", () => {
  expect(divergencias.valorAcimaDoBanco).toBeGreaterThan(0);
  expect(divergencias.motivoGravado).toBeGreaterThan(0);
  expect(divergencias.transacaoDesfeita).toBeGreaterThan(0);
  expect(divergencias.zipInvalido).toBe(1);
  expect(divergencias.curinga).toBeGreaterThan(0);
});
