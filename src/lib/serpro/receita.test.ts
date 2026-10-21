import { describe, expect, it } from "vitest";
import { corpoDoPedido, lerResposta, tagDaRequisicao, type RespostaLida } from "./regras";
import { eventoNovo, gruposDeEventos, lerMatriz, lerSolicitacao, lerTipoDoPedido, pedidoDeObtencao, pedidoDeSolicitacao, tipoDoPedido } from "./eventos";
import { instanteDaReceita, lerDetalhe, lerIndicador, lerLista, montarAssunto, montarCorpo, pedidoDaLista, pedidoDoIndicador } from "./caixaPostal";
import { ESPERA_DO_PROTOCOLO_EM_CACHE_MS, FOLGA_MS, nomeDoRelatorio, passoDoProtocolo, passoDoRelatorio, pedidoDoProtocolo } from "./sitfis";
import type { ResultadoDaChamada } from "./cliente";
import { PDF_FICTICIO, type RespostaDoTrial } from "./servicos.fixture";
import {
  DETALHE_DA_CAIXA_POSTAL,
  INDICADOR_DA_CAIXA_POSTAL,
  LISTA_DA_CAIXA_POSTAL,
  MATRIZ_DE_EVENTOS,
  PROTOCOLO_DO_SITFIS,
  RELATORIO_DO_SITFIS,
  SOLICITACAO_DE_EVENTOS,
} from "./receita.fixture";

// A Fase 1 do Integra Contador (20/10/2026): Eventos de Atualização, Caixa
// Postal e Sitfis, contra as respostas da demonstração do Serpro.

const lida = (r: RespostaDoTrial): RespostaLida => lerResposta(r.status, r.corpo);
/** O resultado da chamada como o `chamarSerpro` devolveria. */
const deu = (status: number, corpo = "", cabecalhos: Record<string, string> = {}, tempoEsperaMs: number | null = null): ResultadoDaChamada => ({
  ok: true,
  resposta: lerResposta(status, corpo),
  cabecalhos,
  tempoEsperaMs,
});
const falhou = (status: number | null, corpo = "", motivo: "falha" | "rede" | "teto" = "falha"): ResultadoDaChamada => ({
  ok: false,
  motivo,
  erro: `falhou ${status}`,
  status,
  ...(status !== null ? { resposta: lerResposta(status, corpo) } : {}),
});

describe("o pedido", () => {
  it("dados vazio vai como texto vazio, como pedem o Apoiar do Sitfis e o indicador", () => {
    expect(corpoDoPedido(pedidoDoProtocolo("99999999999"), "1", "1").pedidoDados.dados).toBe("");
    expect(corpoDoPedido(pedidoDoIndicador("11222333000181"), "1", "1").pedidoDados).toMatchObject({ idServico: "INNOVAMSG63", versaoSistema: "1.0", dados: "" });
    expect(corpoDoPedido(pedidoDoProtocolo("99999999999"), "1", "1").pedidoDados.versaoSistema).toBe("2.0");
    expect(JSON.parse(corpoDoPedido(pedidoDaLista("11222333000181"), "1", "1").pedidoDados.dados)).toEqual({ statusLeitura: "2", indicadorPagina: "0" });
  });

  it("no lote dos eventos, o contribuinte é a lista, tipo 4 (CNPJ) ou 3 (CPF), e o obter vai vazio", () => {
    const [pj] = gruposDeEventos(["11.222.333/0001-81", "33444555000101"]);
    const pedido = pedidoDeSolicitacao("E0601", pj);
    expect(pedido.contribuinte).toBe("lote:2");
    expect(corpoDoPedido(pedido, "1", "1")).toMatchObject({
      contribuinte: { numero: "11222333000181,33444555000101", tipo: 4 },
      pedidoDados: { idSistema: "EVENTOSATUALIZACAO", idServico: "SOLICEVENTOSPJ132", dados: '{"evento":"E0601"}' },
    });
    expect(corpoDoPedido(pedidoDeObtencao("E0601", "PF", "abc"), "1", "1")).toMatchObject({
      contribuinte: { numero: "", tipo: 3 },
      pedidoDados: { idServico: "OBTEREVENTOSPF133", dados: '{"protocolo":"abc","evento":"E0601"}' },
    });
    // A tag do lote: o tipo da lista e zeros no lugar do contribuinte.
    expect(tagDaRequisicao("11222333000181", { tipo: 4, numero: "" }, 60)).toBe("21122233300018140000000000000060");
  });

  it("separa CPF e CNPJ, de até 1.000, sem repetir nem documento inválido de tamanho", () => {
    const cnpjs = Array.from({ length: 1500 }, (_, i) => String(10000000000000 + i));
    const grupos = gruposDeEventos([...cnpjs, "52998224725", "52998224725", "123"]);
    expect(grupos.map((g) => [g.tipo, g.documentos.length])).toEqual([
      ["PJ", 1000],
      ["PJ", 500],
      ["PF", 1],
    ]);
  });
});

describe("os Eventos de Atualização", () => {
  it("lê o protocolo mesmo do `dados` cortado da demonstração, com a espera mínima e a folga", () => {
    expect(lerSolicitacao(lida(SOLICITACAO_DE_EVENTOS))).toEqual({ ok: true, dados: { protocolo: "q90n3455-fa91-419c-c0ad-a4ms50215acl", esperaMs: 5000 } });
    expect(lerSolicitacao(lerResposta(200, JSON.stringify({ dados: JSON.stringify({ protocolo: "p1", TempoEsperaMedioEmMs: 8000 }) })))).toEqual({
      ok: true,
      dados: { protocolo: "p1", esperaMs: 10000 },
    });
    expect(lerSolicitacao(lerResposta(429, ""))).toMatchObject({ ok: false });
  });

  it("lê a matriz: dia, nada, e o \"x\" de quem não tem autorização", () => {
    expect(lerMatriz(lida(MATRIZ_DE_EVENTOS))).toEqual({
      tipo: "pronto",
      linhas: [
        { documento: "00000000000000", ultimoEm: null, semAcesso: false },
        { documento: "11111111111111", ultimoEm: "2023-03-27", semAcesso: false },
        { documento: "22222222222222", ultimoEm: "2023-03-28", semAcesso: false },
        { documento: "33333333333333", ultimoEm: null, semAcesso: true },
      ],
    });
    expect(lerMatriz(lerResposta(202, ""))).toEqual({ tipo: "processando" });
  });

  it("evento novo: um dia mais recente, ou o primeiro que aparece", () => {
    expect(eventoNovo(null, "2026-10-19")).toBe(true);
    expect(eventoNovo("2026-10-19", "2026-10-20")).toBe(true);
    expect(eventoNovo("2026-10-20", "2026-10-20")).toBe(false);
    expect(eventoNovo("2026-10-20", null)).toBe(false);
  });

  it("o tipo do pedido vai e volta", () => {
    expect(lerTipoDoPedido(tipoDoPedido("E0701", "PF"))).toEqual({ evento: "E0701", tipo: "PF" });
    expect(lerTipoDoPedido("SITFIS")).toBeNull();
  });
});

describe("a Caixa Postal", () => {
  it("o indicador: 2 = várias mensagens novas", () => {
    expect(lerIndicador(lida(INDICADOR_DA_CAIXA_POSTAL))).toEqual({ ok: true, dados: { novas: 2 } });
  });

  it("a lista: assunto montado, data em Brasília, relevância e ciência", () => {
    const r = lerLista(lida(LISTA_DA_CAIXA_POSTAL));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.dados.ultimaPagina).toBe(false);
    expect(r.dados.mensagens).toHaveLength(3);
    expect(r.dados.mensagens[1]).toEqual({
      isn: "0001493188",
      assunto: "Notificação de recebimento de mensagem e-MAC - Mensagem nº 083549 (nova)",
      enviadaEm: new Date("2022-08-02T16:02:16-03:00"),
      relevante: true,
      origem: "RECEITA FEDERAL DO BRASIL",
      numeroControle: "2022/000000000018084",
      validaAte: new Date("2022-11-01T12:00:00-03:00"),
      cienciaEm: new Date("2022-08-17T12:00:00-03:00"),
      lida: false,
    });
  });

  it("o detalhe: o corpo com as variáveis, escapadas e sem script", () => {
    const r = lerDetalhe(lida(DETALHE_DA_CAIXA_POSTAL));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.dados.assunto).toBe("[e-Processo] Dossiê: 11111.111111/2022-11 - Abertura do Dossiê de Atendimento através do Chat RFB");
    expect(r.dados.corpo).toContain("Chat RFB");
    expect(r.dados.corpo).toContain("202200000263");
    expect(r.dados.corpo).not.toMatch(/\+\+\d+\+\+/);
    expect(montarCorpo("<p>Olá ++1++</p><script>alert(1)</script>", ["<b>x</b>"])).toBe("<p>Olá &lt;b&gt;x&lt;/b&gt;</p>");
    expect(montarAssunto("Declaração do exercício ++VARIAVEL++ processada", "2023")).toBe("Declaração do exercício 2023 processada");
    expect(instanteDaReceita("")).toBeNull();
  });

  it("o 200 com ERRO não é lista nem mensagem", () => {
    const erro = lerResposta(200, JSON.stringify({ mensagens: [{ codigo: "ERRO", texto: "Dados inválidos." }] }));
    expect(lerLista(erro)).toMatchObject({ ok: false });
    expect(lerIndicador(erro)).toMatchObject({ ok: false });
  });
});

describe("o Sitfis, passo a passo", () => {
  const protocolo = lida(PROTOCOLO_DO_SITFIS);

  it("protocolo: emitir depois do tempo de espera, com folga", () => {
    expect(passoDoProtocolo({ ok: true, resposta: protocolo, cabecalhos: {}, tempoEsperaMs: null })).toEqual({
      tipo: "emitir",
      protocolo: "PROTOCOLO-FICTICIO-DO-SITFIS",
      esperaMs: 4000 + FOLGA_MS,
    });
  });

  it("304: o protocolo de hoje vem do ETag, e a espera é a longa (não se sabe quanto falta)", () => {
    expect(passoDoProtocolo(deu(304, "", { etag: '"protocoloRelatorio:+S7N/ab=="' }))).toEqual({ tipo: "emitir", protocolo: "+S7N/ab==", esperaMs: ESPERA_DO_PROTOCOLO_EM_CACHE_MS });
  });

  it("AV02 (200 sem protocolo) e 503: pedir de novo depois do tempo", () => {
    const av02 = JSON.stringify({ dados: JSON.stringify({ tempoEspera: 30000 }), mensagens: [{ codigo: "[Aviso-Sitfis-AV02]", texto: "" }] });
    expect(passoDoProtocolo(deu(200, av02))).toEqual({ tipo: "pedir_de_novo", esperaMs: 30000 + FOLGA_MS });
    expect(passoDoProtocolo(falhou(503, JSON.stringify({ dados: JSON.stringify({ tempoEspera: 9000 }) })))).toEqual({ tipo: "pedir_de_novo", esperaMs: 9000 + FOLGA_MS });
  });

  it("relatório: 200 = PDF; 204 = espera do ETag, grátis; 202 = espera do corpo, cobrado", () => {
    expect(passoDoRelatorio({ ok: true, resposta: lida(RELATORIO_DO_SITFIS), cabecalhos: {}, tempoEsperaMs: null })).toEqual({ tipo: "pronto", pdf: PDF_FICTICIO });
    expect(passoDoRelatorio(deu(204, "", { etag: '"tempoEspera:6000"' }, 6000))).toEqual({ tipo: "aguardar", esperaMs: 6000 + FOLGA_MS, cobrado: false });
    expect(passoDoRelatorio(deu(202, JSON.stringify({ dados: JSON.stringify({ tempoEspera: 3000 }) })))).toEqual({ tipo: "aguardar", esperaMs: 3000 + FOLGA_MS, cobrado: true });
  });

  it("falhas: rede, 429, 504 e 500 tentam de novo; teto e 403 não", () => {
    expect(passoDoRelatorio(falhou(null, "", "rede"))).toMatchObject({ tipo: "erro", tentarDeNovo: true });
    for (const s of [429, 504, 500]) expect(passoDoRelatorio(falhou(s)), String(s)).toMatchObject({ tipo: "erro", tentarDeNovo: true });
    expect(passoDoRelatorio(falhou(null, "", "teto"))).toMatchObject({ tipo: "erro", tentarDeNovo: false });
    expect(passoDoRelatorio(falhou(403))).toMatchObject({ tipo: "erro", tentarDeNovo: false });
  });

  it("o nome do PDF nos Arquivos", () => {
    expect(nomeDoRelatorio('Empresa / Fictícia: "Ltda"', "2026-10-20")).toBe("Situação fiscal - Empresa Fictícia Ltda - 2026-10-20.pdf");
  });
});
