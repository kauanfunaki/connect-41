import { describe, expect, test } from "vitest";
import { dec, texto } from "./decimal";
import { agruparPendencias, conferirComposicao, valorDoComponente } from "./fila";

const p = (id: string, historico: string, valor: string, data: string, dc = "D", agenciaId = "a1") => ({ id, historico, dc, valor: dec(valor), data, agenciaId });

describe("fila agrupada do NEO", () => {
  test("agrupa pelo padrão (sem números e letras soltas) e pelo lado, com o rótulo mais frequente", () => {
    const grupos = agruparPendencias([
      p("1", "PIX EMITIDO OUTRA IF 123 JOAO", "10.00", "2026-01-05"),
      p("2", "PIX EMITIDO OUTRA IF 456 MARIA", "20.00", "2026-01-03", "D", "a2"),
      p("3", "PIX EMITIDO OUTRA IF 456 MARIA", "5.00", "2026-01-09"),
      p("4", "PIX EMITIDO OUTRA IF", "7.00", "2026-01-04", "C"),
      p("5", "TARIFA", "1.00", "2026-01-01"),
    ]);
    expect(grupos.map((g) => [g.padrao, g.dc, g.quantidade])).toEqual([
      ["pix emitido outra", "D", 3],
      ["pix emitido outra", "C", 1],
      ["tarifa", "D", 1],
    ]);
    expect(grupos[0]).toMatchObject({ rotulo: "PIX EMITIDO OUTRA IF 456 MARIA", dataInicio: "2026-01-03", dataFim: "2026-01-09", agenciaIds: ["a1", "a2"], transacaoIds: ["1", "2", "3"] });
    expect(texto(grupos[0].valorTotal)).toBe("35.00");
  });

  test("empate de quantidade: maior valor primeiro", () => {
    const grupos = agruparPendencias([p("1", "AAA", "1.00", "2026-01-01"), p("2", "BBB", "9.00", "2026-01-01")]);
    expect(grupos.map((g) => g.padrao)).toEqual(["bbb", "aaa"]);
  });
});

describe("composição manual (ADR-017)", () => {
  const c = (valor: string, historico = "JUROS") => ({ contaId: "x", historico, valor: dec(valor) });

  test("a soma tem de fechar exatamente o valor da transação", () => {
    expect(conferirComposicao([c("100.00"), c("23.45")], dec("123.45"))).toBeNull();
    expect(conferirComposicao([c("100.00"), c("23.44")], dec("123.45"))).toBe("A soma dos componentes deve ser igual ao valor da transação.");
    expect(conferirComposicao([], dec("1"))).toBe("Informe ao menos um componente.");
    expect(conferirComposicao([c("1.00", "x")], dec("1"))).toMatch(/histórico de 2 a 500/);
  });

  test("valor do componente: positivo, no máximo dois decimais, com vírgula ou ponto", () => {
    expect(texto(valorDoComponente("1.234,56")!)).toBe("1234.56");
    expect(texto(valorDoComponente("10.5")!)).toBe("10.5");
    expect(valorDoComponente("0")).toBeNull();
    expect(valorDoComponente("-5")).toBeNull();
    expect(valorDoComponente("1,234")).toBeNull();
    expect(valorDoComponente("abc")).toBeNull();
  });
});
