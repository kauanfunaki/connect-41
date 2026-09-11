import { describe, it, expect } from "vitest";
import {
  somarUsos,
  decidirProximoPasso,
  resultadoParaOModelo,
  CERCA_DO_RESULTADO,
  MAX_RODADAS,
  MAX_TOKENS_POR_EXECUCAO,
  MAX_CARACTERES_DO_RESULTADO,
  type EstadoDoLaco,
} from "./laco";

function estado(over: Partial<EstadoDoLaco> = {}): EstadoDoLaco {
  return { rodadas: 1, usos: [{ entrada: 100, saida: 50 }], pediuFerramenta: true, ...over };
}

describe("somarUsos", () => {
  it("soma entrada e saída de todas as rodadas", () => {
    expect(
      somarUsos([
        { entrada: 100, saida: 10 },
        { entrada: 200, saida: 20 },
      ])
    ).toEqual({ entrada: 300, saida: 30 });
  });

  it("execução sem rodada nenhuma soma zero", () => {
    expect(somarUsos([])).toEqual({ entrada: 0, saida: 0 });
  });

  // Uma rodada sem contagem torna o total desconhecido. Somar só as conhecidas
  // daria um número menor que o real, e um número menor que o real é pior que
  // nenhum número: ele passa no teto.
  it("uma rodada sem contagem contamina o total", () => {
    expect(somarUsos([{ entrada: 100, saida: 10 }, null])).toBeNull();
  });
});

describe("decidirProximoPasso", () => {
  it("modelo que não pediu ferramenta encerrou", () => {
    expect(decidirProximoPasso(estado({ pediuFerramenta: false }))).toEqual({ tipo: "concluir" });
  });

  it("pediu ferramenta e está dentro dos limites, continua", () => {
    expect(decidirProximoPasso(estado())).toEqual({ tipo: "continuar" });
  });

  // O limite é checado ANTES de continuar: checar depois deixaria passar
  // exatamente uma rodada a mais, que é a mais cara de todas porque carrega o
  // histórico inteiro.
  it("no limite de rodadas, trunca em vez de fazer mais uma", () => {
    const d = decidirProximoPasso(estado({ rodadas: MAX_RODADAS }));
    expect(d).toEqual({ tipo: "truncar", motivo: "rodadas" });
  });

  it("uma rodada antes do limite ainda continua", () => {
    expect(decidirProximoPasso(estado({ rodadas: MAX_RODADAS - 1 }))).toEqual({ tipo: "continuar" });
  });

  // Rodada não é unidade de custo: duas rodadas com um resultado gigante
  // custam mais que oito curtas.
  it("estoura por tokens mesmo com poucas rodadas", () => {
    const d = decidirProximoPasso(
      estado({ rodadas: 2, usos: [{ entrada: MAX_TOKENS_POR_EXECUCAO, saida: 0 }] })
    );
    expect(d).toEqual({ tipo: "truncar", motivo: "tokens" });
  });

  // Sem contagem de tokens, quem segura é o limite de rodadas — e ele precisa
  // continuar funcionando, senão um provedor que para de reportar uso derruba
  // a única proteção que sobrou.
  it("sem contagem de tokens, o limite de rodadas ainda segura", () => {
    expect(decidirProximoPasso(estado({ rodadas: 2, usos: [null, null] }))).toEqual({
      tipo: "continuar",
    });
    expect(decidirProximoPasso(estado({ rodadas: MAX_RODADAS, usos: [null] }))).toEqual({
      tipo: "truncar",
      motivo: "rodadas",
    });
  });

  // Truncar é sobre continuar, não sobre terminar: se o modelo já deu a
  // resposta final, o limite não tem nada a impedir.
  it("modelo que terminou conclui, mesmo estourado", () => {
    expect(
      decidirProximoPasso(estado({ rodadas: 99, pediuFerramenta: false, usos: [null] }))
    ).toEqual({ tipo: "concluir" });
  });
});

describe("resultadoParaOModelo", () => {
  it("a cerca vem colada no dado, toda vez", () => {
    expect(resultadoParaOModelo({ nome: "ACME" })).toContain(CERCA_DO_RESULTADO);
  });

  it("objeto vira JSON e string passa direto", () => {
    expect(resultadoParaOModelo({ a: 1 })).toContain('{"a":1}');
    expect(resultadoParaOModelo("texto puro")).toContain("texto puro");
  });

  it("nada vira null, e não quebra", () => {
    expect(resultadoParaOModelo(undefined)).toContain("null");
    expect(resultadoParaOModelo(null)).toContain("null");
  });

  // Uma consulta que volta com dez mil linhas entra no prompt de TODAS as
  // rodadas seguintes — é assim que uma ferramenta de leitura vira o vetor de
  // custo da execução.
  it("resultado enorme é cortado, e o corte é declarado", () => {
    const t = resultadoParaOModelo("x".repeat(MAX_CARACTERES_DO_RESULTADO * 2));
    expect(t).toContain("cortado por tamanho");
    expect(t.length).toBeLessThan(MAX_CARACTERES_DO_RESULTADO + CERCA_DO_RESULTADO.length + 100);
  });

  // A cerca precisa falar de ferramenta, não só de formato: o pedido perigoso
  // que vem num currículo não é "mude o formato", é "chame tal ferramenta".
  it("a cerca cobre pedido de usar ferramenta", () => {
    expect(CERCA_DO_RESULTADO).toContain("ferramenta");
  });
});
