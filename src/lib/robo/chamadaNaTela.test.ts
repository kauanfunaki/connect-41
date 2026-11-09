import { describe, expect, it } from "vitest";
import {
  CONFERENCIA_LENTA_MS,
  CONFERENCIA_RAPIDA_MS,
  TELA_DO_ROBO_LENTA_MS,
  TELA_DO_ROBO_RAPIDA_MS,
  avisoDoFim,
  chamaAPessoa,
  chaveDaSessao,
  ehFimDaChamada,
  horaDeAtualizar,
  intervaloDaConferencia,
  intervaloDaTelaDoRobo,
  marcasQueValem,
  naTelaDaTarefa,
  sessaoParaAbrir,
  sessoesParaReabrir,
  type SessaoNaTela,
} from "./chamadaNaTela";

const sessao = (n: number): SessaoNaTela => ({ chave: `s${n}:1`, tarefaId: `t${n}`, oQue: "Imprimir o alvará de Curitiba", empresa: null, ate: "2026-11-09T14:10:00.000Z" });
const A = sessao(1);
const B = sessao(2);

describe("intervaloDaConferencia (a janela do captcha no layout)", () => {
  it("rápida enquanto a pessoa tem tarefa na fila ou sessão aberta", () => {
    expect(intervaloDaConferencia({ naFila: true, sessoes: [] })).toBe(CONFERENCIA_RAPIDA_MS);
    expect(intervaloDaConferencia({ naFila: false, sessoes: [A] })).toBe(CONFERENCIA_RAPIDA_MS);
  });
  it("lenta no resto do tempo, e nunca menos de 30 s", () => {
    expect(intervaloDaConferencia({ naFila: false, sessoes: [] })).toBe(CONFERENCIA_LENTA_MS);
    expect(CONFERENCIA_LENTA_MS).toBeGreaterThanOrEqual(30_000);
  });
  it("a rápida é de poucos segundos, e não uma consulta por segundo", () => {
    expect(CONFERENCIA_RAPIDA_MS).toBeGreaterThanOrEqual(3_000);
    expect(CONFERENCIA_RAPIDA_MS).toBeLessThanOrEqual(10_000);
  });
});

describe("chamaAPessoa (quem a janela chama)", () => {
  const pediu = { requestedById: "u1" };
  it("quem pediu, desde o começo", () => {
    expect(chamaAPessoa({ escalatedAt: null }, pediu, { userId: "u1", doSetor: false })).toBe(true);
  });
  it("o setor só depois da escalada", () => {
    expect(chamaAPessoa({ escalatedAt: null }, pediu, { userId: "u2", doSetor: true })).toBe(false);
    expect(chamaAPessoa({ escalatedAt: new Date() }, pediu, { userId: "u2", doSetor: true })).toBe(true);
  });
  it("quem não é do setor nem pediu, nunca (admin incluído, como no sino)", () => {
    expect(chamaAPessoa({ escalatedAt: new Date() }, pediu, { userId: "u3", doSetor: false })).toBe(false);
  });
  it("tarefa sem quem pediu vai direto ao setor (já sai escalada)", () => {
    expect(chamaAPessoa({ escalatedAt: new Date() }, { requestedById: null }, { userId: "u2", doSetor: true })).toBe(true);
  });
  it("sem pessoa na sessão, ninguém é chamado", () => {
    expect(chamaAPessoa({ escalatedAt: null }, { requestedById: "" }, { userId: "", doSetor: true })).toBe(false);
  });
});

describe("chaveDaSessao", () => {
  it("o captcha que volta na mesma tentativa (mesma sessão, início novo) é chamada nova", () => {
    const id = "abc";
    expect(chaveDaSessao({ id, startedAt: new Date(1000) })).not.toBe(chaveDaSessao({ id, startedAt: new Date(2000) }));
  });
});

describe("sessaoParaAbrir e sessoesParaReabrir", () => {
  it("abre a primeira que a pessoa não fechou", () => {
    expect(sessaoParaAbrir([A, B], {}, "/licencas")).toBe(A);
    expect(sessaoParaAbrir([A, B], { [A.chave]: "depois" }, "/licencas")).toBe(B);
    expect(sessaoParaAbrir([A], { [A.chave]: "encerrada" }, "/licencas")).toBeNull();
  });
  it("não abre por cima da própria tela da tarefa", () => {
    expect(naTelaDaTarefa("/robo/assistir/t1", "t1")).toBe(true);
    expect(sessaoParaAbrir([A], {}, "/robo/assistir/t1")).toBeNull();
    expect(sessaoParaAbrir([A], {}, "/robo")).toBe(A);
  });
  it("reabrir lista só as deixadas para depois que ainda esperam", () => {
    expect(sessoesParaReabrir([A, B], { [A.chave]: "depois", [B.chave]: "encerrada" }, "/licencas")).toEqual([A]);
    expect(sessoesParaReabrir([A], { [A.chave]: "depois" }, "/robo/assistir/t1")).toEqual([]);
    expect(sessoesParaReabrir([A], {}, "/licencas")).toEqual([]);
  });
  it("marca de sessão que terminou cai fora", () => {
    expect(marcasQueValem({ [A.chave]: "depois", [B.chave]: "encerrada" }, [A])).toEqual({ [A.chave]: "depois" });
  });
});

describe("o fim da sessão", () => {
  it("só os estados que não pedem mais a pessoa fecham a janela", () => {
    for (const e of ["resolvida", "expirada", "encerrada", "sem_sessao"]) expect(ehFimDaChamada(e)).toBe(true);
    for (const e of ["aguardando_tela", "ao_vivo", "sem_sinal"]) expect(ehFimDaChamada(e)).toBe(false);
  });
  it("o aviso diz como terminou", () => {
    expect(avisoDoFim("resolvida")).toEqual({ texto: "Captcha resolvido. O robô seguiu sozinho.", tom: "success" });
    expect(avisoDoFim("expirada").texto).toContain("caminho do PDF");
    expect(avisoDoFim("encerrada").tom).toBe("info");
  });
});

describe("a tela do robô ao vivo", () => {
  it("rápida com tarefa na fila, em execução ou pedindo ajuda; devagar no resto", () => {
    expect(intervaloDaTelaDoRobo({ naFila: 1, pedindoAjuda: 0 })).toBe(TELA_DO_ROBO_RAPIDA_MS);
    expect(intervaloDaTelaDoRobo({ naFila: 0, pedindoAjuda: 1 })).toBe(TELA_DO_ROBO_RAPIDA_MS);
    expect(intervaloDaTelaDoRobo({ naFila: 0, pedindoAjuda: 0 })).toBe(TELA_DO_ROBO_LENTA_MS);
    expect(TELA_DO_ROBO_RAPIDA_MS).toBeLessThan(TELA_DO_ROBO_LENTA_MS);
  });
  it("só atualiza com a aba à vista e passado o intervalo", () => {
    expect(horaDeAtualizar(0, 5_000, true, 5_000)).toBe(true);
    expect(horaDeAtualizar(0, 4_999, true, 5_000)).toBe(false);
    expect(horaDeAtualizar(0, 60_000, false, 5_000)).toBe(false);
  });
});
