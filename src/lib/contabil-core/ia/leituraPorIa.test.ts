// A peça comum "documento → IA" com a fundação de IA simulada: a chave do escritório desligada recusa
// sem chamar, o escritório sem provedor também, o orçamento esgotado para a leitura com a frase do
// original, a falha do provedor vira recusa, e a resposta que não serve é recusada por quem a lê (a
// nota fiscal) com a frase do original.

import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/ai", () => ({ gerarTexto: vi.fn(), isAiConfigured: vi.fn() }));

import { LEITURA_DESLIGADA, lerPorIa, Orcamento, OrcamentoEsgotado, SEM_PROVEDOR, type DependenciasDaIa, type PedidoDeLeitura } from "./leituraPorIa";
import { lerNotaImagem } from "../notas/visual";

function simulada(resposta: string | Error = "{}", configurada = true) {
  const gerarTexto = vi.fn(async () => {
    if (resposta instanceof Error) throw resposta;
    return resposta;
  });
  const isAiConfigured = vi.fn(async () => configurada);
  return { ia: { gerarTexto, isAiConfigured } as unknown as DependenciasDaIa, gerarTexto, isAiConfigured };
}

const pedido = (orcamento = new Orcamento()): PedidoDeLeitura => ({
  agentCode: "leitor_de_nota_imagem",
  sistema: "sistema",
  texto: "prompt",
  anexo: { nome: "nota.png", mime: "image/png", bytes: new Uint8Array([1, 2, 3]) },
  maxTokens: 1024,
  orcamento,
});

describe("lerPorIa", () => {
  it("chave do escritório desligada (ou ausente): recusa sem chamar nem gastar orçamento", async () => {
    const { ia, gerarTexto, isAiConfigured } = simulada();
    const orcamento = new Orcamento();
    for (const quem of [{ tenantId: "t" }, { tenantId: "t", documentosFinanceirosLiberados: false }]) {
      expect(await lerPorIa(quem, pedido(orcamento), ia)).toEqual({ ok: false, motivo: "desligada", mensagem: LEITURA_DESLIGADA });
    }
    expect(gerarTexto).not.toHaveBeenCalled();
    expect(isAiConfigured).not.toHaveBeenCalled();
    expect(orcamento.chamadasRestantes).toBe(30);
    expect(LEITURA_DESLIGADA).not.toMatch(/openai|ALLOW_|variável/i);
  });

  it("escritório sem provedor de IA: recusa sem chamar", async () => {
    const { ia, gerarTexto } = simulada("{}", false);
    expect(await lerPorIa({ tenantId: "t", documentosFinanceirosLiberados: true }, pedido(), ia)).toEqual({
      ok: false,
      motivo: "sem_provedor",
      mensagem: SEM_PROVEDOR,
    });
    expect(gerarTexto).not.toHaveBeenCalled();
  });

  it("liberada: chama o agente com o documento, o teto de tempo e a auditoria, e devolve o texto cru", async () => {
    const { ia, gerarTexto } = simulada('```json\n{"tipo":"nfe"}\n```');
    const r = await lerPorIa({ tenantId: "t", documentosFinanceirosLiberados: true, userId: "u1", empresaId: "e1" }, pedido(), ia);
    expect(r).toEqual({ ok: true, texto: '```json\n{"tipo":"nfe"}\n```' });
    const chamada = (gerarTexto.mock.calls[0] as unknown as [Record<string, unknown>])[0];
    expect(chamada).toMatchObject({
      tenantId: "t",
      agentCode: "leitor_de_nota_imagem",
      sistema: "sistema",
      texto: "prompt",
      maxTokens: 1024,
      anexos: [{ nome: "nota.png", mime: "image/png", base64: "AQID", imagem: true }],
      contexto: { userId: "u1", entityType: "core_empresa", entityId: "e1" },
    });
    expect(chamada.timeoutMs).toBeGreaterThanOrEqual(1000);
    expect(chamada.timeoutMs).toBeLessThanOrEqual(30_000);
  });

  it("falha do provedor, do agente ou do teto do mês: recusa com a mensagem da fundação", async () => {
    const { ia } = simulada(new Error("Este agente está desligado para esta empresa."));
    expect(await lerPorIa({ tenantId: "t", documentosFinanceirosLiberados: true }, pedido(), ia)).toEqual({
      ok: false,
      motivo: "falha",
      mensagem: "Este agente está desligado para esta empresa.",
    });
  });

  it("resposta cortada pelo limite de saída: só quem pede `exigirFim` recebe a recusa `incompleta`", async () => {
    const cortada = Object.assign(new Error("A resposta da IA veio incompleta."), { name: "RespostaIncompletaDaIa" });
    const { ia, gerarTexto } = simulada(cortada);
    const quem = { tenantId: "t", documentosFinanceirosLiberados: true };
    expect(await lerPorIa(quem, { ...pedido(), exigirFim: true }, ia)).toEqual({ ok: false, motivo: "incompleta", mensagem: "A resposta da IA veio incompleta." });
    expect((gerarTexto.mock.calls[0] as unknown as [Record<string, unknown>])[0].exigirFim).toBe(true);
    // Sem pedir, a fundação nem recebe a opção (e o texto cortado volta como antes).
    const outra = simulada("{");
    expect(await lerPorIa(quem, pedido(), outra.ia)).toEqual({ ok: true, texto: "{" });
    expect((outra.gerarTexto.mock.calls[0] as unknown as [Record<string, unknown>])[0]).not.toHaveProperty("exigirFim");
  });

  it("orçamento do arquivo: as chamadas acabam e o tempo acaba com as frases do original", async () => {
    const { ia } = simulada();
    const quem = { tenantId: "t", documentosFinanceirosLiberados: true };
    const curto = new Orcamento({ maxChamadas: 1 });
    await lerPorIa(quem, pedido(curto), ia);
    await expect(lerPorIa(quem, pedido(curto), ia)).rejects.toThrow(new OrcamentoEsgotado("Arquivo excedeu o limite de chamadas ao serviço de IA."));
    let t = 0;
    const relogio = new Orcamento({ segundos: 60 }, () => t);
    t = 60_001;
    await expect(lerPorIa(quem, pedido(relogio), ia)).rejects.toThrow("Processamento do arquivo excedeu o tempo limite.");
  });

  it("resposta que não serve: quem lê recusa com a frase do original", async () => {
    const quem = { tenantId: "t", documentosFinanceirosLiberados: true };
    await expect(lerNotaImagem(new Uint8Array([1]), "image/png", quem, { ia: simulada("desculpe, não consegui ler").ia })).rejects.toThrow(
      "Não foi possível identificar se é NF-e ou NFS-e no documento.",
    );
    await expect(lerNotaImagem(new Uint8Array([1]), "image/png", quem, { ia: simulada("").ia })).rejects.toThrow(
      "Não foi possível identificar se é NF-e ou NFS-e no documento.",
    );
    // E a chave desligada chega à tela como a frase adaptada do original.
    await expect(lerNotaImagem(new Uint8Array([1]), "image/png", { tenantId: "t" }, { ia: simulada().ia })).rejects.toThrow(LEITURA_DESLIGADA);
  });
});
