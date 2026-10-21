import { describe, it, expect } from "vitest";
import { lerLinhaDigitavel, vencimentoDoFator, formatarLinhaDigitavel, dvModulo10 } from "./boleto";

// Os números de referência saíram de uma segunda implementação, escrita à parte
// em Python (19/10), e não desta — um teste que gera a resposta com a mesma
// função que testa só prova que ela concorda consigo mesma. Boletos fictícios:
// Itaú (341), vencimento 30/10/2026, R$ 1.234,56; arrecadação de saneamento
// (segmento 2) de R$ 123,45.
const LINHA_BANCARIA = "34191091233456781234156789000009516150000123456";
const BARRAS_BANCARIO = "34195161500001234561091234567812345678900000";
const LINHA_ARRECADACAO_MOD10 = "826800000018234501232024610309876544321012345674";
const BARRAS_ARRECADACAO_MOD10 = "82680000001234501232026103098765432101234567";
const LINHA_ARRECADACAO_MOD11 = "828000000010234501232025610309876546321012345670";

const HOJE = "2026-10-19";

/** Troca um dígito (soma 1, de 9 vai a 0). */
function trocar(s: string, i: number): string {
  return s.slice(0, i) + String((Number(s[i]) + 1) % 10) + s.slice(i + 1);
}

describe("lerLinhaDigitavel — boleto bancário", () => {
  it("lê banco, valor e vencimento da linha de 47 dígitos", () => {
    const r = lerLinhaDigitavel(LINHA_BANCARIA, HOJE);
    expect(r).toMatchObject({ ok: true, tipo: "bancario", banco: "341", valorCentavos: 123456, vencimentoKey: "2026-10-30", codigoDeBarras: BARRAS_BANCARIO });
  });

  it("aceita a linha como vem impressa, com pontos e espaços", () => {
    const impressa = formatarLinhaDigitavel(LINHA_BANCARIA);
    expect(impressa).toBe("34191.09123 34567.812341 56789.000009 5 16150000123456");
    expect(lerLinhaDigitavel(impressa, HOJE)).toMatchObject({ ok: true, valorCentavos: 123456 });
  });

  it("lê o código de barras de 44 dígitos e devolve a linha", () => {
    const r = lerLinhaDigitavel(BARRAS_BANCARIO, HOJE);
    expect(r).toMatchObject({ ok: true, tipo: "bancario", linhaDigitavel: LINHA_BANCARIA, valorCentavos: 123456, vencimentoKey: "2026-10-30" });
  });

  it("recusa qualquer dígito trocado, em qualquer posição da linha", () => {
    for (let i = 0; i < LINHA_BANCARIA.length; i++) {
      expect(lerLinhaDigitavel(trocar(LINHA_BANCARIA, i), HOJE).ok, `posição ${i}`).toBe(false);
    }
  });

  it("recusa qualquer dígito trocado no código de barras", () => {
    for (let i = 0; i < BARRAS_BANCARIO.length; i++) {
      expect(lerLinhaDigitavel(trocar(BARRAS_BANCARIO, i), HOJE).ok, `posição ${i}`).toBe(false);
    }
  });

  it("diz qual campo não fecha", () => {
    expect(lerLinhaDigitavel(trocar(LINHA_BANCARIA, 12), HOJE)).toEqual({ ok: false, erro: "O 2º campo da linha digitável não fecha o dígito verificador." });
  });

  it("recusa tamanho que não é de boleto, dizendo quantos dígitos chegaram", () => {
    expect(lerLinhaDigitavel("123", HOJE)).toMatchObject({ ok: false });
    expect(lerLinhaDigitavel("", HOJE)).toEqual({ ok: false, erro: "Sem linha digitável." });
  });
});

describe("vencimentoDoFator", () => {
  it("bate com as datas conhecidas do ciclo antigo", () => {
    expect(vencimentoDoFator(1000, "2000-07-01")).toBe("2000-07-03");
    expect(vencimentoDoFator(9999, "2025-02-20")).toBe("2025-02-21");
  });

  it("depois de 22/02/2025, o fator 1000 recomeça a contagem", () => {
    expect(vencimentoDoFator(1000, "2025-02-22")).toBe("2025-02-22");
    expect(vencimentoDoFator(1615, HOJE)).toBe("2026-10-30");
  });

  it("um boleto antigo, lido antes da virada, continua no ciclo antigo", () => {
    expect(vencimentoDoFator(9000, "2022-01-01")).toBe(vencimentoDoFator(9000, "2022-06-01"));
    expect(vencimentoDoFator(9000, "2022-01-01")!.startsWith("2022")).toBe(true);
  });

  it("fator 0000 é boleto sem vencimento", () => {
    expect(vencimentoDoFator(0, HOJE)).toBeNull();
  });
});

describe("lerLinhaDigitavel — arrecadação (concessionária e tributo)", () => {
  it("lê o valor efetivo da linha de 48 dígitos, módulo 10", () => {
    const r = lerLinhaDigitavel(LINHA_ARRECADACAO_MOD10, HOJE);
    expect(r).toMatchObject({ ok: true, tipo: "arrecadacao", valorCentavos: 12345, vencimentoKey: null, codigoDeBarras: BARRAS_ARRECADACAO_MOD10 });
  });

  it("lê a linha de 48 dígitos em módulo 11", () => {
    expect(lerLinhaDigitavel(LINHA_ARRECADACAO_MOD11, HOJE)).toMatchObject({ ok: true, tipo: "arrecadacao", valorCentavos: 12345 });
  });

  it("lê o código de barras de arrecadação e monta a linha", () => {
    expect(lerLinhaDigitavel(BARRAS_ARRECADACAO_MOD10, HOJE)).toMatchObject({ ok: true, linhaDigitavel: LINHA_ARRECADACAO_MOD10 });
  });

  it("recusa qualquer dígito trocado na linha de arrecadação", () => {
    for (const linha of [LINHA_ARRECADACAO_MOD10, LINHA_ARRECADACAO_MOD11]) {
      for (let i = 0; i < linha.length; i++) {
        expect(lerLinhaDigitavel(trocar(linha, i), HOJE).ok, `posição ${i}`).toBe(false);
      }
    }
  });

  it("valor de referência (identificador 7 ou 9) não vira valor em reais", () => {
    // Mesmo corpo do boleto de módulo 10, com o identificador 7 e os DVs refeitos.
    const corpo = "827" + BARRAS_ARRECADACAO_MOD10.slice(4);
    const barras = corpo.slice(0, 3) + dvModulo10(corpo) + corpo.slice(3);
    expect(lerLinhaDigitavel(barras, HOJE)).toMatchObject({ ok: true, tipo: "arrecadacao", valorCentavos: null });
  });

  it("formata a linha de arrecadação em quatro blocos", () => {
    expect(formatarLinhaDigitavel(LINHA_ARRECADACAO_MOD10)).toBe("82680000001-8 23450123202-4 61030987654-4 32101234567-4");
  });
});
