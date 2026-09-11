import { describe, it, expect } from "vitest";
import {
  fracaoDoTeto,
  resumoDoGasto,
  desfechoDaChamada,
  SAUDE_LABEL,
  SAUDE_VARIANTE,
  SAUDE_EXPLICACAO,
} from "./tela";
import type { SaudeDoAgente } from "./execucao";

const AGORA = new Date("2026-09-11T12:00:00Z");

const TODAS: SaudeDoAgente[] = [
  "desligado",
  "sem_chave",
  "nunca_usado",
  "ok",
  "custo_desconhecido",
  "perto_do_teto",
  "no_teto",
];

describe("mapas de saúde", () => {
  it("todo estado tem rótulo, cor e explicação", () => {
    for (const s of TODAS) {
      expect(SAUDE_LABEL[s]).toBeTruthy();
      expect(SAUDE_VARIANTE[s]).toBeTruthy();
      expect(SAUDE_EXPLICACAO[s]).toBeTruthy();
    }
  });

  // A decisão da tela: um total que não significa nada precisa parecer
  // problema, senão quem olha lê o número tranquilo e segue em frente.
  it("custo não apurado é aviso, não informação neutra", () => {
    expect(SAUDE_VARIANTE.custo_desconhecido).toBe("warning");
  });

  it("no teto é o único vermelho", () => {
    expect(TODAS.filter((s) => SAUDE_VARIANTE[s] === "danger")).toEqual(["no_teto"]);
  });
});

describe("fracaoDoTeto", () => {
  const gasto = (centavos: number, chamadas: number) => ({ centavos, chamadas, semCusto: 0 });

  it("vazio é zero", () => {
    expect(fracaoDoTeto(gasto(0, 0), 10_000, 1_000)).toBe(0);
  });

  // Mostrar a média daria barra tranquila num agente prestes a parar.
  it("vale a maior das duas frações, não a média", () => {
    // 10% do teto em reais, 90% do de chamadas.
    expect(fracaoDoTeto(gasto(1_000, 900), 10_000, 1_000)).toBeCloseTo(0.9);
  });

  it("nunca passa de 1, mesmo estourado", () => {
    expect(fracaoDoTeto(gasto(50_000, 9_999), 10_000, 1_000)).toBe(1);
  });

  // Teto zero é "não gaste nada". Dividir por zero daria Infinity ou NaN, e
  // NaN vira barra em branco — o agente travado pareceria o mais folgado.
  it("teto zero conta como cheio", () => {
    expect(fracaoDoTeto(gasto(0, 0), 0, 1_000)).toBe(1);
    expect(fracaoDoTeto(gasto(0, 0), 10_000, 0)).toBe(1);
  });
});

describe("resumoDoGasto", () => {
  it("mês sem chamada diz isso", () => {
    expect(resumoDoGasto({ centavos: 0, chamadas: 0, semCusto: 0 })).toBe("nenhuma chamada");
  });

  it("uma chamada não vira plural", () => {
    expect(resumoDoGasto({ centavos: 120, chamadas: 1, semCusto: 0 })).toContain("1 chamada");
    expect(resumoDoGasto({ centavos: 120, chamadas: 1, semCusto: 0 })).not.toContain("chamadas");
  });

  // "R$ 3,50" e "R$ 3,50 + 12 sem custo apurado" são afirmações diferentes, e
  // só a segunda é verdadeira quando há chamada sem preço.
  it("custo não apurado aparece junto do número, não escondido", () => {
    const t = resumoDoGasto({ centavos: 350, chamadas: 30, semCusto: 12 });
    expect(t).toContain("12 sem custo apurado");
  });

  it("sem pendência, o total fala sozinho", () => {
    expect(resumoDoGasto({ centavos: 350, chamadas: 30, semCusto: 0 })).not.toContain("apurado");
  });
});

describe("desfechoDaChamada", () => {
  const linha = (over: Partial<{ ok: boolean | null; finishedAt: Date | null; startedAt: Date }>) => ({
    ok: null,
    finishedAt: null,
    startedAt: AGORA,
    ...over,
  });

  it("encerrada com sucesso e com falha", () => {
    expect(desfechoDaChamada(linha({ ok: true, finishedAt: AGORA }), AGORA)).toBe("ok");
    expect(desfechoDaChamada(linha({ ok: false, finishedAt: AGORA }), AGORA)).toBe("erro");
  });

  it("aberta há pouco ainda está rodando", () => {
    const agora = new Date(AGORA.getTime() + 60_000);
    expect(desfechoDaChamada(linha({}), agora)).toBe("em_andamento");
  });

  // O terceiro estado, que é o ponto: chamar de "falhou" esconderia que
  // ninguém a encerrou — e é isso que sinaliza processo derrubado no meio.
  it("aberta há muito tempo é sem desfecho, não falha", () => {
    const agora = new Date(AGORA.getTime() + 60 * 60_000);
    expect(desfechoDaChamada(linha({}), agora)).toBe("abandonada");
  });
});
