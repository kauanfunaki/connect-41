import { describe, it, expect } from "vitest";
import { finalizarExecucao, saudeDaIntegracao, podeExecutar } from "./execucao";
import {
  INTEGRATION_CATALOG,
  integracaoDoCatalogo,
  camposFaltando,
  mesclarConfig,
  configParaTela,
  segredosPreenchidos,
} from "./catalogo";

const AGORA = new Date("2026-09-11T12:00:00Z");

describe("finalizarExecucao", () => {
  // A regra que já falhou uma vez em produção, em 10/09: o `lastError` do SPED
  // só era limpo num caminho específico, e 25 raízes saudáveis exibiram por
  // dias um 403 que não existia mais.
  it("sucesso limpa o erro anterior", () => {
    const g = finalizarExecucao({ ok: true }, AGORA);
    expect(g.integracao.lastError).toBeNull();
    expect(g.run.ok).toBe(true);
  });

  it("sucesso SEM NADA A FAZER também limpa — é o caso que quebrou antes", () => {
    const g = finalizarExecucao({ ok: true, counters: { documentos: 0 } }, AGORA);
    expect(g.integracao.lastError).toBeNull();
    expect(g.run.counters).toEqual({ documentos: 0 });
  });

  it("falha grava a mensagem nos dois lados", () => {
    const g = finalizarExecucao({ ok: false, erro: "401 no Omie" }, AGORA);
    expect(g.integracao.lastError).toBe("401 no Omie");
    expect(g.run.error).toBe("401 no Omie");
    expect(g.run.ok).toBe(false);
  });

  it("erro vazio não vira string vazia — vira causa nomeada", () => {
    const g = finalizarExecucao({ ok: false, erro: "" }, AGORA);
    expect(g.integracao.lastError).toBe("falha desconhecida");
  });

  it("erro longo é cortado no limite da coluna", () => {
    const g = finalizarExecucao({ ok: false, erro: "x".repeat(900) }, AGORA);
    expect(g.integracao.lastError).toHaveLength(500);
  });

  it("cursor avança no sucesso", () => {
    const g = finalizarExecucao({ ok: true }, AGORA, { cursor: "abc", watermark: "2026-09-01" });
    expect(g.integracao.cursor).toBe("abc");
    expect(g.integracao.watermark).toBe("2026-09-01");
  });

  // Avançar cursor sobre falha é como se pula lote: a próxima rodada retomaria
  // de um ponto que ninguém processou.
  it("cursor NÃO avança na falha, mesmo se oferecido", () => {
    const g = finalizarExecucao({ ok: false, erro: "timeout" }, AGORA, { cursor: "abc" });
    expect(g.integracao.cursor).toBeUndefined();
  });

  it("sem avanço oferecido, o cursor nem é tocado", () => {
    const g = finalizarExecucao({ ok: true }, AGORA);
    expect("cursor" in g.integracao).toBe(false);
  });
});

describe("saudeDaIntegracao", () => {
  const base = { enabled: true, lastRunAt: AGORA, lastError: null };

  it("desligada ganha de tudo — não é erro, é escolha do cliente", () => {
    expect(saudeDaIntegracao({ ...base, enabled: false, lastError: "x" }, AGORA)).toBe("desligada");
  });

  it("erro na última execução", () => {
    expect(saudeDaIntegracao({ ...base, lastError: "401" }, AGORA)).toBe("com_erro");
  });

  it("ligada e nunca executada é estado próprio", () => {
    expect(saudeDaIntegracao({ ...base, lastRunAt: null }, AGORA)).toBe("nunca_rodou");
  });

  it("rodou agora está ok", () => {
    expect(saudeDaIntegracao(base, AGORA)).toBe("ok");
  });

  // O silêncio é a falha que não levanta a mão — no SPED apareceu como um 200
  // em 0,11s por três dias.
  it("ligada, sem erro e sem rodar há tempo demais é PARADA, não ok", () => {
    const doisDiasAtras = new Date(AGORA.getTime() - 48 * 3_600_000);
    expect(saudeDaIntegracao({ ...base, lastRunAt: doisDiasAtras }, AGORA)).toBe("parada");
  });

  it("a janela do silêncio é configurável por integração", () => {
    const seisHorasAtras = new Date(AGORA.getTime() - 6 * 3_600_000);
    expect(saudeDaIntegracao({ ...base, lastRunAt: seisHorasAtras }, AGORA, 24)).toBe("ok");
    expect(saudeDaIntegracao({ ...base, lastRunAt: seisHorasAtras }, AGORA, 1)).toBe("parada");
  });
});

describe("podeExecutar", () => {
  it("tudo pronto, pode", () => {
    expect(podeExecutar({ enabled: true, camposFaltando: [], temAdaptador: true }).pode).toBe(true);
  });

  it("desligada não roda, e o motivo diz que foi escolha", () => {
    const r = podeExecutar({ enabled: false, camposFaltando: [], temAdaptador: true });
    expect(r.pode).toBe(false);
    expect(r.motivo).toContain("desligada");
  });

  // Chamar o sistema de fora sem credencial gera um 401 que parece problema do
  // terceiro e não é.
  it("configuração incompleta nomeia o campo que falta", () => {
    const r = podeExecutar({ enabled: true, camposFaltando: ["App Secret"], temAdaptador: true });
    expect(r.pode).toBe(false);
    expect(r.motivo).toContain("App Secret");
  });

  it("sem adaptador não roda", () => {
    expect(podeExecutar({ enabled: true, camposFaltando: [], temAdaptador: false }).pode).toBe(false);
  });
});

describe("catálogo", () => {
  const omie = integracaoDoCatalogo("omie")!;

  it("o Omie é o plugin piloto, e nasce desligado", () => {
    expect(omie).not.toBeNull();
    // Ligar significa falar com terceiro usando credencial de alguém — é ato
    // deliberado, nunca padrão.
    for (const i of INTEGRATION_CATALOG) expect(i.defaultEnabled).toBe(false);
  });

  it("código desconhecido devolve null em vez de explodir", () => {
    expect(integracaoDoCatalogo("nao_existe")).toBeNull();
  });

  it("campo obrigatório em branco conta como faltando", () => {
    expect(camposFaltando(omie, {})).toEqual(["App Key", "App Secret"]);
    expect(camposFaltando(omie, { appKey: "   ", appSecret: "s" })).toEqual(["App Key"]);
    expect(camposFaltando(omie, { appKey: "k", appSecret: "s" })).toEqual([]);
  });

  // Sem a mescla, editar o rótulo de uma conexão apagaria a senha dela — e o
  // erro só apareceria na próxima execução, como falha de autenticação.
  it("segredo em branco no formulário preserva o que já estava salvo", () => {
    const salvo = { appKey: "k-antiga", appSecret: "s-antiga" };
    const doForm = { appKey: "k-nova", appSecret: "" };
    expect(mesclarConfig(omie, salvo, doForm)).toEqual({
      appKey: "k-nova",
      appSecret: "s-antiga",
    });
  });

  it("segredo digitado de novo substitui", () => {
    const r = mesclarConfig(omie, { appSecret: "velha" }, { appKey: "k", appSecret: "nova" });
    expect(r.appSecret).toBe("nova");
  });

  it("a tela nunca recebe o segredo de volta", () => {
    const t = configParaTela(omie, { appKey: "k-visivel", appSecret: "s-secreta" });
    expect(t.appKey).toBe("k-visivel");
    expect(t.appSecret).toBe("");
  });

  it("mas a tela sabe que existe segredo guardado", () => {
    expect(segredosPreenchidos(omie, { appSecret: "s" })).toEqual(["appSecret"]);
    expect(segredosPreenchidos(omie, { appSecret: "" })).toEqual([]);
  });
});
