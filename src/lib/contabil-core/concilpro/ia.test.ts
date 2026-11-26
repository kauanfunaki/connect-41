// Gabarito das leituras do Razão de fornecedores por IA chamadas sozinhas (scripts/contabil-core/gabarito_concilpro.py):
// o texto do bloco (`parsear_bloco_fornecedor_ia`), as páginas em lotes (`parsear_bloco_fornecedor_ia_visao`, inclusive
// o teste do lote que falha da suíte do original) e a classificação dos incertos (`classificar_lancamentos_incertos`),
// com a IA simulada: as mesmas chamadas (o texto, as páginas, `max_tokens` e o prazo) e o mesmo resultado.

import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/ai", () => ({ gerarTexto: vi.fn(), isAiConfigured: vi.fn() }));

import { codificado } from "../cartoes/gabarito/ler";
import { lancamentoDe, lancamentoPy, registros, type Json, type Registro } from "./gabarito/ler";
import { conferirChamadas, iaSimulada } from "./gabarito/iaSimulada";
import { classificarLancamentosIncertos, IA_DESLIGADA, IA_SEM_PROVEDOR, parsearBlocoFornecedorIa, parsearBlocoFornecedorIaVisao } from "./ia";
import type { RespostaDaIa } from "./leitor";

const quem = { tenantId: "escritorio-teste", documentosFinanceirosLiberados: true };

/** A resposta do porte como o original a devolvia: o dict, ou `None` (inclusive sem a chave da OpenAI). */
const comoPy = (r: RespostaDaIa): Json => (r && "dados" in r ? (codificado(r.dados) as Json) : null);

async function comErro<T>(f: () => Promise<T>): Promise<{ ok: T } | { tipo: string; mensagem: string }> {
  try {
    return { ok: await f() };
  } catch (e) {
    return { tipo: (e as Error).name, mensagem: (e as Error).message };
  }
}

const esperado = (r: Registro) => (r.error ? r.error : { ok: r.result });

describe("o texto do bloco à IA (gabarito)", () => {
  it.each(registros("ia.parsear_bloco_fornecedor_ia").map((r) => [r.nome!, r] as const))("%s", async (_n, r) => {
    const { ia, feitas } = iaSimulada(r.config!.chave, r.config!.respostas);
    const obtido = await comErro(async () => comoPy(await parsearBlocoFornecedorIa(r.args[0] as string, quem, ia)));
    expect(obtido).toEqual(esperado(r));
    conferirChamadas(feitas, r.chamadas_ia!);
  });

  it("sem provedor, a frase diz onde configurar; com a chave do escritório desligada, onde ligar", async () => {
    const { ia, feitas } = iaSimulada(false, []);
    const bloco = "x".repeat(40);
    expect(await parsearBlocoFornecedorIa(bloco, quem, ia)).toEqual({ indisponivel: IA_SEM_PROVEDOR });
    expect(await parsearBlocoFornecedorIa(bloco, { ...quem, documentosFinanceirosLiberados: false }, ia)).toEqual({ indisponivel: IA_DESLIGADA });
    expect(feitas).toEqual([]);
  });
});

describe("as páginas à IA de imagem, em lotes de 3 (gabarito)", () => {
  it.each(registros("ia.parsear_bloco_fornecedor_ia_visao").map((r) => [r.nome!, r] as const))("%s", async (_n, r) => {
    const { ia, feitas } = iaSimulada(r.config!.chave, r.config!.respostas);
    const paginas = Array.from({ length: r.args[0] as number }, (_, k) => ({ numero: k + 1, pdf: new Uint8Array([k]) }));
    const obtido = await comErro(async () => comoPy(await parsearBlocoFornecedorIaVisao(paginas, r.args[1] as string, quem, ia)));
    expect(obtido).toEqual(esperado(r));
    conferirChamadas(feitas, r.chamadas_ia!);
  });

  it("o lote que falha da suíte do original interrompe tudo", () => {
    const r = registros("ia.parsear_bloco_fornecedor_ia_visao").find((x) => x.nome === "visao-suite-lote-2-de-3-chave")!;
    expect(r.error).toEqual({ tipo: "VisionBatchError", mensagem: "Falha no batch Vision 2 de 3" });
  });
});

describe("a classificação dos incertos (gabarito)", () => {
  it.each(registros("ia.classificar_lancamentos_incertos").map((r) => [r.nome!, r] as const))("%s", async (_n, r) => {
    const { ia, feitas } = iaSimulada(r.config!.chave, r.config!.respostas);
    const lancamentos = (r.args[0] as Json[]).map(lancamentoDe);
    await classificarLancamentosIncertos(lancamentos, quem, ia);
    expect(lancamentos.map(lancamentoPy)).toEqual(r.result);
    conferirChamadas(feitas, r.chamadas_ia!);
  });
});
